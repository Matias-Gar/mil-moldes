-- Transferencia de inventario entre sucursales.
-- Run in Supabase SQL Editor after scripts/enable_multi_sucursal.sql.

begin;

create extension if not exists pgcrypto;

create table if not exists public.transferencias_sucursal (
  id uuid primary key default gen_random_uuid(),
  sucursal_origen_id uuid not null references public.sucursales(id),
  sucursal_destino_id uuid not null references public.sucursales(id),
  producto_origen_id bigint not null,
  variante_origen_id bigint,
  producto_destino_id bigint not null,
  variante_destino_id bigint,
  producto_nombre text not null,
  variante_nombre text,
  cantidad numeric not null check (cantidad > 0),
  unidad text,
  cantidad_base numeric not null check (cantidad_base > 0),
  estado text not null default 'completada',
  usuario_id uuid,
  usuario_email text,
  observaciones text,
  created_at timestamptz not null default now(),
  constraint transferencias_sucursal_distintas check (sucursal_origen_id <> sucursal_destino_id)
);

create index if not exists idx_transferencias_sucursal_origen_fecha
  on public.transferencias_sucursal(sucursal_origen_id, created_at desc);

create index if not exists idx_transferencias_sucursal_destino_fecha
  on public.transferencias_sucursal(sucursal_destino_id, created_at desc);

alter table public.producto_variantes add column if not exists codigo_barra text;

create or replace function public.transferir_stock_sucursal(
  p_producto_origen_id bigint,
  p_variante_origen_id bigint,
  p_sucursal_origen_id uuid,
  p_sucursal_destino_id uuid,
  p_cantidad numeric,
  p_unidad text,
  p_cantidad_base numeric,
  p_usuario_id uuid default null,
  p_usuario_email text default null,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto_origen public.productos%rowtype;
  v_producto_destino public.productos%rowtype;
  v_variante_origen public.producto_variantes%rowtype;
  v_variante_destino public.producto_variantes%rowtype;
  v_stock_origen numeric;
  v_stock_destino numeric;
  v_transferencia_id uuid;
  v_variante_nombre text;
begin
  if p_producto_origen_id is null or p_sucursal_origen_id is null or p_sucursal_destino_id is null then
    raise exception 'Datos incompletos para transferencia';
  end if;

  if p_sucursal_origen_id = p_sucursal_destino_id then
    raise exception 'La sucursal destino debe ser distinta al origen';
  end if;

  if coalesce(p_cantidad_base, 0) <= 0 or coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select *
  into v_producto_origen
  from public.productos
  where user_id = p_producto_origen_id
    and sucursal_id = p_sucursal_origen_id
  for update;

  if not found then
    raise exception 'Producto de origen no encontrado';
  end if;

  if p_variante_origen_id is not null then
    select *
    into v_variante_origen
    from public.producto_variantes
    where id = p_variante_origen_id
      and producto_id = p_producto_origen_id
      and sucursal_id = p_sucursal_origen_id
    for update;

    if not found then
      raise exception 'Variante de origen no encontrada';
    end if;

    v_stock_origen := greatest(
      0,
      case
        when coalesce(v_variante_origen.stock_decimal, 0) > 0 then v_variante_origen.stock_decimal
        else coalesce(v_variante_origen.stock, 0)
      end
    );
    v_variante_nombre := coalesce(v_variante_origen.color, 'Unico');
  else
    v_stock_origen := greatest(0, coalesce(v_producto_origen.stock, 0));
    v_variante_nombre := null;
  end if;

  if v_stock_origen < p_cantidad_base then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_stock_origen, p_cantidad_base;
  end if;

  select *
  into v_producto_destino
  from public.productos p
  where p.sucursal_id = p_sucursal_destino_id
    and (
      (v_producto_origen.codigo_barra is not null and v_producto_origen.codigo_barra <> '' and p.codigo_barra = v_producto_origen.codigo_barra)
      or lower(coalesce(p.nombre, '')) = lower(coalesce(v_producto_origen.nombre, ''))
    )
  order by
    case
      when v_producto_origen.codigo_barra is not null and v_producto_origen.codigo_barra <> '' and p.codigo_barra = v_producto_origen.codigo_barra then 0
      else 1
    end,
    p.user_id
  limit 1
  for update;

  if not found then
    insert into public.productos (
      nombre,
      descripcion,
      precio,
      precio_compra,
      stock,
      imagen_url,
      category_id,
      categoria,
      codigo_barra,
      vista_producto,
      unidad_base,
      unidades_alternativas,
      factor_conversion,
      sucursal_id
    )
    values (
      v_producto_origen.nombre,
      v_producto_origen.descripcion,
      v_producto_origen.precio,
      v_producto_origen.precio_compra,
      0,
      v_producto_origen.imagen_url,
      null,
      v_producto_origen.categoria,
      nullif(v_producto_origen.codigo_barra, ''),
      v_producto_origen.vista_producto,
      v_producto_origen.unidad_base,
      v_producto_origen.unidades_alternativas,
      v_producto_origen.factor_conversion,
      p_sucursal_destino_id
    )
    returning * into v_producto_destino;
  end if;

  update public.productos
  set imagen_url = coalesce(
    nullif(public.productos.imagen_url, ''),
    nullif(v_producto_origen.imagen_url, ''),
    (
      select nullif(pi.imagen_url, '')
      from public.producto_imagenes pi
      where pi.producto_id = v_producto_origen.user_id
        and pi.sucursal_id = p_sucursal_origen_id
        and nullif(pi.imagen_url, '') is not null
      order by pi.id
      limit 1
    )
  )
  where user_id = v_producto_destino.user_id
    and sucursal_id = p_sucursal_destino_id
    and nullif(imagen_url, '') is null;

  insert into public.producto_imagenes (
    producto_id,
    imagen_url,
    sucursal_id
  )
  select
    v_producto_destino.user_id,
    pi.imagen_url,
    p_sucursal_destino_id
  from public.producto_imagenes pi
  where pi.producto_id = v_producto_origen.user_id
    and pi.sucursal_id = p_sucursal_origen_id
    and nullif(pi.imagen_url, '') is not null
    and not exists (
      select 1
      from public.producto_imagenes existing
      where existing.producto_id = v_producto_destino.user_id
        and existing.sucursal_id = p_sucursal_destino_id
        and existing.imagen_url = pi.imagen_url
    );

  if p_variante_origen_id is not null then
    select *
    into v_variante_destino
    from public.producto_variantes pv
    where pv.producto_id = v_producto_destino.user_id
      and pv.sucursal_id = p_sucursal_destino_id
      and (
        (coalesce(v_variante_origen.codigo_barra, '') <> '' and pv.codigo_barra = v_variante_origen.codigo_barra)
        or (coalesce(v_variante_origen.sku, '') <> '' and pv.sku = v_variante_origen.sku)
        or lower(coalesce(pv.color, '')) = lower(coalesce(v_variante_origen.color, ''))
      )
    order by
      case
        when coalesce(v_variante_origen.codigo_barra, '') <> '' and pv.codigo_barra = v_variante_origen.codigo_barra then 0
        when coalesce(v_variante_origen.sku, '') <> '' and pv.sku = v_variante_origen.sku then 1
        else 2
      end,
      pv.id
    limit 1
    for update;

    if not found then
      insert into public.producto_variantes (
        producto_id,
        color,
        precio,
        stock,
        stock_decimal,
        imagen_url,
        sku,
        codigo_barra,
        activo,
        sucursal_id
      )
      values (
        v_producto_destino.user_id,
        v_variante_origen.color,
        v_variante_origen.precio,
        0,
        0,
        v_variante_origen.imagen_url,
        nullif(v_variante_origen.sku, ''),
        nullif(v_variante_origen.codigo_barra, ''),
        coalesce(v_variante_origen.activo, true),
        p_sucursal_destino_id
      )
      returning * into v_variante_destino;
    end if;

    v_stock_destino := greatest(
      0,
      case
        when coalesce(v_variante_destino.stock_decimal, 0) > 0 then v_variante_destino.stock_decimal
        else coalesce(v_variante_destino.stock, 0)
      end
    );

    update public.producto_variantes
    set stock_decimal = v_stock_origen - p_cantidad_base,
        stock = floor(v_stock_origen - p_cantidad_base)
    where id = v_variante_origen.id;

    update public.producto_variantes
    set stock_decimal = v_stock_destino + p_cantidad_base,
        stock = floor(v_stock_destino + p_cantidad_base)
    where id = v_variante_destino.id;

    update public.productos p
    set stock = coalesce((
      select sum(greatest(
        0,
        case
          when coalesce(pv.stock_decimal, 0) > 0 then pv.stock_decimal
          else coalesce(pv.stock, 0)
        end
      ))
      from public.producto_variantes pv
      where pv.producto_id = p.user_id
        and pv.sucursal_id = p.sucursal_id
        and coalesce(pv.activo, true) = true
    ), 0)
    where p.user_id in (v_producto_origen.user_id, v_producto_destino.user_id);
  else
    v_stock_destino := greatest(0, coalesce(v_producto_destino.stock, 0));

    update public.productos
    set stock = v_stock_origen - p_cantidad_base
    where user_id = v_producto_origen.user_id
      and sucursal_id = p_sucursal_origen_id;

    update public.productos
    set stock = v_stock_destino + p_cantidad_base
    where user_id = v_producto_destino.user_id
      and sucursal_id = p_sucursal_destino_id;
  end if;

  insert into public.transferencias_sucursal (
    sucursal_origen_id,
    sucursal_destino_id,
    producto_origen_id,
    variante_origen_id,
    producto_destino_id,
    variante_destino_id,
    producto_nombre,
    variante_nombre,
    cantidad,
    unidad,
    cantidad_base,
    usuario_id,
    usuario_email,
    observaciones
  )
  values (
    p_sucursal_origen_id,
    p_sucursal_destino_id,
    v_producto_origen.user_id,
    case when p_variante_origen_id is null then null else v_variante_origen.id end,
    v_producto_destino.user_id,
    case when p_variante_origen_id is null then null else v_variante_destino.id end,
    v_producto_origen.nombre,
    v_variante_nombre,
    p_cantidad,
    p_unidad,
    p_cantidad_base,
    p_usuario_id,
    p_usuario_email,
    p_observaciones
  )
  returning id into v_transferencia_id;

  insert into public.stock_movimientos (
    producto_id,
    variante_id,
    tipo,
    cantidad,
    unidad,
    cantidad_base,
    sucursal_id,
    usuario_id,
    usuario_email,
    observaciones
  )
  values
  (
    v_producto_origen.user_id,
    case when p_variante_origen_id is null then null else v_variante_origen.id end,
    'transferencia_salida',
    p_cantidad,
    p_unidad,
    p_cantidad_base,
    p_sucursal_origen_id,
    p_usuario_id,
    p_usuario_email,
    concat('Transferencia a sucursal ', p_sucursal_destino_id, coalesce(': ' || p_observaciones, ''))
  ),
  (
    v_producto_destino.user_id,
    case when p_variante_origen_id is null then null else v_variante_destino.id end,
    'transferencia_entrada',
    p_cantidad,
    p_unidad,
    p_cantidad_base,
    p_sucursal_destino_id,
    p_usuario_id,
    p_usuario_email,
    concat('Transferencia desde sucursal ', p_sucursal_origen_id, coalesce(': ' || p_observaciones, ''))
  );

  insert into public.productos_historial (
    producto_id,
    accion,
    datos_anteriores,
    datos_nuevos,
    usuario_email,
    sucursal_id
  )
  values
  (
    v_producto_origen.user_id,
    'TRANSFER_OUT',
    to_jsonb(v_producto_origen),
    jsonb_build_object('transferencia_id', v_transferencia_id, 'cantidad_base', p_cantidad_base, 'destino_id', p_sucursal_destino_id),
    p_usuario_email,
    p_sucursal_origen_id
  ),
  (
    v_producto_destino.user_id,
    'TRANSFER_IN',
    to_jsonb(v_producto_destino),
    jsonb_build_object('transferencia_id', v_transferencia_id, 'cantidad_base', p_cantidad_base, 'origen_id', p_sucursal_origen_id),
    p_usuario_email,
    p_sucursal_destino_id
  );

  return v_transferencia_id;
end;
$$;

grant execute on function public.transferir_stock_sucursal(
  bigint,
  bigint,
  uuid,
  uuid,
  numeric,
  text,
  numeric,
  uuid,
  text,
  text
) to authenticated;

-- Repair transfers already completed before image cloning existed.
with transferencias_sin_imagen as (
  select
    t.producto_origen_id,
    t.producto_destino_id,
    t.sucursal_origen_id,
    t.sucursal_destino_id
  from public.transferencias_sucursal t
  left join public.producto_imagenes dest_img
    on dest_img.producto_id = t.producto_destino_id
   and dest_img.sucursal_id = t.sucursal_destino_id
  where dest_img.id is null
)
insert into public.producto_imagenes (
  producto_id,
  imagen_url,
  sucursal_id
)
select distinct
  t.producto_destino_id,
  origen_img.imagen_url,
  t.sucursal_destino_id
from transferencias_sin_imagen t
join public.producto_imagenes origen_img
  on origen_img.producto_id = t.producto_origen_id
 and origen_img.sucursal_id = t.sucursal_origen_id
where nullif(origen_img.imagen_url, '') is not null
  and not exists (
    select 1
    from public.producto_imagenes existing
    where existing.producto_id = t.producto_destino_id
      and existing.sucursal_id = t.sucursal_destino_id
      and existing.imagen_url = origen_img.imagen_url
  );

update public.productos destino
set imagen_url = origen_imagen.imagen_url
from (
  select distinct on (t.producto_destino_id, t.sucursal_destino_id)
    t.producto_destino_id,
    t.sucursal_destino_id,
    coalesce(nullif(origen_producto.imagen_url, ''), nullif(origen_img.imagen_url, '')) as imagen_url
  from public.transferencias_sucursal t
  join public.productos origen_producto
    on origen_producto.user_id = t.producto_origen_id
   and origen_producto.sucursal_id = t.sucursal_origen_id
  left join public.producto_imagenes origen_img
    on origen_img.producto_id = t.producto_origen_id
   and origen_img.sucursal_id = t.sucursal_origen_id
   and nullif(origen_img.imagen_url, '') is not null
  order by t.producto_destino_id, t.sucursal_destino_id, origen_img.id
) origen_imagen
where destino.user_id = origen_imagen.producto_destino_id
  and destino.sucursal_id = origen_imagen.sucursal_destino_id
  and nullif(destino.imagen_url, '') is null
  and nullif(origen_imagen.imagen_url, '') is not null;

commit;
