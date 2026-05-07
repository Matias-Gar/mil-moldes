-- Enable multi-sucursal support for Mil Moldes.
-- Run in Supabase SQL Editor.
--
-- Phase 1 goals:
-- - Keep the current app working by assigning all existing data to one default branch.
-- - Add sucursal_id to operational tables.
-- - Add membership/role tables for branch-level access.
-- - Add triggers so old inserts without sucursal_id keep landing in "central".
-- - Prepare indexes and consistency checks before enabling strict RLS in a later phase.
--
-- After this script, the app still needs UI/query changes to select and filter by sucursal.

begin;

create extension if not exists pgcrypto;

-- 1) Core branch tables
create table if not exists public.sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  direccion text,
  telefono text,
  activa boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usuario_sucursales (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  rol text not null check (rol in ('admin', 'administracion', 'vendedor', 'almacen')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (usuario_id, sucursal_id)
);

create table if not exists public.sucursal_settings (
  sucursal_id uuid primary key references public.sucursales(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.sucursales (nombre, slug, activa)
values ('Sucursal Central', 'central', true)
on conflict (slug) do update
set nombre = excluded.nombre,
    activa = true,
    updated_at = now();

insert into public.sucursal_settings (sucursal_id, settings)
select id, '{}'::jsonb
from public.sucursales
where slug = 'central'
on conflict (sucursal_id) do nothing;

-- Assign current full admins to the default branch.
insert into public.usuario_sucursales (usuario_id, sucursal_id, rol, activo)
select p.id, s.id, 'admin', true
from public.perfiles p
cross join public.sucursales s
where lower(coalesce(p.rol, '')) = 'admin'
  and s.slug = 'central'
on conflict (usuario_id, sucursal_id) do update
set rol = excluded.rol,
    activo = true;

-- Assign non-client staff to the default branch with their current role.
insert into public.usuario_sucursales (usuario_id, sucursal_id, rol, activo)
select
  p.id,
  s.id,
  case
    when lower(coalesce(p.rol, '')) in ('administracion', 'vendedor', 'almacen') then lower(p.rol)
    else 'vendedor'
  end,
  true
from public.perfiles p
cross join public.sucursales s
where lower(coalesce(p.rol, '')) in ('administracion', 'vendedor', 'almacen')
  and s.slug = 'central'
on conflict (usuario_id, sucursal_id) do update
set rol = excluded.rol,
    activo = true;

-- 2) Helper functions
create or replace function public.default_sucursal_id()
returns uuid
language sql
stable
as $$
  select id
  from public.sucursales
  where slug = 'central'
  limit 1
$$;

create or replace function public.user_can_access_sucursal(p_sucursal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuario_sucursales us
    where us.usuario_id = auth.uid()
      and us.sucursal_id = p_sucursal_id
      and us.activo = true
  )
$$;

create or replace function public.user_role_in_sucursal(p_sucursal_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select us.rol
  from public.usuario_sucursales us
  where us.usuario_id = auth.uid()
    and us.sucursal_id = p_sucursal_id
    and us.activo = true
  limit 1
$$;

create or replace function public.is_admin_in_sucursal(p_sucursal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuario_sucursales us
    where us.usuario_id = auth.uid()
      and us.sucursal_id = p_sucursal_id
      and us.rol = 'admin'
      and us.activo = true
  )
$$;

-- 3) Add sucursal_id to operational tables.
alter table public.carritos_pendientes add column if not exists sucursal_id uuid;
alter table public.cash_closures add column if not exists sucursal_id uuid;
alter table public.cash_movements add column if not exists sucursal_id uuid;
alter table public.categorias add column if not exists sucursal_id uuid;
alter table public.clientes add column if not exists sucursal_id uuid;
alter table public.pack_productos add column if not exists sucursal_id uuid;
alter table public.packs add column if not exists sucursal_id uuid;
alter table public.producto_imagenes add column if not exists sucursal_id uuid;
alter table public.producto_variantes add column if not exists sucursal_id uuid;
alter table public.producto_variantes add column if not exists codigo_barra text;
alter table public.productos add column if not exists sucursal_id uuid;
alter table public.productos_historial add column if not exists sucursal_id uuid;
alter table public.promociones add column if not exists sucursal_id uuid;
alter table public.stock_movimientos add column if not exists sucursal_id uuid;
alter table public.ventas add column if not exists sucursal_id uuid;
alter table public.ventas_detalle add column if not exists sucursal_id uuid;
alter table public.ventas_pagos add column if not exists sucursal_id uuid;

-- 4) Backfill all current data to the default branch.
update public.carritos_pendientes set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.cash_closures set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.cash_movements set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.categorias set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.clientes set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.packs set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.productos set sucursal_id = public.default_sucursal_id() where sucursal_id is null;

update public.producto_variantes pv
set sucursal_id = p.sucursal_id
from public.productos p
where pv.producto_id = p.user_id
  and pv.sucursal_id is null;

update public.producto_imagenes pi
set sucursal_id = p.sucursal_id
from public.productos p
where pi.producto_id = p.user_id
  and pi.sucursal_id is null;

update public.promociones pr
set sucursal_id = p.sucursal_id
from public.productos p
where pr.producto_id = p.user_id
  and pr.sucursal_id is null;

update public.pack_productos pp
set sucursal_id = pk.sucursal_id
from public.packs pk
where pp.pack_id = pk.id
  and pp.sucursal_id is null;

update public.productos_historial ph
set sucursal_id = coalesce(p.sucursal_id, public.default_sucursal_id())
from public.productos p
where ph.producto_id = p.user_id
  and ph.sucursal_id is null;

update public.stock_movimientos sm
set sucursal_id = coalesce(p.sucursal_id, public.default_sucursal_id())
from public.productos p
where sm.producto_id = p.user_id
  and sm.sucursal_id is null;

update public.ventas set sucursal_id = public.default_sucursal_id() where sucursal_id is null;

update public.ventas_detalle vd
set sucursal_id = v.sucursal_id
from public.ventas v
where vd.venta_id = v.id
  and vd.sucursal_id is null;

update public.ventas_pagos vp
set sucursal_id = v.sucursal_id
from public.ventas v
where vp.venta_id = v.id
  and vp.sucursal_id is null;

-- Fallback for orphan nullable relationships.
update public.producto_variantes set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.producto_imagenes set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.promociones set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.pack_productos set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.productos_historial set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.stock_movimientos set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.ventas_detalle set sucursal_id = public.default_sucursal_id() where sucursal_id is null;
update public.ventas_pagos set sucursal_id = public.default_sucursal_id() where sucursal_id is null;

-- 5) Add foreign keys to sucursales.
do $$
declare
  t text;
  constraint_name text;
begin
  foreach t in array array[
    'carritos_pendientes',
    'cash_closures',
    'cash_movements',
    'categorias',
    'clientes',
    'pack_productos',
    'packs',
    'producto_imagenes',
    'producto_variantes',
    'productos',
    'productos_historial',
    'promociones',
    'stock_movimientos',
    'ventas',
    'ventas_detalle',
    'ventas_pagos'
  ]
  loop
    constraint_name := t || '_sucursal_id_fkey';
    if not exists (
      select 1
      from pg_constraint
      where conname = constraint_name
        and conrelid = format('public.%I', t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (sucursal_id) references public.sucursales(id)',
        t,
        constraint_name
      );
    end if;
  end loop;
end $$;

-- 6) Require branch on operational rows after backfill.
alter table public.carritos_pendientes alter column sucursal_id set not null;
alter table public.cash_closures alter column sucursal_id set not null;
alter table public.cash_movements alter column sucursal_id set not null;
alter table public.categorias alter column sucursal_id set not null;
alter table public.clientes alter column sucursal_id set not null;
alter table public.pack_productos alter column sucursal_id set not null;
alter table public.packs alter column sucursal_id set not null;
alter table public.producto_imagenes alter column sucursal_id set not null;
alter table public.producto_variantes alter column sucursal_id set not null;
alter table public.productos alter column sucursal_id set not null;
alter table public.productos_historial alter column sucursal_id set not null;
alter table public.promociones alter column sucursal_id set not null;
alter table public.stock_movimientos alter column sucursal_id set not null;
alter table public.ventas alter column sucursal_id set not null;
alter table public.ventas_detalle alter column sucursal_id set not null;
alter table public.ventas_pagos alter column sucursal_id set not null;

-- 7) Indexes for branch filtering.
create index if not exists idx_usuario_sucursales_usuario on public.usuario_sucursales(usuario_id, activo);
create index if not exists idx_usuario_sucursales_sucursal on public.usuario_sucursales(sucursal_id, rol, activo);
create index if not exists idx_carritos_pendientes_sucursal_fecha on public.carritos_pendientes(sucursal_id, fecha desc);
create index if not exists idx_cash_closures_sucursal_date on public.cash_closures(sucursal_id, start_date desc, end_date desc);
create index if not exists idx_cash_movements_sucursal_date on public.cash_movements(sucursal_id, date desc);
create index if not exists idx_categorias_sucursal on public.categorias(sucursal_id, categori);
create index if not exists idx_clientes_sucursal on public.clientes(sucursal_id, created_at desc);
create index if not exists idx_packs_sucursal on public.packs(sucursal_id, activo);
create index if not exists idx_pack_productos_sucursal on public.pack_productos(sucursal_id, pack_id, producto_id);
create index if not exists idx_producto_imagenes_sucursal on public.producto_imagenes(sucursal_id, producto_id);
create index if not exists idx_producto_variantes_sucursal on public.producto_variantes(sucursal_id, producto_id, activo);
create index if not exists idx_productos_sucursal on public.productos(sucursal_id, vista_producto, category_id);
create index if not exists idx_productos_historial_sucursal on public.productos_historial(sucursal_id, fecha desc);
create index if not exists idx_promociones_sucursal on public.promociones(sucursal_id, producto_id, activa);
create index if not exists idx_stock_movimientos_sucursal on public.stock_movimientos(sucursal_id, producto_id, created_at desc);
create index if not exists idx_ventas_sucursal_fecha on public.ventas(sucursal_id, fecha desc);
create index if not exists idx_ventas_detalle_sucursal on public.ventas_detalle(sucursal_id, venta_id, producto_id);
create index if not exists idx_ventas_pagos_sucursal on public.ventas_pagos(sucursal_id, venta_id, fecha desc);

-- Optional uniqueness per branch. Keep global IDs, but barcodes should not collide inside one branch.
create unique index if not exists idx_productos_sucursal_codigo_barra_unique
  on public.productos(sucursal_id, codigo_barra)
  where codigo_barra is not null;

-- 8) Triggers: default branch and consistency from parent records.
create or replace function public.set_default_sucursal_id()
returns trigger
language plpgsql
as $$
begin
  if new.sucursal_id is null then
    new.sucursal_id := public.default_sucursal_id();
  end if;
  return new;
end;
$$;

create or replace function public.sync_producto_child_sucursal()
returns trigger
language plpgsql
as $$
declare
  v_sucursal_id uuid;
begin
  select p.sucursal_id
  into v_sucursal_id
  from public.productos p
  where p.user_id = new.producto_id;

  if v_sucursal_id is null then
    raise exception 'Producto no encontrado para asignar sucursal (%)', new.producto_id;
  end if;

  if new.sucursal_id is null then
    new.sucursal_id := v_sucursal_id;
  elsif new.sucursal_id <> v_sucursal_id then
    raise exception 'La sucursal del detalle no coincide con la sucursal del producto';
  end if;

  return new;
end;
$$;

create or replace function public.sync_pack_productos_sucursal()
returns trigger
language plpgsql
as $$
declare
  v_pack_sucursal_id uuid;
  v_producto_sucursal_id uuid;
begin
  select sucursal_id into v_pack_sucursal_id
  from public.packs
  where id = new.pack_id;

  if v_pack_sucursal_id is null then
    raise exception 'Pack no encontrado (%)', new.pack_id;
  end if;

  select sucursal_id into v_producto_sucursal_id
  from public.productos
  where user_id = new.producto_id;

  if v_producto_sucursal_id is null then
    raise exception 'Producto no encontrado para pack (%)', new.producto_id;
  end if;

  if v_pack_sucursal_id <> v_producto_sucursal_id then
    raise exception 'El producto y el pack deben pertenecer a la misma sucursal';
  end if;

  if new.sucursal_id is null then
    new.sucursal_id := v_pack_sucursal_id;
  elsif new.sucursal_id <> v_pack_sucursal_id then
    raise exception 'La sucursal de pack_productos no coincide con la sucursal del pack';
  end if;

  return new;
end;
$$;

create or replace function public.sync_venta_child_sucursal()
returns trigger
language plpgsql
as $$
declare
  v_venta_sucursal_id uuid;
  v_producto_sucursal_id uuid;
  v_pack_sucursal_id uuid;
begin
  select sucursal_id into v_venta_sucursal_id
  from public.ventas
  where id = new.venta_id;

  if v_venta_sucursal_id is null then
    raise exception 'Venta no encontrada (%)', new.venta_id;
  end if;

  if new.producto_id is not null then
    select sucursal_id into v_producto_sucursal_id
    from public.productos
    where user_id = new.producto_id;

    if v_producto_sucursal_id is null then
      raise exception 'Producto no encontrado para venta (%)', new.producto_id;
    end if;

    if v_producto_sucursal_id <> v_venta_sucursal_id then
      raise exception 'La venta y el producto deben pertenecer a la misma sucursal';
    end if;
  end if;

  if new.pack_id is not null then
    select sucursal_id into v_pack_sucursal_id
    from public.packs
    where id = new.pack_id;

    if v_pack_sucursal_id is null then
      raise exception 'Pack no encontrado para venta (%)', new.pack_id;
    end if;

    if v_pack_sucursal_id <> v_venta_sucursal_id then
      raise exception 'La venta y el pack deben pertenecer a la misma sucursal';
    end if;
  end if;

  if new.sucursal_id is null then
    new.sucursal_id := v_venta_sucursal_id;
  elsif new.sucursal_id <> v_venta_sucursal_id then
    raise exception 'La sucursal del detalle no coincide con la sucursal de la venta';
  end if;

  return new;
end;
$$;

create or replace function public.sync_venta_pago_sucursal()
returns trigger
language plpgsql
as $$
declare
  v_venta_sucursal_id uuid;
begin
  select sucursal_id into v_venta_sucursal_id
  from public.ventas
  where id = new.venta_id;

  if v_venta_sucursal_id is null then
    raise exception 'Venta no encontrada para pago (%)', new.venta_id;
  end if;

  if new.sucursal_id is null then
    new.sucursal_id := v_venta_sucursal_id;
  elsif new.sucursal_id <> v_venta_sucursal_id then
    raise exception 'La sucursal del pago no coincide con la sucursal de la venta';
  end if;

  return new;
end;
$$;

create or replace function public.sync_stock_movimiento_sucursal()
returns trigger
language plpgsql
as $$
declare
  v_producto_sucursal_id uuid;
  v_venta_sucursal_id uuid;
begin
  select sucursal_id into v_producto_sucursal_id
  from public.productos
  where user_id = new.producto_id;

  if v_producto_sucursal_id is null then
    raise exception 'Producto no encontrado para movimiento de stock (%)', new.producto_id;
  end if;

  if new.venta_id is not null then
    select sucursal_id into v_venta_sucursal_id
    from public.ventas
    where id = new.venta_id;

    if v_venta_sucursal_id is not null and v_venta_sucursal_id <> v_producto_sucursal_id then
      raise exception 'La venta y el movimiento de stock deben pertenecer a la misma sucursal';
    end if;
  end if;

  if new.sucursal_id is null then
    new.sucursal_id := v_producto_sucursal_id;
  elsif new.sucursal_id <> v_producto_sucursal_id then
    raise exception 'La sucursal del movimiento no coincide con la sucursal del producto';
  end if;

  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  -- Generic default triggers.
  perform 1;
end $$;

drop trigger if exists trg_sucursales_touch_updated_at on public.sucursales;
create trigger trg_sucursales_touch_updated_at
before update on public.sucursales
for each row execute function public.touch_updated_at();

drop trigger if exists trg_carritos_pendientes_default_sucursal on public.carritos_pendientes;
create trigger trg_carritos_pendientes_default_sucursal
before insert or update on public.carritos_pendientes
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_cash_closures_default_sucursal on public.cash_closures;
create trigger trg_cash_closures_default_sucursal
before insert or update on public.cash_closures
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_cash_movements_default_sucursal on public.cash_movements;
create trigger trg_cash_movements_default_sucursal
before insert or update on public.cash_movements
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_categorias_default_sucursal on public.categorias;
create trigger trg_categorias_default_sucursal
before insert or update on public.categorias
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_clientes_default_sucursal on public.clientes;
create trigger trg_clientes_default_sucursal
before insert or update on public.clientes
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_packs_default_sucursal on public.packs;
create trigger trg_packs_default_sucursal
before insert or update on public.packs
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_productos_default_sucursal on public.productos;
create trigger trg_productos_default_sucursal
before insert or update on public.productos
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_ventas_default_sucursal on public.ventas;
create trigger trg_ventas_default_sucursal
before insert or update on public.ventas
for each row execute function public.set_default_sucursal_id();

drop trigger if exists trg_producto_variantes_sucursal on public.producto_variantes;
create trigger trg_producto_variantes_sucursal
before insert or update on public.producto_variantes
for each row execute function public.sync_producto_child_sucursal();

drop trigger if exists trg_producto_imagenes_sucursal on public.producto_imagenes;
create trigger trg_producto_imagenes_sucursal
before insert or update on public.producto_imagenes
for each row execute function public.sync_producto_child_sucursal();

drop trigger if exists trg_promociones_sucursal on public.promociones;
create trigger trg_promociones_sucursal
before insert or update on public.promociones
for each row execute function public.sync_producto_child_sucursal();

drop trigger if exists trg_pack_productos_sucursal on public.pack_productos;
create trigger trg_pack_productos_sucursal
before insert or update on public.pack_productos
for each row execute function public.sync_pack_productos_sucursal();

drop trigger if exists trg_productos_historial_sucursal on public.productos_historial;
create trigger trg_productos_historial_sucursal
before insert or update on public.productos_historial
for each row execute function public.sync_producto_child_sucursal();

drop trigger if exists trg_stock_movimientos_sucursal on public.stock_movimientos;
create trigger trg_stock_movimientos_sucursal
before insert or update on public.stock_movimientos
for each row execute function public.sync_stock_movimiento_sucursal();

drop trigger if exists trg_ventas_detalle_sucursal on public.ventas_detalle;
create trigger trg_ventas_detalle_sucursal
before insert or update on public.ventas_detalle
for each row execute function public.sync_venta_child_sucursal();

drop trigger if exists trg_ventas_pagos_sucursal on public.ventas_pagos;
create trigger trg_ventas_pagos_sucursal
before insert or update on public.ventas_pagos
for each row execute function public.sync_venta_pago_sucursal();

-- 9) Branch-aware public catalog view used by the current app.
-- This keeps the existing columns and adds sucursal_id.
drop view if exists public.v_productos_catalogo;

create view public.v_productos_catalogo as
select
  p.user_id as producto_id,
  p.nombre,
  p.descripcion,
  p.precio as precio_base,
  p.imagen_url as imagen_base,
  p.category_id,
  coalesce(c.categori, p.categoria) as categoria,
  p.stock as stock_total,
  p.codigo_barra,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pv.id,
        'variante_id', pv.id,
        'color', pv.color,
        'stock', pv.stock,
        'stock_decimal', pv.stock_decimal,
        'precio', pv.precio,
        'imagen_url', pv.imagen_url,
        'sku', pv.sku,
        'activo', pv.activo
      )
      order by pv.id
    ) filter (where pv.id is not null),
    '[]'::jsonb
  ) as variantes,
  p.sucursal_id
from public.productos p
left join public.categorias c
  on c.id = p.category_id
 and c.sucursal_id = p.sucursal_id
left join public.producto_variantes pv
  on pv.producto_id = p.user_id
 and pv.sucursal_id = p.sucursal_id
group by
  p.user_id,
  p.sucursal_id,
  p.nombre,
  p.descripcion,
  p.precio,
  p.imagen_url,
  p.category_id,
  c.categori,
  p.categoria,
  p.stock,
  p.codigo_barra;

-- 10) RLS preparation.
-- Do NOT enable strict RLS for operational tables yet unless the app has already
-- been updated to pass/filter sucursal_id everywhere. The policy block below is
-- intentionally left as a reference for phase 2.
--
-- alter table public.productos enable row level security;
-- create policy productos_select_by_sucursal on public.productos
--   for select using (public.user_can_access_sucursal(sucursal_id));
-- create policy productos_write_by_sucursal on public.productos
--   for all using (public.user_can_access_sucursal(sucursal_id))
--   with check (public.user_can_access_sucursal(sucursal_id));

commit;
