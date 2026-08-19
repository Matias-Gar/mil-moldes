-- Libera categorias y codigos asociados a productos archivados.
-- Este script es idempotente: se puede ejecutar varias veces.

begin;

update public.productos
set category_id = null
where coalesce(archivado, false) = true
  and category_id is not null;

-- Solo los productos activos deben reservar un codigo dentro de una sucursal.
drop index if exists public.idx_productos_sucursal_codigo_barra_unique;
create unique index idx_productos_sucursal_codigo_barra_unique
  on public.productos(sucursal_id, codigo_barra)
  where codigo_barra is not null
    and coalesce(archivado, false) = false;

commit;
