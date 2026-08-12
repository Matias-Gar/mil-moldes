-- Regularización puntual aprobada por conteo físico (2026-08-12).
-- ANGEL NIÑA (producto 156 / variante 159): sistema 6, físico 0.
-- STICH XL   (producto 60  / variante 63): sistema 1, físico 1.
--
-- No reescribe ni elimina movimientos anteriores. Agrega movimientos
-- compensatorios y ajusta solamente ANGEL NIÑA de 6 a 0.
begin;

do $$
declare
  v_angel_stock numeric;
  v_stich_stock numeric;
  v_angel_product_stock numeric;
  v_stich_product_stock numeric;
  v_angel_total numeric;
  v_stich_total numeric;
  v_actor uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_corr_angel uuid := gen_random_uuid();
  v_corr_stich uuid := gen_random_uuid();
  v_sucursal_angel uuid;
  v_sucursal_stich uuid;
begin
  -- Si se ejecuta desde SQL Editor no existe auth.uid(); la evidencia conserva
  -- el motivo, correlación y usuario técnico indicado en metadata.
  select coalesce(pv.stock_decimal,pv.stock,0)::numeric,pv.sucursal_id
    into v_angel_stock,v_sucursal_angel
  from public.producto_variantes pv
  where pv.id=159 and pv.producto_id=156
  for update;
  if not found then raise exception 'No existe ANGEL NIÑA producto 156 / variante 159'; end if;

  select coalesce(pv.stock_decimal,pv.stock,0)::numeric,pv.sucursal_id
    into v_stich_stock,v_sucursal_stich
  from public.producto_variantes pv
  where pv.id=63 and pv.producto_id=60
  for update;
  if not found then raise exception 'No existe STICH XL producto 60 / variante 63'; end if;

  select stock::numeric into v_angel_product_stock from public.productos where user_id=156 for update;
  if not found then raise exception 'No existe producto ANGEL NIÑA 156'; end if;
  select stock::numeric into v_stich_product_stock from public.productos where user_id=60 for update;
  if not found then raise exception 'No existe producto STICH XL 60'; end if;

  if v_angel_stock<>6 then
    raise exception 'Abortado: ANGEL NIÑA cambió; se esperaba stock 6 y ahora tiene %',v_angel_stock;
  end if;
  if v_stich_stock<>1 then
    raise exception 'Abortado: STICH XL cambió; se esperaba stock 1 y ahora tiene %',v_stich_stock;
  end if;
  if not exists(select 1 from public.stock_movimientos where id=4594 and producto_id=156 and variante_id=159 and stock_despues=28) then
    raise exception 'Abortado: no coincide el movimiento de referencia 4594 de ANGEL NIÑA';
  end if;
  if not exists(select 1 from public.stock_movimientos where id=5637 and producto_id=60 and variante_id=63 and stock_despues=0) then
    raise exception 'Abortado: no coincide el movimiento de referencia 5637 de STICH XL';
  end if;
  if exists(select 1 from public.stock_movimientos where idempotency_key in
    ('reconcile:20260812:angel-nina:historico','reconcile:20260812:angel-nina:fisico','reconcile:20260812:stich-xl:historico')) then
    raise exception 'Esta regularización ya fue aplicada';
  end if;

  -- Puente histórico: explica por qué el snapshot pasó de 28 a 6 sin ledger.
  insert into public.stock_movimientos(
    producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,unidad_base,factor_conversion,
    stock_antes,stock_despues,usuario_id,usuario_email,sucursal_id,observaciones,motivo,
    correlation_id,idempotency_key,transaction_id,resultado,metadata
  ) values (
    156,159,'regularizacion_historica_salida',22,'unidad',22,'unidad',1,
    28,6,v_actor,v_email,v_sucursal_angel,
    'Salida histórica no registrada detectada por reconciliación; conserva snapshot previo de 6',
    'Regularización de ledger aprobada tras revisión de movimientos y conteo físico',
    v_corr_angel,'reconcile:20260812:angel-nina:historico',txid_current(),'aplicado',
    jsonb_build_object('conteo_fisico',0,'snapshot_encontrado',6,'ultimo_movimiento_previo',4594,
      'aprobado_por_negocio',true,'ejecutado_desde','migracion_controlada')
  );

  -- Ajuste físico real: de las 6 unidades que figuraban, no existe ninguna.
  insert into public.stock_movimientos(
    producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,unidad_base,factor_conversion,
    stock_antes,stock_despues,usuario_id,usuario_email,sucursal_id,observaciones,motivo,
    correlation_id,idempotency_key,transaction_id,resultado,metadata
  ) values (
    156,159,'ajuste_negativo',6,'unidad',6,'unidad',1,
    6,0,v_actor,v_email,v_sucursal_angel,
    'Ajuste a conteo físico confirmado: ANGEL NIÑA = 0 unidades',
    'Pérdida o faltante físico confirmado por negocio',
    v_corr_angel,'reconcile:20260812:angel-nina:fisico',txid_current(),'aplicado',
    jsonb_build_object('conteo_fisico',0,'snapshot_antes',6,'aprobado_por_negocio',true,
      'ejecutado_desde','migracion_controlada')
  );
  update public.producto_variantes set stock_decimal=0,stock=0 where id=159 and producto_id=156;
  select coalesce(sum(coalesce(stock_decimal,stock,0)),0) into v_angel_total
  from public.producto_variantes where producto_id=156 and coalesce(activo,true);
  update public.productos set stock=v_angel_total where user_id=156;

  -- STICH ya coincide físicamente. Solo completa el ledger de 0 a 1.
  insert into public.stock_movimientos(
    producto_id,variante_id,tipo,cantidad,unidad,cantidad_base,unidad_base,factor_conversion,
    stock_antes,stock_despues,usuario_id,usuario_email,sucursal_id,observaciones,motivo,
    correlation_id,idempotency_key,transaction_id,resultado,metadata
  ) values (
    60,63,'regularizacion_historica_entrada',1,'unidad',1,'unidad',1,
    0,1,v_actor,v_email,v_sucursal_stich,
    'Entrada histórica no registrada; snapshot y conteo físico confirmados en 1',
    'Regularización de ledger aprobada tras revisión de movimientos y conteo físico',
    v_corr_stich,'reconcile:20260812:stich-xl:historico',txid_current(),'aplicado',
    jsonb_build_object('conteo_fisico',1,'snapshot_encontrado',1,'ultimo_movimiento_previo',5637,
      'aprobado_por_negocio',true,'ejecutado_desde','migracion_controlada')
  );

  -- Verificación dentro de la misma transacción.
  if (select coalesce(stock_decimal,stock,0) from public.producto_variantes where id=159)<>0 then
    raise exception 'Falló la verificación final de ANGEL NIÑA';
  end if;
  if (select coalesce(stock_decimal,stock,0) from public.producto_variantes where id=63)<>1 then
    raise exception 'Falló la verificación final de STICH XL';
  end if;

  insert into public.business_audit_events(event_type,entity_type,entity_id,usuario_id,usuario_email,sucursal_id,correlation_id,metadata)
  values
    ('INVENTORY_PHYSICAL_RECONCILIATION','producto_variante','159',v_actor,v_email,v_sucursal_angel,v_corr_angel,
      jsonb_build_object('producto_id',156,'stock_sistema_antes',6,'conteo_fisico',0,'salida_historica_sin_ledger',22)),
    ('INVENTORY_LEDGER_RECONCILIATION','producto_variante','63',v_actor,v_email,v_sucursal_stich,v_corr_stich,
      jsonb_build_object('producto_id',60,'stock_sistema',1,'conteo_fisico',1,'entrada_historica_sin_ledger',1));
end $$;

commit;

-- Resultado esperado después de ejecutar:
-- select * from public.inventory_reconciliation
-- where (producto_id,variante_id) in ((156,159),(60,63));
