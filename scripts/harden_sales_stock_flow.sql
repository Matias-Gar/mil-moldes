-- Harden sales + stock flow for Mil Moldes.
-- Run this in Supabase SQL Editor.
--
-- Goals:
-- - Products without unit conversion keep working with plain stock.
-- - Rollo/metro products validate against cantidad_base + decimal stock.
-- - ventas_detalle no longer blocks 1 metro because variant legacy stock is 0.
-- - Stock audit stores before/after, venta_id and detalle_id when available.
-- - Sales can be marked as confirmed/failed/anulled without deleting history.

begin;

-- 1) Metadata / states
alter table public.ventas
  add column if not exists error_message text,
  add column if not exists finalized_at timestamptz,
  add column if not exists cashbox_id text default 'main';

alter table public.ventas
  alter column estado set default 'efectivizada';

update public.ventas
set estado = 'efectivizada'
where estado is null or trim(estado) = '';

-- 2) Keep ventas_detalle.cantidad as-is.
-- Important: some databases already have views like ventas_con_utilidad depending
-- on ventas_detalle.cantidad, so changing its type can fail.
-- cantidad is kept as the visible/count column for compatibility.
-- cantidad_base is the real stock/accounting quantity for rollo/metro.
alter table public.ventas_detalle
  alter column cantidad_base type numeric using cantidad_base::numeric;

-- 3) Stronger audit columns. Existing stock_movimientos rows remain valid.
alter table public.stock_movimientos
  add column if not exists stock_antes numeric,
  add column if not exists stock_despues numeric,
  add column if not exists venta_id bigint,
  add column if not exists detalle_id bigint,
  add column if not exists motivo text,
  add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists idx_stock_movimientos_producto_fecha
  on public.stock_movimientos(producto_id, created_at desc);

create index if not exists idx_stock_movimientos_venta
  on public.stock_movimientos(venta_id);

-- 4) Drop old custom ventas_detalle triggers.
-- This intentionally keeps internal FK triggers, but removes legacy app triggers
-- that validate variant.stock as integer and ignore cantidad_base.
do $$
declare
  r record;
begin
  for r in
    select tgname
    from pg_trigger
    where tgrelid = 'public.ventas_detalle'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on public.ventas_detalle', r.tgname);
  end loop;
end $$;

-- 5) Stock validation compatible with both old and converted products.
create or replace function public.validate_ventas_detalle_stock()
returns trigger
language plpgsql
as $$
declare
  v_producto record;
  v_variante record;
  v_qty_base numeric;
  v_available numeric;
  v_has_conversion boolean;
begin
  if coalesce(new.tipo, 'producto') <> 'producto' or new.producto_id is null then
    return new;
  end if;

  select
    p.user_id,
    p.nombre,
    coalesce(p.stock, 0)::numeric as stock,
    coalesce(p.factor_conversion, 0)::numeric as factor_conversion,
    coalesce(cardinality(p.unidades_alternativas), 0) as alternativas_count
  into v_producto
  from public.productos p
  where p.user_id = new.producto_id;

  if not found then
    raise exception 'Producto no encontrado (%)', new.producto_id;
  end if;

  v_qty_base := coalesce(new.cantidad_base, new.cantidad, 0)::numeric;
  if v_qty_base <= 0 then
    raise exception 'Cantidad invalida para %', coalesce(v_producto.nombre, 'producto');
  end if;

  v_has_conversion := v_producto.factor_conversion > 0 and v_producto.alternativas_count > 0;

  if v_has_conversion then
    -- Rollo/metro: product stock is authoritative and cantidad_base is in base unit.
    v_available := v_producto.stock;
  elsif new.variante_id is not null then
    select
      pv.id,
      pv.color,
      coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)::numeric as stock
    into v_variante
    from public.producto_variantes pv
    where pv.id = new.variante_id;

    if not found then
      raise exception 'Variante no encontrada (%)', new.variante_id;
    end if;

    v_available := v_variante.stock;
  else
    -- Old/simple products: plain product stock.
    v_available := v_producto.stock;
  end if;

  if v_qty_base > v_available + 0.0001 then
    raise exception 'Stock insuficiente para % (stock=% , solicitado=%)',
      coalesce(new.color, v_variante.color, v_producto.nombre, 'producto'),
      round(v_available, 3),
      round(v_qty_base, 3);
  end if;

  return new;
end;
$$;

create trigger trg_validate_ventas_detalle_stock
before insert on public.ventas_detalle
for each row
execute function public.validate_ventas_detalle_stock();

-- 6) Optional all-in-one transactional sale RPC.
-- The current UI can keep using its flow, but this function is ready for migration.
create or replace function public.crear_venta_completa(
  p_venta jsonb,
  p_items jsonb,
  p_pagos jsonb default '[]'::jsonb,
  p_usuario_id uuid default null,
  p_usuario_email text default null,
  p_cashbox_id text default 'main',
  p_sucursal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta_id bigint;
  v_item jsonb;
  v_pago jsonb;
  v_producto record;
  v_variante record;
  v_detalle_id bigint;
  v_producto_id bigint;
  v_variante_id bigint;
  v_qty_visible numeric;
  v_qty_visible_db numeric;
  v_qty_base numeric;
  v_unidad text;
  v_unidad_base text;
  v_factor numeric;
  v_has_conversion boolean;
  v_stock_antes numeric;
  v_stock_despues numeric;
  v_precio_unitario numeric;
  v_costo_unitario numeric;
  v_color text;
  v_descripcion text;
  v_metodo text;
  v_monto numeric;
  v_component jsonb;
  v_pack_detalle_id bigint;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene items';
  end if;

  insert into public.ventas (
    cliente_nombre,
    cliente_telefono,
    cliente_email,
    cliente_nit,
    requiere_factura,
    modo_pago,
    total,
    pago,
    cambio,
    usuario_id,
    usuario_email,
    descuentos,
    costos_extra,
    estado,
    finalized_at,
    cashbox_id
    ,sucursal_id
  )
  values (
    coalesce(p_venta->>'cliente_nombre', ''),
    coalesce(p_venta->>'cliente_telefono', ''),
    coalesce(p_venta->>'cliente_email', ''),
    coalesce(p_venta->>'cliente_nit', ''),
    coalesce((p_venta->>'requiere_factura')::boolean, false),
    coalesce(p_venta->>'modo_pago', ''),
    coalesce((p_venta->>'total')::numeric, 0),
    coalesce((p_venta->>'pago')::numeric, 0),
    coalesce((p_venta->>'cambio')::numeric, 0),
    p_usuario_id,
    p_usuario_email,
    coalesce((p_venta->>'descuentos')::numeric, 0),
    coalesce(p_venta->'costos_extra', '{}'::jsonb),
    'efectivizada',
    now(),
    coalesce(p_cashbox_id, 'main'),
    p_sucursal_id
  )
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::bigint;
    v_variante_id := nullif(v_item->>'variante_id', '')::bigint;
    v_qty_visible := coalesce((v_item->>'cantidad')::numeric, (v_item->>'cantidad_display')::numeric, 1);
    v_qty_visible_db := greatest(1, round(v_qty_visible));
    v_unidad := coalesce(nullif(v_item->>'unidad', ''), 'unidad');
    v_precio_unitario := coalesce((v_item->>'precio_unitario')::numeric, (v_item->>'precio')::numeric, 0);
    v_costo_unitario := coalesce((v_item->>'costo_unitario')::numeric, 0);
    v_color := nullif(v_item->>'color', '');
    v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), nullif(v_item->>'nombre', ''), 'Producto');

    select
      p.user_id,
      p.nombre,
      coalesce(p.stock, 0)::numeric as stock,
      coalesce(p.precio, 0)::numeric as precio,
      coalesce(p.precio_compra, 0)::numeric as precio_compra,
      coalesce(nullif(p.unidad_base, ''), v_unidad, 'unidad') as unidad_base,
      coalesce(p.factor_conversion, 0)::numeric as factor_conversion,
      coalesce(cardinality(p.unidades_alternativas), 0) as alternativas_count
    into v_producto
    from public.productos p
    where p.user_id = v_producto_id
      and (p_sucursal_id is null or p.sucursal_id = p_sucursal_id)
    for update;

    if not found then
      raise exception 'Producto no encontrado (%)', v_producto_id;
    end if;

    v_unidad_base := coalesce(v_producto.unidad_base, v_unidad, 'unidad');
    v_factor := v_producto.factor_conversion;
    v_has_conversion := v_factor > 0 and v_producto.alternativas_count > 0;
    v_qty_base := coalesce((v_item->>'cantidad_base')::numeric, null);
    if v_qty_base is null then
      v_qty_base := case
        when v_has_conversion and v_unidad <> v_unidad_base then v_qty_visible / v_factor
        else v_qty_visible
      end;
    end if;

    if v_has_conversion then
      v_stock_antes := v_producto.stock;
    elsif v_variante_id is not null then
      select pv.id, pv.color, coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)::numeric as stock
      into v_variante
      from public.producto_variantes pv
      where pv.id = v_variante_id
        and pv.producto_id = v_producto_id
        and (p_sucursal_id is null or pv.sucursal_id = p_sucursal_id)
      for update;
      if not found then
        raise exception 'Variante no encontrada (%)', v_variante_id;
      end if;
      v_stock_antes := v_variante.stock;
      v_color := coalesce(v_color, v_variante.color);
    else
      v_stock_antes := v_producto.stock;
    end if;

    if v_qty_base > v_stock_antes + 0.0001 then
      raise exception 'Stock insuficiente para % (stock=% , solicitado=%)',
        coalesce(v_color, v_producto.nombre, 'producto'),
        round(v_stock_antes, 3),
        round(v_qty_base, 3);
    end if;

    insert into public.ventas_detalle (
      venta_id,
      producto_id,
      cantidad,
      cantidad_base,
      unidad,
      precio_unitario,
      costo_unitario,
      variante_id,
      color,
      descripcion,
      tipo,
      created_at,
      usuario_email,
      sucursal_id
    )
    values (
      v_venta_id,
      v_producto_id,
      v_qty_visible_db,
      v_qty_base,
      v_unidad,
      v_precio_unitario,
      v_costo_unitario,
      v_variante_id,
      v_color,
      v_descripcion,
      'producto',
      now(),
      p_usuario_email,
      p_sucursal_id
    )
    returning id into v_detalle_id;

    v_stock_despues := greatest(0, v_stock_antes - v_qty_base);

    if v_has_conversion then
      update public.productos
      set stock = v_stock_despues
      where user_id = v_producto_id;

      if v_variante_id is not null then
        update public.producto_variantes
        set stock_decimal = v_stock_despues,
            stock = floor(v_stock_despues)
        where id = v_variante_id;
      end if;
    elsif v_variante_id is not null then
      update public.producto_variantes
      set stock_decimal = v_stock_despues,
          stock = floor(v_stock_despues)
      where id = v_variante_id;

      update public.productos
      set stock = (
        select coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)), 0)
        from public.producto_variantes pv
        where pv.producto_id = v_producto_id
          and (p_sucursal_id is null or pv.sucursal_id = p_sucursal_id)
          and coalesce(pv.activo, true) = true
      )
      where user_id = v_producto_id;
    else
      update public.productos
      set stock = v_stock_despues
      where user_id = v_producto_id;
    end if;

    insert into public.stock_movimientos (
      producto_id,
      variante_id,
      tipo,
      cantidad,
      unidad,
      cantidad_base,
      usuario_id,
      usuario_email,
      observaciones,
      stock_antes,
      stock_despues,
      venta_id,
      detalle_id,
      motivo,
      sucursal_id,
      metadata
    )
    values (
      v_producto_id,
      v_variante_id,
      'venta',
      v_qty_visible,
      v_unidad,
      v_qty_base,
      p_usuario_id,
      p_usuario_email,
      'Salida automatica por venta #' || v_venta_id,
      v_stock_antes,
      v_stock_despues,
      v_venta_id,
      v_detalle_id,
      'venta_confirmada',
      p_sucursal_id,
      jsonb_build_object('color', v_color, 'has_conversion', v_has_conversion)
    );
  end loop;

  for v_pago in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb))
  loop
    v_metodo := coalesce(v_pago->>'metodo_pago', v_pago->>'metodo', '');
    v_monto := coalesce((v_pago->>'monto')::numeric, 0);
    if v_metodo <> '' and v_monto > 0 then
      insert into public.ventas_pagos (venta_id, monto, metodo_pago, fecha, usuario_email, sucursal_id)
      values (v_venta_id, v_monto, v_metodo, now(), p_usuario_email, p_sucursal_id);

      insert into public.cash_movements (
        user_id,
        cashbox_id,
        date,
        type,
        payment_method,
        amount,
        description,
        created_at,
        sucursal_id
      )
      values (
        p_usuario_id,
        coalesce(p_cashbox_id, 'main'),
        current_date,
        'income',
        case
          when lower(v_metodo) in ('efectivo', 'cash') then 'cash'
          when lower(v_metodo) in ('qr') then 'qr'
          when lower(v_metodo) in ('tarjeta', 'card') then 'card'
          when lower(v_metodo) in ('transferencia', 'transfer') then 'transfer'
          else 'other'
        end,
        v_monto,
        'Ingreso automatico por venta #' || v_venta_id,
        now(),
        p_sucursal_id
      );
    end if;
  end loop;

  return jsonb_build_object('id', v_venta_id, 'estado', 'efectivizada');
exception
  when others then
    -- Postgres rolls back everything in this function automatically.
    raise;
end;
$$;

-- 7) Transactional stock increase.
create or replace function public.aumentar_stock_completo(
  p_producto_id bigint,
  p_variante_id bigint default null,
  p_cantidad numeric default 0,
  p_unidad text default null,
  p_usuario_id uuid default null,
  p_usuario_email text default null,
  p_sucursal_id uuid default null,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto record;
  v_variante record;
  v_unidad text;
  v_unidad_base text;
  v_factor numeric;
  v_has_conversion boolean;
  v_base_increase numeric;
  v_stock_antes numeric;
  v_stock_despues numeric;
  v_producto_stock numeric;
begin
  if p_producto_id is null or coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Cantidad invalida para aumento de stock';
  end if;

  select
    p.user_id,
    p.nombre,
    coalesce(p.stock, 0)::numeric as stock,
    coalesce(nullif(p.unidad_base, ''), 'unidad') as unidad_base,
    coalesce(p.factor_conversion, 0)::numeric as factor_conversion,
    coalesce(cardinality(p.unidades_alternativas), 0) as alternativas_count,
    p.sucursal_id
  into v_producto
  from public.productos p
  where p.user_id = p_producto_id
    and (p_sucursal_id is null or p.sucursal_id = p_sucursal_id)
  for update;

  if not found then
    raise exception 'Producto no encontrado (%)', p_producto_id;
  end if;

  v_unidad_base := v_producto.unidad_base;
  v_unidad := coalesce(nullif(p_unidad, ''), v_unidad_base);
  v_factor := v_producto.factor_conversion;
  v_has_conversion := v_factor > 0 and v_producto.alternativas_count > 0;
  v_base_increase := case
    when v_has_conversion and v_unidad <> v_unidad_base then p_cantidad / v_factor
    else p_cantidad
  end;

  if p_variante_id is not null then
    select pv.id, pv.color, coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)::numeric as stock
    into v_variante
    from public.producto_variantes pv
    where pv.id = p_variante_id
      and pv.producto_id = p_producto_id
      and (p_sucursal_id is null or pv.sucursal_id = p_sucursal_id)
    for update;

    if not found then
      raise exception 'Variante no encontrada (%)', p_variante_id;
    end if;
  end if;

  if v_has_conversion then
    v_stock_antes := v_producto.stock;
    v_stock_despues := v_stock_antes + v_base_increase;

    update public.productos
    set stock = v_stock_despues
    where user_id = p_producto_id
      and (p_sucursal_id is null or sucursal_id = p_sucursal_id);

    if p_variante_id is not null then
      update public.producto_variantes
      set stock_decimal = v_stock_despues,
          stock = floor(v_stock_despues)
      where id = p_variante_id
        and (p_sucursal_id is null or sucursal_id = p_sucursal_id);
    end if;

    v_producto_stock := v_stock_despues;
  elsif p_variante_id is not null then
    v_stock_antes := v_variante.stock;
    v_stock_despues := v_stock_antes + v_base_increase;

    update public.producto_variantes
    set stock_decimal = v_stock_despues,
        stock = floor(v_stock_despues)
    where id = p_variante_id
      and (p_sucursal_id is null or sucursal_id = p_sucursal_id);

    update public.productos
    set stock = (
      select coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)), 0)
      from public.producto_variantes pv
      where pv.producto_id = p_producto_id
        and (p_sucursal_id is null or pv.sucursal_id = p_sucursal_id)
        and coalesce(pv.activo, true) = true
    )
    where user_id = p_producto_id
      and (p_sucursal_id is null or sucursal_id = p_sucursal_id)
    returning stock into v_producto_stock;
  else
    v_stock_antes := v_producto.stock;
    v_stock_despues := v_stock_antes + v_base_increase;
    update public.productos
    set stock = v_stock_despues
    where user_id = p_producto_id
      and (p_sucursal_id is null or sucursal_id = p_sucursal_id)
    returning stock into v_producto_stock;
  end if;

  insert into public.stock_movimientos (
    producto_id,
    variante_id,
    tipo,
    cantidad,
    unidad,
    cantidad_base,
    usuario_id,
    usuario_email,
    sucursal_id,
    observaciones,
    stock_antes,
    stock_despues,
    motivo,
    metadata
  )
  values (
    p_producto_id,
    p_variante_id,
    'aumento',
    p_cantidad,
    v_unidad,
    v_base_increase,
    p_usuario_id,
    p_usuario_email,
    p_sucursal_id,
    coalesce(p_observaciones, 'Aumento de stock'),
    v_stock_antes,
    v_stock_despues,
    'aumento_stock',
    jsonb_build_object('has_conversion', v_has_conversion)
  );

  return jsonb_build_object(
    'producto_id', p_producto_id,
    'variante_id', p_variante_id,
    'cantidad', p_cantidad,
    'unidad', v_unidad,
    'cantidad_base', v_base_increase,
    'stock_antes', v_stock_antes,
    'stock_despues', v_stock_despues,
    'producto_stock', v_producto_stock
  );
end;
$$;

-- 7) Admin-only sale deletion with stock restoration.
-- Use this when a confirmed sale must be removed because the customer changed
-- the purchase after the sale was finalized. The function restores stock first
-- and then deletes sale details/payments/cash rows in one transaction.
create or replace function public.eliminar_venta_con_restock(
  p_venta_id bigint,
  p_admin_id uuid default null,
  p_admin_email text default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_sale record;
  v_restore_source text;
  v_row record;
  v_producto record;
  v_qty_base numeric;
  v_qty_visible numeric;
  v_unidad text;
  v_stock_antes numeric;
  v_stock_despues numeric;
  v_restored_count integer := 0;
begin
  if p_venta_id is null then
    raise exception 'Venta invalida';
  end if;

  select lower(coalesce(rol, '')) into v_admin_role
  from public.perfiles
  where id = p_admin_id;

  if coalesce(v_admin_role, '') <> 'admin' then
    raise exception 'Solo el administrador puede eliminar ventas';
  end if;

  select * into v_sale
  from public.ventas
  where id = p_venta_id
  for update;

  if not found then
    raise exception 'Venta no encontrada (%)', p_venta_id;
  end if;

  if exists (
    select 1
    from public.stock_movimientos sm
    where sm.tipo = 'venta'
      and (
        sm.venta_id = p_venta_id
        or sm.observaciones ilike ('%venta #' || p_venta_id || '%')
      )
  ) then
    v_restore_source := 'stock_movimientos';
  else
    v_restore_source := 'ventas_detalle';
  end if;

  if v_restore_source = 'stock_movimientos' then
    for v_row in
      select
        sm.producto_id,
        sm.variante_id,
        coalesce(sm.cantidad_base, sm.cantidad, 0)::numeric as cantidad_base,
        coalesce(sm.cantidad, sm.cantidad_base, 0)::numeric as cantidad,
        coalesce(nullif(sm.unidad, ''), 'unidad') as unidad,
        sm.id as source_id
      from public.stock_movimientos sm
      where sm.tipo = 'venta'
        and sm.producto_id is not null
        and (
          sm.venta_id = p_venta_id
          or sm.observaciones ilike ('%venta #' || p_venta_id || '%')
        )
      order by sm.id
    loop
      v_qty_base := coalesce(v_row.cantidad_base, 0);
      v_qty_visible := coalesce(v_row.cantidad, v_qty_base);
      v_unidad := coalesce(v_row.unidad, 'unidad');
      if v_qty_base <= 0 then
        continue;
      end if;

      select
        p.user_id,
        p.nombre,
        coalesce(p.stock, 0)::numeric as stock,
        coalesce(p.factor_conversion, 0)::numeric as factor_conversion,
        coalesce(cardinality(p.unidades_alternativas), 0) as alternativas_count
      into v_producto
      from public.productos p
      where p.user_id = v_row.producto_id
      for update;

      if not found then
        raise exception 'Producto no encontrado para restaurar stock (%)', v_row.producto_id;
      end if;

      if v_row.variante_id is not null then
        select coalesce(stock_decimal, stock, 0)::numeric
        into v_stock_antes
        from public.producto_variantes
        where id = v_row.variante_id
        for update;

        if not found then
          raise exception 'Variante no encontrada para restaurar stock (%)', v_row.variante_id;
        end if;

        v_stock_despues := v_stock_antes + v_qty_base;

        update public.producto_variantes
        set stock_decimal = v_stock_despues,
            stock = floor(v_stock_despues)
        where id = v_row.variante_id;

        if v_producto.factor_conversion > 0 and v_producto.alternativas_count > 0 then
          update public.productos
          set stock = coalesce(stock, 0)::numeric + v_qty_base
          where user_id = v_row.producto_id
          returning stock into v_stock_despues;
        else
          update public.productos
          set stock = (
            select coalesce(sum(coalesce(pv.stock_decimal, pv.stock, 0)), 0)
            from public.producto_variantes pv
            where pv.producto_id = v_row.producto_id
              and coalesce(pv.activo, true) = true
          )
          where user_id = v_row.producto_id;
        end if;
      else
        v_stock_antes := v_producto.stock;
        v_stock_despues := v_stock_antes + v_qty_base;

        update public.productos
        set stock = v_stock_despues
        where user_id = v_row.producto_id;
      end if;

      insert into public.stock_movimientos (
        producto_id,
        variante_id,
        tipo,
        cantidad,
        unidad,
        cantidad_base,
        usuario_id,
        usuario_email,
        observaciones,
        stock_antes,
        stock_despues,
        motivo,
        metadata
      )
      values (
        v_row.producto_id,
        v_row.variante_id,
        'anulacion_venta',
        v_qty_visible,
        v_unidad,
        v_qty_base,
        p_admin_id,
        p_admin_email,
        'Stock restaurado por eliminacion de venta ' || p_venta_id,
        v_stock_antes,
        v_stock_despues,
        'venta_eliminada',
        jsonb_build_object(
          'venta_eliminada_id', p_venta_id,
          'source', v_restore_source,
          'source_movimiento_id', v_row.source_id,
          'motivo', p_motivo
        )
      );

      v_restored_count := v_restored_count + 1;
    end loop;
  else
    for v_row in
      select
        vd.producto_id,
        vd.variante_id,
        coalesce(vd.cantidad_base, vd.cantidad, 0)::numeric as cantidad_base,
        coalesce(vd.cantidad, vd.cantidad_base, 0)::numeric as cantidad,
        coalesce(nullif(vd.unidad, ''), 'unidad') as unidad,
        vd.id as source_id
      from public.ventas_detalle vd
      where vd.venta_id = p_venta_id
        and coalesce(vd.tipo, 'producto') = 'producto'
        and vd.producto_id is not null
      order by vd.id
    loop
      v_qty_base := coalesce(v_row.cantidad_base, 0);
      v_qty_visible := coalesce(v_row.cantidad, v_qty_base);
      v_unidad := coalesce(v_row.unidad, 'unidad');
      if v_qty_base <= 0 then
        continue;
      end if;

      select
        p.user_id,
        p.nombre,
        coalesce(p.stock, 0)::numeric as stock,
        coalesce(p.factor_conversion, 0)::numeric as factor_conversion,
        coalesce(cardinality(p.unidades_alternativas), 0) as alternativas_count
      into v_producto
      from public.productos p
      where p.user_id = v_row.producto_id
      for update;

      if not found then
        raise exception 'Producto no encontrado para restaurar stock (%)', v_row.producto_id;
      end if;

      if v_row.variante_id is not null then
        select coalesce(stock_decimal, stock, 0)::numeric
        into v_stock_antes
        from public.producto_variantes
        where id = v_row.variante_id
        for update;

        if not found then
          raise exception 'Variante no encontrada para restaurar stock (%)', v_row.variante_id;
        end if;

        v_stock_despues := v_stock_antes + v_qty_base;

        update public.producto_variantes
        set stock_decimal = v_stock_despues,
            stock = floor(v_stock_despues)
        where id = v_row.variante_id;

        if v_producto.factor_conversion > 0 and v_producto.alternativas_count > 0 then
          update public.productos
          set stock = coalesce(stock, 0)::numeric + v_qty_base
          where user_id = v_row.producto_id
          returning stock into v_stock_despues;
        else
          update public.productos
          set stock = (
            select coalesce(sum(coalesce(pv.stock_decimal, pv.stock, 0)), 0)
            from public.producto_variantes pv
            where pv.producto_id = v_row.producto_id
              and coalesce(pv.activo, true) = true
          )
          where user_id = v_row.producto_id;
        end if;
      else
        v_stock_antes := v_producto.stock;
        v_stock_despues := v_stock_antes + v_qty_base;

        update public.productos
        set stock = v_stock_despues
        where user_id = v_row.producto_id;
      end if;

      insert into public.stock_movimientos (
        producto_id,
        variante_id,
        tipo,
        cantidad,
        unidad,
        cantidad_base,
        usuario_id,
        usuario_email,
        observaciones,
        stock_antes,
        stock_despues,
        motivo,
        metadata
      )
      values (
        v_row.producto_id,
        v_row.variante_id,
        'anulacion_venta',
        v_qty_visible,
        v_unidad,
        v_qty_base,
        p_admin_id,
        p_admin_email,
        'Stock restaurado por eliminacion de venta ' || p_venta_id,
        v_stock_antes,
        v_stock_despues,
        'venta_eliminada',
        jsonb_build_object(
          'venta_eliminada_id', p_venta_id,
          'source', v_restore_source,
          'source_detalle_id', v_row.source_id,
          'motivo', p_motivo
        )
      );

      v_restored_count := v_restored_count + 1;
    end loop;
  end if;

  delete from public.cash_movements
  where description ilike ('%venta #' || p_venta_id || '%');

  delete from public.stock_movimientos
  where tipo = 'venta'
    and (
      venta_id = p_venta_id
      or observaciones ilike ('%venta #' || p_venta_id || '%')
    );

  delete from public.ventas_pagos
  where venta_id = p_venta_id;

  delete from public.ventas_detalle
  where venta_id = p_venta_id;

  delete from public.ventas
  where id = p_venta_id;

  return jsonb_build_object(
    'id', p_venta_id,
    'deleted', true,
    'stock_restored_rows', v_restored_count,
    'source', v_restore_source
  );
end;
$$;

commit;
