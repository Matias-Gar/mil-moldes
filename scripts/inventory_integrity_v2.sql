-- Inventario transaccional v2 para Mil Moldes.
-- Aplicar primero en staging. No corrige snapshots ni reescribe el ledger.
begin;

create extension if not exists pgcrypto;

alter table public.stock_movimientos
  add column if not exists correlation_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists transaction_id bigint,
  add column if not exists factor_conversion numeric,
  add column if not exists unidad_base text,
  add column if not exists resultado text not null default 'aplicado',
  add column if not exists error_message text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.productos
  add column if not exists archivado boolean not null default false,
  add column if not exists archivado_at timestamptz,
  add column if not exists archivado_por uuid,
  add column if not exists archivado_motivo text;

create table if not exists public.inventory_idempotency (
  key text primary key,
  operation text not null,
  request_hash text not null,
  response jsonb,
  usuario_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.inventory_rejected_attempts (
  id bigint generated always as identity primary key,
  operation text not null,
  producto_id bigint,
  variante_id bigint,
  cantidad numeric,
  unidad text,
  usuario_id uuid,
  usuario_email text,
  resultado text not null default 'rechazado',
  error_code text,
  error_message text,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.business_audit_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  usuario_id uuid,
  usuario_email text,
  sucursal_id uuid,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_stock_movimiento_venta_detalle
  on public.stock_movimientos(detalle_id)
  where tipo = 'venta' and detalle_id is not null;
create index if not exists ix_stock_movimientos_correlation
  on public.stock_movimientos(correlation_id);

create or replace function public.inventory_role()
returns text language sql stable security definer set search_path=public as $$
  select lower(coalesce((select rol from public.perfiles where id = auth.uid()), ''))
$$;

create or replace function public.inventory_assert_role(p_roles text[])
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not (public.inventory_role() = any(p_roles)) then
    raise exception using errcode='42501', message='Rol sin permiso para esta operación de inventario';
  end if;
end $$;

create or replace function public.inventory_base_quantity(
  p_unidad text, p_cantidad numeric, p_unidad_base text,
  p_unidades_alternativas text[], p_factor numeric
) returns numeric language plpgsql immutable as $$
begin
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  if lower(trim(p_unidad)) = lower(trim(p_unidad_base)) then return p_cantidad; end if;
  if not (lower(trim(p_unidad)) = any(select lower(trim(x)) from unnest(coalesce(p_unidades_alternativas,'{}')) x)) then
    raise exception 'Unidad no permitida: %', p_unidad;
  end if;
  if p_factor is null or p_factor <= 0 then raise exception 'Factor de conversión inválido'; end if;
  return p_cantidad / p_factor;
end $$;

create or replace function public.reducir_stock_completo(
  p_producto_id bigint, p_variante_id bigint default null,
  p_cantidad numeric default 0, p_unidad text default null,
  p_motivo text default null, p_usuario_id uuid default null,
  p_usuario_email text default null, p_sucursal_id uuid default null,
  p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_p public.productos%rowtype; v_v public.producto_variantes%rowtype;
  v_base numeric; v_before numeric; v_after numeric; v_total numeric;
  v_unit text; v_corr uuid := coalesce(p_correlation_id, gen_random_uuid());
begin
  perform public.inventory_assert_role(array['admin','administracion']);
  if length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'El motivo es obligatorio'; end if;
  select * into v_p from public.productos where user_id=p_producto_id
    and (p_sucursal_id is null or sucursal_id=p_sucursal_id) for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if v_p.archivado then raise exception 'Un producto archivado no admite movimientos'; end if;
  v_unit := coalesce(nullif(trim(p_unidad),''), nullif(trim(v_p.unidad_base),''), 'unidad');
  v_base := public.inventory_base_quantity(v_unit,p_cantidad,coalesce(nullif(v_p.unidad_base,''),'unidad'),v_p.unidades_alternativas,v_p.factor_conversion);

  if exists(select 1 from public.producto_variantes where producto_id=p_producto_id and coalesce(activo,true)) and p_variante_id is null then
    raise exception 'Debe seleccionar una variante';
  end if;
  if p_variante_id is not null then
    select * into v_v from public.producto_variantes where id=p_variante_id
      and producto_id=p_producto_id and (p_sucursal_id is null or sucursal_id=p_sucursal_id) for update;
    if not found or not coalesce(v_v.activo,true) then raise exception 'Variante no encontrada o inactiva'; end if;
    v_before := coalesce(v_v.stock_decimal, v_v.stock, 0);
  else v_before := coalesce(v_p.stock,0); end if;
  if v_base > v_before then raise exception 'Stock insuficiente. Disponible %, solicitado %',v_before,v_base; end if;
  v_after := v_before-v_base;
  if p_variante_id is not null then
    update public.producto_variantes set stock_decimal=v_after,stock=floor(v_after) where id=p_variante_id;
    select coalesce(sum(coalesce(stock_decimal,stock,0)),0) into v_total from public.producto_variantes
      where producto_id=p_producto_id and coalesce(activo,true);
    update public.productos set stock=v_total where user_id=p_producto_id;
  else update public.productos set stock=v_after where user_id=p_producto_id; v_total:=v_after; end if;
  insert into public.stock_movimientos(producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,
    unidad_base,factor_conversion,stock_antes,stock_despues,usuario_id,usuario_email,sucursal_id,
    motivo,observaciones,correlation_id,transaction_id,resultado,metadata)
  values(p_producto_id,p_variante_id,'ajuste_negativo',p_cantidad,v_unit,v_base,
    coalesce(nullif(v_p.unidad_base,''),'unidad'),case when v_unit=coalesce(nullif(v_p.unidad_base,''),'unidad') then 1 else v_p.factor_conversion end,
    v_before,v_after,coalesce(auth.uid(),p_usuario_id),coalesce(auth.jwt()->>'email',p_usuario_email),v_p.sucursal_id,
    trim(p_motivo),trim(p_motivo),v_corr,txid_current(),'aplicado',jsonb_build_object('producto_stock',v_total));
  return jsonb_build_object('stock_antes',v_before,'stock_despues',v_after,'producto_stock',v_total,'cantidad_base',v_base,'correlation_id',v_corr);
end $$;

-- Wrapper idempotente: recalcula todas las cantidades base antes de invocar la
-- venta transaccional existente. La clave queda bloqueada durante el proceso.
create or replace function public.crear_venta_completa(
  p_venta jsonb,p_items jsonb,p_pagos jsonb,p_usuario_id uuid,p_usuario_email text,
  p_cashbox_id text,p_sucursal_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_hash text; v_saved record; v_item jsonb; v_safe jsonb:='[]'::jsonb;
  v_p record; v_qty numeric; v_unit text; v_result jsonb;
begin
  perform public.inventory_assert_role(array['admin','administracion','vendedor']);
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'Idempotency-Key obligatorio'; end if;
  v_hash:=encode(digest(jsonb_build_object('venta',p_venta,'items',p_items,'pagos',p_pagos,'sucursal',p_sucursal_id)::text,'sha256'),'hex');
  insert into public.inventory_idempotency(key,operation,request_hash,usuario_id)
    values(p_idempotency_key,'crear_venta',v_hash,auth.uid()) on conflict do nothing;
  select * into v_saved from public.inventory_idempotency where key=p_idempotency_key for update;
  if v_saved.operation<>'crear_venta' or v_saved.request_hash<>v_hash then raise exception 'Idempotency-Key reutilizada con datos distintos'; end if;
  if v_saved.response is not null then return v_saved.response; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select unidad_base,unidades_alternativas,factor_conversion,archivado into v_p from public.productos
      where user_id=(v_item->>'producto_id')::bigint and (p_sucursal_id is null or sucursal_id=p_sucursal_id);
    if not found or v_p.archivado then raise exception 'Producto inexistente o archivado'; end if;
    v_qty:=public.inventory_base_quantity(coalesce(v_item->>'unidad',v_p.unidad_base,'unidad'),
      coalesce((v_item->>'cantidad')::numeric,(v_item->>'cantidad_display')::numeric),
      coalesce(v_p.unidad_base,'unidad'),v_p.unidades_alternativas,v_p.factor_conversion);
    v_safe:=v_safe||jsonb_set(v_item,'{cantidad_base}',to_jsonb(v_qty),true);
  end loop;
  v_result:=public.crear_venta_completa(p_venta,v_safe,p_pagos,p_usuario_id,p_usuario_email,p_cashbox_id,p_sucursal_id);
  update public.inventory_idempotency set response=v_result,completed_at=now() where key=p_idempotency_key;
  return v_result;
end $$;

create or replace function public.prevent_stock_ledger_mutation() returns trigger
language plpgsql as $$ begin raise exception 'El ledger de stock es inmutable; use un movimiento compensatorio'; end $$;
drop trigger if exists trg_stock_ledger_immutable on public.stock_movimientos;
create trigger trg_stock_ledger_immutable before update or delete on public.stock_movimientos
for each row execute function public.prevent_stock_ledger_mutation();

create or replace view public.inventory_reconciliation as
with snapshots as (
  select p.user_id producto_id,pv.id variante_id,p.nombre,pv.color,
    case when pv.id is null then p.stock::numeric else coalesce(pv.stock_decimal,pv.stock,0)::numeric end stock_sistema
  from public.productos p left join public.producto_variantes pv on pv.producto_id=p.user_id and coalesce(pv.activo,true)
), ledger as (
  select producto_id,variante_id,
    (array_agg(stock_antes order by created_at,id) filter(where stock_antes is not null))[1]
      +coalesce(sum(case when tipo in ('aumento','entrada','transferencia_entrada','anulacion_venta','apertura') then cantidad_base else -cantidad_base end),0) stock_reconstruido,
    max(created_at) ultimo_movimiento,count(*) movimientos
  from public.stock_movimientos where resultado='aplicado' group by producto_id,variante_id
)
select s.*,l.stock_reconstruido,s.stock_sistema-l.stock_reconstruido diferencia,l.ultimo_movimiento,
  case when coalesce(l.movimientos,0)=0 then 'SIN_LEDGER' when s.stock_sistema=l.stock_reconstruido then 'OK' else 'INCONSISTENCIA_CRITICA' end estado
from snapshots s left join ledger l on l.producto_id=s.producto_id and l.variante_id is not distinct from s.variante_id;

revoke insert,update,delete on public.stock_movimientos from anon,authenticated;
revoke all on public.inventory_idempotency,public.inventory_rejected_attempts,public.business_audit_events from anon,authenticated;
revoke execute on function public.reducir_stock_completo(bigint,bigint,numeric,text,text,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.reducir_stock_completo(bigint,bigint,numeric,text,text,uuid,text,uuid,uuid) to authenticated;
revoke execute on function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid,text) from public,anon;
grant execute on function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid,text) to authenticated;
grant select on public.inventory_reconciliation to authenticated;

commit;
