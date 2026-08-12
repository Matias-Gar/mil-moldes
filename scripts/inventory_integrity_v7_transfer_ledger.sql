-- Repara la auditoría de la transferencia PINGUINO ya aplicada y asegura que
-- la reconciliación use los snapshots de compensación, sin mover stock otra vez.
begin;

do $$
declare v_t public.transferencias_sucursal%rowtype;v_corr uuid:=gen_random_uuid();
begin
  select * into v_t from public.transferencias_sucursal
  where id='b68de5d1-8f10-4273-8b7d-39a769f3d4e6' for update;
  if not found then raise exception 'Transferencia PINGUINO no encontrada'; end if;
  if (select coalesce(stock_decimal,stock,0) from public.producto_variantes where id=75)<>18
    or (select coalesce(stock_decimal,stock,0) from public.producto_variantes where id=1229)<>9 then
    raise exception 'Los snapshots cambiaron; no se aplicó ninguna regularización';
  end if;
  if exists(select 1 from public.stock_movimientos where idempotency_key='transfer-repair:b68de5d1:out') then
    raise exception 'La reparación ya fue aplicada';
  end if;
  insert into public.stock_movimientos(producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,unidad_base,
    factor_conversion,stock_antes,stock_despues,sucursal_id,usuario_id,usuario_email,observaciones,motivo,
    correlation_id,idempotency_key,transaction_id,resultado,metadata)
  values
  (72,75,'transferencia_salida_auditada',4,'unidad',4,'unidad',1,22,18,v_t.sucursal_origen_id,
    v_t.usuario_id,v_t.usuario_email,'Snapshot comprobado de transferencia PINGUINO','Regularización de auditoría; no mueve stock',
    v_corr,'transfer-repair:b68de5d1:out',txid_current(),'aplicado',jsonb_build_object('transferencia_id',v_t.id,'repair_only',true)),
  (1228,1229,'transferencia_entrada_auditada',4,'unidad',4,'unidad',1,5,9,v_t.sucursal_destino_id,
    v_t.usuario_id,v_t.usuario_email,'Snapshot comprobado de transferencia PINGUINO','Regularización de auditoría; no mueve stock',
    v_corr,'transfer-repair:b68de5d1:in',txid_current(),'aplicado',jsonb_build_object('transferencia_id',v_t.id,'repair_only',true));
  insert into public.business_audit_events(event_type,entity_type,entity_id,usuario_id,usuario_email,sucursal_id,correlation_id,metadata)
  values('TRANSFER_LEDGER_REPAIRED','transferencia',v_t.id::text,v_t.usuario_id,v_t.usuario_email,v_t.sucursal_origen_id,v_corr,
    jsonb_build_object('origen','22 -> 18','destino','5 -> 9','stock_changed',false));
end $$;

-- Fachada definitiva: toma snapshots, ejecuta la transferencia heredada revocada
-- internamente y añade el par auditable en la misma transacción.
create or replace function public.transferir_stock_sucursal(
  p_producto_origen_id bigint,p_variante_origen_id bigint,p_sucursal_origen_id uuid,p_sucursal_destino_id uuid,
  p_cantidad numeric,p_unidad text,p_cantidad_base numeric,p_usuario_id uuid,p_usuario_email text,
  p_observaciones text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_p public.productos%rowtype;v_before_o numeric;v_before_d numeric;v_after_o numeric;v_after_d numeric;
  v_base numeric;v_hash text;v_saved record;v_id uuid;v_t public.transferencias_sucursal%rowtype;v_corr uuid:=gen_random_uuid();
begin
  perform public.inventory_assert_role(array['admin','administracion','almacen']);
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'Idempotency-Key obligatoria'; end if;
  select * into v_p from public.productos where user_id=p_producto_origen_id and sucursal_id=p_sucursal_origen_id for update;
  if not found or coalesce(v_p.archivado,false) then raise exception 'Producto inexistente o archivado'; end if;
  v_base:=public.inventory_base_quantity(coalesce(nullif(trim(p_unidad),''),v_p.unidad_base,'unidad'),p_cantidad,
    coalesce(v_p.unidad_base,'unidad'),v_p.unidades_alternativas,v_p.factor_conversion);
  v_hash:=encode(digest(jsonb_build_object('producto',p_producto_origen_id,'variante',p_variante_origen_id,'origen',p_sucursal_origen_id,
    'destino',p_sucursal_destino_id,'cantidad',p_cantidad,'unidad',p_unidad,'motivo',p_observaciones)::text,'sha256'),'hex');
  insert into public.inventory_idempotency(key,operation,request_hash,usuario_id)
  values(p_idempotency_key,'transferencia_v7',v_hash,auth.uid()) on conflict do nothing;
  select * into v_saved from public.inventory_idempotency where key=p_idempotency_key for update;
  if v_saved.operation<>'transferencia_v7' or v_saved.request_hash<>v_hash then raise exception 'Idempotency-Key reutilizada con datos distintos'; end if;
  if v_saved.response is not null then return (v_saved.response->>'id')::uuid; end if;
  if p_variante_origen_id is not null then
    select coalesce(stock_decimal,stock,0) into v_before_o from public.producto_variantes where id=p_variante_origen_id for update;
  else v_before_o:=v_p.stock; end if;
  v_id:=public.transferir_stock_sucursal(p_producto_origen_id,p_variante_origen_id,p_sucursal_origen_id,p_sucursal_destino_id,
    p_cantidad,p_unidad,v_base,p_usuario_id,p_usuario_email,p_observaciones);
  select * into v_t from public.transferencias_sucursal where id=v_id;
  if p_variante_origen_id is not null then
    select coalesce(stock_decimal,stock,0) into v_after_o from public.producto_variantes where id=v_t.variante_origen_id;
    select coalesce(stock_decimal,stock,0) into v_after_d from public.producto_variantes where id=v_t.variante_destino_id;
  else
    select stock into v_after_o from public.productos where user_id=v_t.producto_origen_id;
    select stock into v_after_d from public.productos where user_id=v_t.producto_destino_id;
  end if;
  v_before_d:=v_after_d-v_base;
  insert into public.stock_movimientos(producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,unidad_base,factor_conversion,
    stock_antes,stock_despues,sucursal_id,usuario_id,usuario_email,observaciones,motivo,correlation_id,idempotency_key,transaction_id,resultado,metadata)
  values
  (v_t.producto_origen_id,v_t.variante_origen_id,'transferencia_salida_auditada',p_cantidad,p_unidad,v_base,coalesce(v_p.unidad_base,'unidad'),1,
    v_before_o,v_after_o,p_sucursal_origen_id,p_usuario_id,p_usuario_email,'Salida auditada de transferencia','Transferencia entre sucursales',v_corr,p_idempotency_key||':out',txid_current(),'aplicado',jsonb_build_object('transferencia_id',v_id)),
  (v_t.producto_destino_id,v_t.variante_destino_id,'transferencia_entrada_auditada',p_cantidad,p_unidad,v_base,coalesce(v_p.unidad_base,'unidad'),1,
    v_before_d,v_after_d,p_sucursal_destino_id,p_usuario_id,p_usuario_email,'Entrada auditada de transferencia','Transferencia entre sucursales',v_corr,p_idempotency_key||':in',txid_current(),'aplicado',jsonb_build_object('transferencia_id',v_id));
  update public.inventory_idempotency set response=jsonb_build_object('id',v_id),completed_at=now() where key=p_idempotency_key;
  return v_id;
end $$;

-- Ignora exclusivamente movimientos heredados de transferencia sin snapshots
-- cuando existe para la misma transferencia un movimiento auditado completo.
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
    max(pm.created_at) ultimo_movimiento,count(*) movimientos,
    bool_and(pm.stock_antes is not null and pm.stock_despues is not null and
      case when rn=1 then pm.stock_antes=(select c.stock_base from cutover c where c.producto_id=pm.producto_id and c.variante_id is not distinct from pm.variante_id)
           else pm.prev_after=pm.stock_antes end) cadena_completa
  from post_moves pm group by pm.producto_id,pm.variante_id
)
select s.producto_id,s.variante_id,s.nombre,s.color,s.stock_sistema,coalesce(l.ultimo_stock,c.stock_base) stock_reconstruido,
  s.stock_sistema-coalesce(l.ultimo_stock,c.stock_base) diferencia,l.ultimo_movimiento,
  case when c.producto_id is null then 'SIN_CORTE' when not coalesce(l.cadena_completa,true) then 'INCONSISTENCIA_CRITICA'
       when s.stock_sistema=coalesce(l.ultimo_stock,c.stock_base) then 'OK' else 'INCONSISTENCIA_CRITICA' end estado
from snapshots s left join cutover c on c.producto_id=s.producto_id and c.variante_id is not distinct from s.variante_id
left join ledger l on l.producto_id=s.producto_id and l.variante_id is not distinct from s.variante_id;

commit;
