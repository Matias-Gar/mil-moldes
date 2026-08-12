-- Corrige la devolución de 4 PINGUINO realizada sin variante y bloquea futuras
-- transferencias ambiguas. No altera el total global: Venezuela 9->5, origen 18->22.
begin;

do $$
declare v_latest public.transferencias_sucursal%rowtype;v_corr uuid:=gen_random_uuid();
begin
  select * into v_latest from public.transferencias_sucursal
  where producto_nombre='´PINGUINO' and cantidad_base=4
  order by created_at desc limit 1 for update;
  if not found then raise exception 'No se encontró la devolución reciente de PINGUINO'; end if;
  if v_latest.producto_origen_id<>1228 or v_latest.producto_destino_id<>72 then
    raise exception 'La última transferencia no es la devolución esperada 1228 -> 72';
  end if;
  if v_latest.variante_origen_id is not null then
    raise exception 'La devolución ya tiene variante; revisar antes de corregir';
  end if;
  if exists(select 1 from public.stock_movimientos where idempotency_key='transfer-fix-v8:'||v_latest.id::text) then
    raise exception 'La corrección v8 ya fue aplicada';
  end if;
  -- El RPC defectuoso cambió productos 9->5 y 18->22, pero dejó variantes 9 y18.
  if (select coalesce(stock_decimal,stock,0) from public.producto_variantes where id=1229)<>9
     or (select coalesce(stock_decimal,stock,0) from public.producto_variantes where id=75)<>18 then
    raise exception 'Stocks de variantes diferentes a los esperados; no se modificó nada';
  end if;
  update public.producto_variantes set stock_decimal=5,stock=5 where id=1229 and producto_id=1228;
  update public.producto_variantes set stock_decimal=22,stock=22 where id=75 and producto_id=72;
  update public.transferencias_sucursal set variante_origen_id=1229,variante_destino_id=75,
    variante_nombre='Único' where id=v_latest.id;
  -- Marca los movimientos producto-nivel defectuosos como reemplazados mediante
  -- nuevos snapshots; el ledger original permanece inmutable.
  insert into public.stock_movimientos(producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,unidad_base,
    factor_conversion,stock_antes,stock_despues,sucursal_id,usuario_id,usuario_email,observaciones,motivo,
    correlation_id,idempotency_key,transaction_id,resultado,metadata)
  values
  (1228,1229,'transferencia_salida_auditada',4,'unidad',4,'unidad',1,9,5,v_latest.sucursal_origen_id,
    v_latest.usuario_id,v_latest.usuario_email,'Salida corregida a variante Único','Corrección de transferencia sin variante',
    v_corr,'transfer-fix-v8:'||v_latest.id::text,txid_current(),'aplicado',jsonb_build_object('transferencia_id',v_latest.id,'variant_fix',true)),
  (72,75,'transferencia_entrada_auditada',4,'unidad',4,'unidad',1,18,22,v_latest.sucursal_destino_id,
    v_latest.usuario_id,v_latest.usuario_email,'Entrada corregida a variante Único','Corrección de transferencia sin variante',
    v_corr,'transfer-fix-v8:'||v_latest.id::text||':in',txid_current(),'aplicado',jsonb_build_object('transferencia_id',v_latest.id,'variant_fix',true));
  insert into public.business_audit_events(event_type,entity_type,entity_id,usuario_id,usuario_email,sucursal_id,correlation_id,metadata)
  values('TRANSFER_VARIANT_REPAIRED','transferencia',v_latest.id::text,v_latest.usuario_id,v_latest.usuario_email,
    v_latest.sucursal_origen_id,v_corr,jsonb_build_object('origen_variante',1229,'destino_variante',75,'cantidad',4));
end $$;

-- La función de 10 argumentos heredada ya no puede aceptar producto sin variante
-- cuando existen variantes activas. El trigger cubre incluso llamadas internas.
create or replace function public.require_transfer_variant()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.variante_origen_id is null and exists(select 1 from public.producto_variantes pv
    where pv.producto_id=new.producto_origen_id and pv.sucursal_id=new.sucursal_origen_id and coalesce(pv.activo,true)) then
    raise exception 'Debe seleccionar una variante/color para transferir este producto';
  end if;
  return new;
end $$;
drop trigger if exists trg_require_transfer_variant on public.transferencias_sucursal;
create trigger trg_require_transfer_variant before insert on public.transferencias_sucursal
for each row execute function public.require_transfer_variant();

commit;
