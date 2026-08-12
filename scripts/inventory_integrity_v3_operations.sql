-- Operaciones seguras v3: anulaciones, pedidos, transferencias idempotentes
-- y reconciliación consciente de historiales incompletos.
-- Ejecutar en staging y luego producción DESPUÉS de inventory_integrity_v2.sql.
begin;

alter table public.ventas
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_por uuid,
  add column if not exists anulada_motivo text,
  add column if not exists anulacion_correlation_id uuid;

alter table public.stock_movimientos
  add column if not exists reverses_movement_id bigint,
  add column if not exists reversal_detail_id bigint;

create unique index if not exists ux_stock_reversal_movement
  on public.stock_movimientos(reverses_movement_id)
  where reverses_movement_id is not null;
create unique index if not exists ux_stock_reversal_legacy_detail
  on public.stock_movimientos(reversal_detail_id)
  where reversal_detail_id is not null;

alter table public.carritos_pendientes
  add column if not exists estado text not null default 'pendiente',
  add column if not exists venta_id bigint,
  add column if not exists procesado_at timestamptz,
  add column if not exists procesado_por uuid,
  add column if not exists descartado_motivo text;

create index if not exists ix_carritos_estado_sucursal
  on public.carritos_pendientes(sucursal_id,estado,fecha desc);

-- Conserva el nombre consumido por la pantalla antigua, pero ahora ANULA:
-- nunca elimina venta, detalles, pagos, caja ni movimientos originales.
create or replace function public.eliminar_venta_con_restock(
  p_venta_id bigint,p_admin_id uuid default null,p_admin_email text default null,p_motivo text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_sale public.ventas%rowtype; v_row record; v_p public.productos%rowtype;
  v_before numeric; v_after numeric; v_total numeric; v_count integer:=0;
  v_corr uuid:=gen_random_uuid(); v_actor uuid:=coalesce(auth.uid(),p_admin_id);
begin
  perform public.inventory_assert_role(array['admin']);
  if p_venta_id is null then raise exception 'Venta inválida'; end if;
  if length(trim(coalesce(p_motivo,'')))<8 then raise exception 'El motivo debe tener al menos 8 caracteres'; end if;
  select * into v_sale from public.ventas where id=p_venta_id for update;
  if not found then raise exception 'Venta no encontrada (%)',p_venta_id; end if;
  if lower(coalesce(v_sale.estado,''))='anulada' or v_sale.anulada_at is not null then
    return jsonb_build_object('id',p_venta_id,'anulada',true,'already_processed',true,'stock_restored_rows',0,'correlation_id',v_sale.anulacion_correlation_id);
  end if;

  -- Preferimos el ledger original: contiene la cantidad base exacta realmente descontada.
  if exists(select 1 from public.stock_movimientos where venta_id=p_venta_id and tipo='venta') then
    for v_row in select sm.*,coalesce(sm.cantidad_base,sm.cantidad,0)::numeric qty
      from public.stock_movimientos sm where sm.venta_id=p_venta_id and sm.tipo='venta' order by sm.id
    loop
      if v_row.qty<=0 then continue; end if;
      select * into v_p from public.productos where user_id=v_row.producto_id for update;
      if not found then raise exception 'Producto % de la venta ya no existe',v_row.producto_id; end if;
      if v_row.variante_id is not null then
        select coalesce(stock_decimal,stock,0)::numeric into v_before from public.producto_variantes
          where id=v_row.variante_id and producto_id=v_row.producto_id for update;
        if not found then raise exception 'Variante % de la venta ya no existe',v_row.variante_id; end if;
        v_after:=v_before+v_row.qty;
        update public.producto_variantes set stock_decimal=v_after,stock=floor(v_after) where id=v_row.variante_id;
        select coalesce(sum(coalesce(stock_decimal,stock,0)),0) into v_total from public.producto_variantes
          where producto_id=v_row.producto_id and coalesce(activo,true);
        update public.productos set stock=v_total where user_id=v_row.producto_id;
      else
        v_before:=coalesce(v_p.stock,0); v_after:=v_before+v_row.qty; v_total:=v_after;
        update public.productos set stock=v_after where user_id=v_row.producto_id;
      end if;
      insert into public.stock_movimientos(producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,
        unidad_base,factor_conversion,stock_antes,stock_despues,usuario_id,usuario_email,sucursal_id,
        observaciones,motivo,venta_id,correlation_id,transaction_id,resultado,metadata,reverses_movement_id)
      values(v_row.producto_id,v_row.variante_id,'anulacion_venta',coalesce(v_row.cantidad,v_row.qty),v_row.unidad,v_row.qty,
        coalesce(v_row.unidad_base,v_p.unidad_base,'unidad'),coalesce(v_row.factor_conversion,1),v_before,v_after,
        v_actor,coalesce(auth.jwt()->>'email',p_admin_email),v_sale.sucursal_id,'Restitución por anulación de venta #'||p_venta_id,
        trim(p_motivo),p_venta_id,v_corr,txid_current(),'aplicado',jsonb_build_object('movimiento_original_id',v_row.id,'producto_stock',v_total),v_row.id);
      v_count:=v_count+1;
    end loop;
  else
    -- Respaldo para ventas antiguas sin ledger. Se marca explícitamente como legado.
    for v_row in select vd.*,coalesce(vd.cantidad_base,vd.cantidad,0)::numeric qty
      from public.ventas_detalle vd where vd.venta_id=p_venta_id and vd.producto_id is not null
        and coalesce(vd.tipo,'producto')='producto' order by vd.id
    loop
      if v_row.qty<=0 then continue; end if;
      select * into v_p from public.productos where user_id=v_row.producto_id for update;
      if not found then raise exception 'Producto % de la venta ya no existe',v_row.producto_id; end if;
      if v_row.variante_id is not null then
        select coalesce(stock_decimal,stock,0)::numeric into v_before from public.producto_variantes
          where id=v_row.variante_id and producto_id=v_row.producto_id for update;
        if not found then raise exception 'Variante % no existe',v_row.variante_id; end if;
        v_after:=v_before+v_row.qty;
        update public.producto_variantes set stock_decimal=v_after,stock=floor(v_after) where id=v_row.variante_id;
        select coalesce(sum(coalesce(stock_decimal,stock,0)),0) into v_total from public.producto_variantes where producto_id=v_row.producto_id and coalesce(activo,true);
        update public.productos set stock=v_total where user_id=v_row.producto_id;
      else v_before:=coalesce(v_p.stock,0);v_after:=v_before+v_row.qty;v_total:=v_after;update public.productos set stock=v_after where user_id=v_row.producto_id; end if;
      insert into public.stock_movimientos(producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,unidad_base,
        factor_conversion,stock_antes,stock_despues,usuario_id,usuario_email,sucursal_id,observaciones,motivo,
        venta_id,correlation_id,transaction_id,resultado,metadata,reversal_detail_id)
      values(v_row.producto_id,v_row.variante_id,'anulacion_venta',coalesce(v_row.cantidad,v_row.qty),coalesce(v_row.unidad,v_p.unidad_base,'unidad'),v_row.qty,
        coalesce(v_p.unidad_base,'unidad'),1,v_before,v_after,v_actor,coalesce(auth.jwt()->>'email',p_admin_email),v_sale.sucursal_id,
        'Restitución legado por anulación de venta #'||p_venta_id,trim(p_motivo),p_venta_id,v_corr,txid_current(),'aplicado',
        jsonb_build_object('detalle_legacy_id',v_row.id,'producto_stock',v_total),v_row.id);
      v_count:=v_count+1;
    end loop;
  end if;

  -- Caja se revierte con compensaciones, sin borrar ingresos originales.
  insert into public.cash_movements(user_id,cashbox_id,date,type,payment_method,amount,description,created_at,sucursal_id)
  select v_actor,cm.cashbox_id,current_date,'expense',cm.payment_method,abs(cm.amount),
    'Reversión por anulación de venta #'||p_venta_id||' · movimiento original '||cm.id,now(),cm.sucursal_id
  from public.cash_movements cm
  where cm.description ilike ('%venta #'||p_venta_id||'%')
    and cm.description not ilike ('Reversión por anulación%');

  update public.ventas set estado='anulada',anulada_at=now(),anulada_por=v_actor,
    anulada_motivo=trim(p_motivo),anulacion_correlation_id=v_corr where id=p_venta_id;
  insert into public.business_audit_events(event_type,entity_type,entity_id,usuario_id,usuario_email,sucursal_id,correlation_id,metadata)
  values('SALE_CANCELLED','venta',p_venta_id::text,v_actor,coalesce(auth.jwt()->>'email',p_admin_email),v_sale.sucursal_id,v_corr,
    jsonb_build_object('motivo',trim(p_motivo),'stock_restored_rows',v_count));
  return jsonb_build_object('id',p_venta_id,'anulada',true,'deleted',false,'stock_restored_rows',v_count,'correlation_id',v_corr);
end $$;

-- Venta + pedido en la misma transacción. Reutiliza el wrapper idempotente v2.
create or replace function public.crear_venta_completa(
  p_venta jsonb,p_items jsonb,p_pagos jsonb,p_usuario_id uuid,p_usuario_email text,
  p_cashbox_id text,p_sucursal_id uuid,p_idempotency_key text,p_pedido_id bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.carritos_pendientes%rowtype; v_result jsonb; v_sale_id bigint;
begin
  if p_pedido_id is not null then
    select * into v_order from public.carritos_pendientes where id=p_pedido_id
      and (p_sucursal_id is null or sucursal_id=p_sucursal_id) for update;
    if not found then raise exception 'Pedido pendiente no encontrado'; end if;
    if coalesce(v_order.estado,case when v_order.confirmado_pago then 'confirmado' else 'pendiente' end)<>'pendiente' then
      raise exception 'El pedido ya fue procesado (estado=%)',v_order.estado;
    end if;
  end if;
  v_result:=public.crear_venta_completa(p_venta,p_items,p_pagos,p_usuario_id,p_usuario_email,p_cashbox_id,p_sucursal_id,
    p_idempotency_key||':pedido:'||coalesce(p_pedido_id::text,'sin-pedido'));
  v_sale_id:=(v_result->>'id')::bigint;
  if p_pedido_id is not null then
    update public.carritos_pendientes set confirmado_pago=true,estado='confirmado',venta_id=v_sale_id,
      procesado_at=now(),procesado_por=coalesce(auth.uid(),p_usuario_id) where id=p_pedido_id;
    insert into public.business_audit_events(event_type,entity_type,entity_id,usuario_id,usuario_email,sucursal_id,metadata)
    values('PENDING_ORDER_CONFIRMED','carrito_pendiente',p_pedido_id::text,coalesce(auth.uid(),p_usuario_id),
      coalesce(auth.jwt()->>'email',p_usuario_email),p_sucursal_id,jsonb_build_object('venta_id',v_sale_id));
  end if;
  return v_result||jsonb_build_object('pedido_id',p_pedido_id);
end $$;

-- Descartar conserva el pedido y su auditoría.
create or replace function public.descartar_pedido_pendiente(p_pedido_id bigint,p_motivo text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.carritos_pendientes%rowtype;
begin
  perform public.inventory_assert_role(array['admin','administracion','vendedor']);
  select * into v_order from public.carritos_pendientes where id=p_pedido_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if coalesce(v_order.estado,'pendiente')<>'pendiente' then raise exception 'El pedido ya fue procesado'; end if;
  update public.carritos_pendientes set estado='descartado',procesado_at=now(),procesado_por=auth.uid(),descartado_motivo=coalesce(nullif(trim(p_motivo),''),'Descartado por usuario') where id=p_pedido_id;
  insert into public.business_audit_events(event_type,entity_type,entity_id,usuario_id,usuario_email,sucursal_id,metadata)
  values('PENDING_ORDER_DISCARDED','carrito_pendiente',p_pedido_id::text,auth.uid(),auth.jwt()->>'email',v_order.sucursal_id,jsonb_build_object('motivo',coalesce(p_motivo,'')));
  return jsonb_build_object('id',p_pedido_id,'estado','descartado');
end $$;

-- Fachada segura para la transferencia existente: ignora cualquier equivalencia
-- del navegador, valida rol/archivo, hace idempotencia y pasa cantidad base servidor.
create or replace function public.transferir_stock_sucursal(
  p_producto_origen_id bigint,p_variante_origen_id bigint,p_sucursal_origen_id uuid,p_sucursal_destino_id uuid,
  p_cantidad numeric,p_unidad text,p_cantidad_base numeric,p_usuario_id uuid,p_usuario_email text,
  p_observaciones text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_p public.productos%rowtype;v_v public.producto_variantes%rowtype;v_base numeric;
  v_hash text;v_saved record;v_result uuid;
begin
  perform public.inventory_assert_role(array['admin','administracion','almacen']);
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'Idempotency-Key obligatoria'; end if;
  select * into v_p from public.productos where user_id=p_producto_origen_id and sucursal_id=p_sucursal_origen_id for update;
  if not found then raise exception 'Producto de origen no encontrado'; end if;
  if v_p.archivado then raise exception 'Un producto archivado no puede transferirse'; end if;
  v_base:=public.inventory_base_quantity(coalesce(nullif(trim(p_unidad),''),v_p.unidad_base,'unidad'),p_cantidad,
    coalesce(v_p.unidad_base,'unidad'),v_p.unidades_alternativas,v_p.factor_conversion);
  if p_variante_origen_id is not null then
    select * into v_v from public.producto_variantes where id=p_variante_origen_id and producto_id=p_producto_origen_id for update;
    if not found or not coalesce(v_v.activo,true) then raise exception 'Variante inválida o inactiva'; end if;
    if v_v.stock_decimal is not null and floor(v_v.stock_decimal)<>coalesce(v_v.stock,0) then
      raise exception 'La variante tiene snapshot decimal/legado inconsistente; conciliar antes de transferir';
    end if;
  end if;
  v_hash:=encode(digest(jsonb_build_object('producto',p_producto_origen_id,'variante',p_variante_origen_id,
    'origen',p_sucursal_origen_id,'destino',p_sucursal_destino_id,'cantidad',p_cantidad,'unidad',p_unidad,'motivo',p_observaciones)::text,'sha256'),'hex');
  insert into public.inventory_idempotency(key,operation,request_hash,usuario_id)
    values(p_idempotency_key,'transferencia',v_hash,auth.uid()) on conflict do nothing;
  select * into v_saved from public.inventory_idempotency where key=p_idempotency_key for update;
  if v_saved.operation<>'transferencia' or v_saved.request_hash<>v_hash then raise exception 'Idempotency-Key reutilizada con datos distintos'; end if;
  if v_saved.response is not null then return (v_saved.response->>'id')::uuid; end if;
  v_result:=public.transferir_stock_sucursal(p_producto_origen_id,p_variante_origen_id,p_sucursal_origen_id,p_sucursal_destino_id,
    p_cantidad,p_unidad,v_base,p_usuario_id,p_usuario_email,p_observaciones);
  update public.inventory_idempotency set response=jsonb_build_object('id',v_result),completed_at=now() where key=p_idempotency_key;
  insert into public.business_audit_events(event_type,entity_type,entity_id,usuario_id,usuario_email,sucursal_id,metadata)
  values('INVENTORY_TRANSFERRED','transferencia',v_result::text,coalesce(auth.uid(),p_usuario_id),coalesce(auth.jwt()->>'email',p_usuario_email),
    p_sucursal_origen_id,jsonb_build_object('destino',p_sucursal_destino_id,'cantidad',p_cantidad,'unidad',p_unidad,'cantidad_base',v_base));
  return v_result;
end $$;

-- La reconciliación solo declara crítica una diferencia con una cadena completa.
create or replace view public.inventory_reconciliation as
with snapshots as (
  select p.user_id producto_id,pv.id variante_id,p.nombre,pv.color,
    case when pv.id is null then p.stock::numeric else coalesce(pv.stock_decimal,pv.stock,0)::numeric end stock_sistema
  from public.productos p left join public.producto_variantes pv on pv.producto_id=p.user_id and coalesce(pv.activo,true)
), ordered as (
  select sm.*,lag(stock_despues) over(partition by producto_id,variante_id order by created_at,id) prev_after,
    row_number() over(partition by producto_id,variante_id order by created_at,id) rn,
    row_number() over(partition by producto_id,variante_id order by created_at desc,id desc) rn_desc
  from public.stock_movimientos sm where resultado='aplicado'
), ledger as (
  select producto_id,variante_id,
    max(stock_despues) filter(where rn_desc=1) stock_reconstruido,max(created_at) ultimo_movimiento,count(*) movimientos,
    bool_and(stock_antes is not null and stock_despues is not null and (rn=1 or prev_after=stock_antes)) cadena_completa
  from ordered group by producto_id,variante_id
)
select s.*,l.stock_reconstruido,s.stock_sistema-l.stock_reconstruido diferencia,l.ultimo_movimiento,
  case when coalesce(l.movimientos,0)=0 then 'SIN_LEDGER'
       when not coalesce(l.cadena_completa,false) then 'HISTORICO_INCOMPLETO'
       when s.stock_sistema=l.stock_reconstruido then 'OK' else 'INCONSISTENCIA_CRITICA' end estado
from snapshots s left join ledger l on l.producto_id=s.producto_id and l.variante_id is not distinct from s.variante_id;

revoke execute on function public.eliminar_venta_con_restock(bigint,uuid,text,text) from public,anon;
grant execute on function public.eliminar_venta_con_restock(bigint,uuid,text,text) to authenticated;
revoke execute on function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid) from public,anon,authenticated;
revoke execute on function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid,text) from public,anon,authenticated;
revoke execute on function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid,text,bigint) from public,anon;
grant execute on function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid,text,bigint) to authenticated;
revoke execute on function public.descartar_pedido_pendiente(bigint,text) from public,anon;
grant execute on function public.descartar_pedido_pendiente(bigint,text) to authenticated;
revoke execute on function public.transferir_stock_sucursal(bigint,bigint,uuid,uuid,numeric,text,numeric,uuid,text,text) from public,anon,authenticated;
revoke execute on function public.transferir_stock_sucursal(bigint,bigint,uuid,uuid,numeric,text,numeric,uuid,text,text,text) from public,anon;
grant execute on function public.transferir_stock_sucursal(bigint,bigint,uuid,uuid,numeric,text,numeric,uuid,text,text,text) to authenticated;

commit;
