-- Add reversible product archiving for Mil Moldes.
-- Run this in Supabase SQL Editor.
--
-- Archived products remain in productos for history, sales details and audits,
-- but disappear from public catalog views and operational product searches.

begin;

alter table public.productos
  add column if not exists archivado boolean not null default false,
  add column if not exists archivado_at timestamptz,
  add column if not exists archivado_por uuid;

create index if not exists idx_productos_sucursal_archivado
  on public.productos(sucursal_id, archivado, vista_producto, category_id);

-- Keep the existing public catalog shape, but exclude archived products.
create or replace view public.v_productos_catalogo as
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
where coalesce(p.archivado, false) = false
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

commit;
