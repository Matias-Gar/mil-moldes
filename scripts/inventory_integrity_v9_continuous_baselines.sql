-- Blindaje continuo de inventario.
-- Ejecutar una sola vez despues de inventory_integrity_v8_transfer_variant_guard.sql.
-- No cambia existencias: crea puntos de control, corrige la clasificacion de la
-- vista de auditoria y rechaza transferencias con variantes incompletas.
begin;

-- 1) Los productos creados despues del corte original tambien necesitan un
-- punto de partida verificable. Esta fotografia conserva el stock actual.
insert into public.inventory_cutover_balances(
  producto_id,variante_id,sucursal_id,stock_base,motivo,metadata
)
select p.user_id,pv.id,p.sucursal_id,
  case when pv.id is null then coalesce(p.stock,0)::numeric
       else coalesce(pv.stock_decimal,pv.stock,0)::numeric end,
  'Corte automatico v9 para entidad creada despues del blindaje',
  jsonb_build_object('source','v9_missing_baseline_backfill','captured_at',clock_timestamp())
from public.productos p
left join public.producto_variantes pv
  on pv.producto_id=p.user_id and coalesce(pv.activo,true)
where not exists (
  select 1 from public.inventory_cutover_balances c
  where c.producto_id=p.user_id and c.variante_id is not distinct from pv.id
);

create or replace function public.ensure_inventory_entity_baseline()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_sucursal_id uuid; v_stock numeric; v_producto_id bigint; v_variante_id bigint;
begin
  if tg_table_name='productos' then
    v_producto_id:=new.user_id;v_variante_id:=null;v_sucursal_id:=new.sucursal_id;v_stock:=coalesce(new.stock,0);
  else
    v_producto_id:=new.producto_id;v_variante_id:=new.id;v_sucursal_id:=new.sucursal_id;
    v_stock:=coalesce(new.stock_decimal,new.stock,0);
  end if;
  insert into public.inventory_cutover_balances(producto_id,variante_id,sucursal_id,stock_base,motivo,metadata)
  select v_producto_id,v_variante_id,v_sucursal_id,greatest(0,v_stock),
    'Saldo de apertura automatico al crear inventario',
    jsonb_build_object('source','entity_insert_trigger','table',tg_table_name,'created_at',clock_timestamp())
  where not exists (
    select 1 from public.inventory_cutover_balances c
    where c.producto_id=v_producto_id and c.variante_id is not distinct from v_variante_id
  );
  return new;
end $$;

drop trigger if exists trg_product_inventory_baseline on public.productos;
create trigger trg_product_inventory_baseline
after insert on public.productos for each row execute function public.ensure_inventory_entity_baseline();
drop trigger if exists trg_variant_inventory_baseline on public.producto_variantes;
create trigger trg_variant_inventory_baseline
after insert on public.producto_variantes for each row execute function public.ensure_inventory_entity_baseline();

-- 2) Una transferencia nunca puede mezclar un producto sin variante con otro
-- que si las tiene. La guarda vive en BD y protege cualquier pantalla/RPC.
create or replace function public.validate_transfer_variant_integrity()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_origin_has_variants boolean;v_destination_has_variants boolean;
begin
  select exists(select 1 from public.producto_variantes where producto_id=new.producto_origen_id and coalesce(activo,true))
    into v_origin_has_variants;
  select exists(select 1 from public.producto_variantes where producto_id=new.producto_destino_id and coalesce(activo,true))
    into v_destination_has_variants;

  if v_origin_has_variants<>v_destination_has_variants then
    raise exception 'Transferencia rechazada: origen y destino no tienen la misma estructura de variantes';
  end if;
  if (v_origin_has_variants or v_destination_has_variants)
     and (new.variante_origen_id is null or new.variante_destino_id is null) then
    raise exception 'Transferencia rechazada: debe identificar variante de origen y destino';
  end if;
  if new.variante_origen_id is not null and not exists(
    select 1 from public.producto_variantes
    where id=new.variante_origen_id and producto_id=new.producto_origen_id
      and sucursal_id=new.sucursal_origen_id and coalesce(activo,true)
  ) then raise exception 'Transferencia rechazada: variante de origen invalida'; end if;
  if new.variante_destino_id is not null and not exists(
    select 1 from public.producto_variantes
    where id=new.variante_destino_id and producto_id=new.producto_destino_id
      and sucursal_id=new.sucursal_destino_id and coalesce(activo,true)
  ) then raise exception 'Transferencia rechazada: variante de destino invalida'; end if;
  return new;
end $$;

drop trigger if exists trg_validate_transfer_variant_integrity on public.transferencias_sucursal;
create trigger trg_validate_transfer_variant_integrity
before insert or update of producto_origen_id,variante_origen_id,producto_destino_id,variante_destino_id,
  sucursal_origen_id,sucursal_destino_id
on public.transferencias_sucursal for each row execute function public.validate_transfer_variant_integrity();

-- 3) La igualdad de los saldos manda. Una discontinuidad historica se conserva
-- en el ledger, pero no se presenta como perdida critica si el saldo reconstruido
-- y el saldo real son exactamente iguales.
create or replace view public.inventory_reconciliation as
with snapshots as (
  select p.user_id producto_id,pv.id variante_id,p.nombre,pv.color,
    case when pv.id is null then coalesce(p.stock,0)::numeric else coalesce(pv.stock_decimal,pv.stock,0)::numeric end stock_sistema
  from public.productos p left join public.producto_variantes pv on pv.producto_id=p.user_id and coalesce(pv.activo,true)
), cutover as (
  select distinct on(producto_id,coalesce(variante_id,-1)) * from public.inventory_cutover_balances
  order by producto_id,coalesce(variante_id,-1),cutover_at desc
), post_moves as (
  select sm.*,lag(sm.stock_despues) over(partition by sm.producto_id,sm.variante_id order by sm.created_at,sm.id) prev_after,
    row_number() over(partition by sm.producto_id,sm.variante_id order by sm.created_at,sm.id) rn,
    row_number() over(partition by sm.producto_id,sm.variante_id order by sm.created_at desc,sm.id desc) rn_desc
  from public.stock_movimientos sm join cutover c on c.producto_id=sm.producto_id and c.variante_id is not distinct from sm.variante_id
  where sm.resultado='aplicado' and sm.created_at>=c.cutover_at
    and not (sm.tipo in ('transferencia_salida','transferencia_entrada') and sm.stock_antes is null and sm.stock_despues is null
      and exists(select 1 from public.transferencias_sucursal t join public.stock_movimientos fixed
        on fixed.metadata->>'transferencia_id'=t.id::text and fixed.stock_antes is not null and fixed.stock_despues is not null
        where sm.created_at=t.created_at and (
          (sm.tipo='transferencia_salida' and sm.producto_id=t.producto_origen_id and sm.variante_id is not distinct from t.variante_origen_id)
          or (sm.tipo='transferencia_entrada' and sm.producto_id=t.producto_destino_id and sm.variante_id is not distinct from t.variante_destino_id))
      ))
), ledger as (
  select pm.producto_id,pm.variante_id,max(pm.stock_despues) filter(where rn_desc=1) ultimo_stock,
    max(pm.created_at) ultimo_movimiento,
    bool_and(pm.stock_antes is not null and pm.stock_despues is not null and
      case when rn=1 then pm.stock_antes=(select c.stock_base from cutover c where c.producto_id=pm.producto_id and c.variante_id is not distinct from pm.variante_id)
           else pm.prev_after=pm.stock_antes end) cadena_completa
  from post_moves pm group by pm.producto_id,pm.variante_id
)
select s.producto_id,s.variante_id,s.nombre,s.color,s.stock_sistema,
  coalesce(l.ultimo_stock,c.stock_base) stock_reconstruido,
  s.stock_sistema-coalesce(l.ultimo_stock,c.stock_base) diferencia,l.ultimo_movimiento,
  case when c.producto_id is null then 'SIN_CORTE'
       when s.stock_sistema=coalesce(l.ultimo_stock,c.stock_base) then 'OK'
       else 'INCONSISTENCIA_CRITICA' end estado
from snapshots s
left join cutover c on c.producto_id=s.producto_id and c.variante_id is not distinct from s.variante_id
left join ledger l on l.producto_id=s.producto_id and l.variante_id is not distinct from s.variante_id;

grant select on public.inventory_reconciliation to authenticated;

insert into public.business_audit_events(event_type,entity_type,entity_id,metadata)
values('INVENTORY_CONTINUOUS_BASELINES_ENABLED','inventario','v9',jsonb_build_object(
  'balances',(select count(*) from public.inventory_cutover_balances),
  'executed_at',clock_timestamp()
));

commit;
