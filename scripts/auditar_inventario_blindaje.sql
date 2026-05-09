-- Inventory audit for Mil Moldes.
-- Run in Supabase SQL Editor after harden_sales_stock_flow.sql.
-- Each result set points to a possible inventory leak or historical mismatch.

-- 1) Product stock must equal active variant stock when variants exist.
select
  p.user_id as producto_id,
  p.nombre,
  p.sucursal_id,
  coalesce(p.stock, 0)::numeric as producto_stock,
  coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)) filter (where coalesce(pv.activo, true)), 0)::numeric as variantes_stock,
  coalesce(p.stock, 0)::numeric - coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)) filter (where coalesce(pv.activo, true)), 0)::numeric as diferencia
from public.productos p
join public.producto_variantes pv on pv.producto_id = p.user_id
group by p.user_id, p.nombre, p.sucursal_id, p.stock
having abs(coalesce(p.stock, 0)::numeric - coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)) filter (where coalesce(pv.activo, true)), 0)::numeric) > 0.0001
order by abs(coalesce(p.stock, 0)::numeric - coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)) filter (where coalesce(pv.activo, true)), 0)::numeric) desc;

-- 2) Negative stock must never exist.
select 'productos' as tabla, user_id as id, nombre, stock::numeric as stock, sucursal_id
from public.productos
where coalesce(stock, 0)::numeric < 0
union all
select 'producto_variantes' as tabla, id, color as nombre, coalesce(stock_decimal, stock, 0)::numeric as stock, sucursal_id
from public.producto_variantes
where coalesce(stock_decimal, stock, 0)::numeric < 0;

-- 3) Effective sales details without a matching stock movement.
select
  vd.venta_id,
  vd.id as detalle_id,
  vd.producto_id,
  vd.variante_id,
  vd.descripcion,
  vd.cantidad,
  vd.cantidad_base,
  vd.unidad,
  vd.sucursal_id
from public.ventas_detalle vd
join public.ventas v on v.id = vd.venta_id
left join public.stock_movimientos sm
  on sm.detalle_id = vd.id
  or (
    sm.venta_id = vd.venta_id
    and sm.producto_id = vd.producto_id
    and coalesce(sm.variante_id, -1) = coalesce(vd.variante_id, -1)
    and sm.tipo = 'venta'
  )
where coalesce(v.estado, 'efectivizada') = 'efectivizada'
  and coalesce(vd.tipo, 'producto') = 'producto'
  and vd.producto_id is not null
  and sm.id is null
order by vd.venta_id desc, vd.id desc;

-- 4) Stock sale movements without a sale/detail reference.
select
  sm.id,
  sm.created_at,
  sm.producto_id,
  sm.variante_id,
  sm.cantidad,
  sm.cantidad_base,
  sm.venta_id,
  sm.detalle_id,
  sm.observaciones,
  sm.sucursal_id
from public.stock_movimientos sm
left join public.ventas v on v.id = sm.venta_id
left join public.ventas_detalle vd on vd.id = sm.detalle_id
where sm.tipo = 'venta'
  and (
    sm.venta_id is null
    or v.id is null
    or (sm.detalle_id is not null and vd.id is null)
  )
order by sm.created_at desc;

-- 5) Converted products with variants that still look globally stocked while variants are empty.
select
  p.user_id as producto_id,
  p.nombre,
  p.stock::numeric as producto_stock,
  count(pv.id) filter (where coalesce(pv.activo, true)) as variantes_activas,
  coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)) filter (where coalesce(pv.activo, true)), 0)::numeric as variantes_stock,
  p.unidad_base,
  p.unidades_alternativas,
  p.factor_conversion,
  p.sucursal_id
from public.productos p
left join public.producto_variantes pv on pv.producto_id = p.user_id
where coalesce(p.factor_conversion, 0)::numeric > 0
  and coalesce(cardinality(p.unidades_alternativas), 0) > 0
group by p.user_id, p.nombre, p.stock, p.unidad_base, p.unidades_alternativas, p.factor_conversion, p.sucursal_id
having coalesce(p.stock, 0)::numeric > 0
   and coalesce(sum(coalesce(nullif(pv.stock_decimal, 0), pv.stock, 0)) filter (where coalesce(pv.activo, true)), 0)::numeric <= 0
order by p.nombre;

-- 6) Current stock movement chain for one product.
-- Replace :producto_id manually in Supabase SQL Editor.
-- select *
-- from public.stock_movimientos
-- where producto_id = :producto_id
-- order by created_at asc, id asc;
