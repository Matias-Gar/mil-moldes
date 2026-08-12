-- Persistencia canónica de transferencias.
-- Ejecutar después de v4. No mueve stock: sincroniza agregados desde variantes.
begin;

create or replace function public.sync_product_stock_from_variants()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_product_id bigint;v_branch uuid;v_total numeric;
begin
  v_product_id:=coalesce(new.producto_id,old.producto_id);
  v_branch:=coalesce(new.sucursal_id,old.sucursal_id);
  select coalesce(sum(coalesce(pv.stock_decimal,pv.stock,0)),0) into v_total
  from public.producto_variantes pv where pv.producto_id=v_product_id
    and pv.sucursal_id=v_branch and coalesce(pv.activo,true);
  update public.productos set stock=v_total where user_id=v_product_id and sucursal_id=v_branch;
  return coalesce(new,old);
end $$;

drop trigger if exists trg_sync_product_stock_from_variants on public.producto_variantes;
create trigger trg_sync_product_stock_from_variants
after insert or update of stock,stock_decimal,activo on public.producto_variantes
for each row execute function public.sync_product_stock_from_variants();

-- Corrige únicamente agregados de productos con variantes. Las variantes son
-- la fuente contable; no se modifica ningún stock de variante.
update public.productos p set stock=x.total
from (
  select pv.producto_id,pv.sucursal_id,coalesce(sum(coalesce(pv.stock_decimal,pv.stock,0)),0) total
  from public.producto_variantes pv where coalesce(pv.activo,true)
  group by pv.producto_id,pv.sucursal_id
) x where p.user_id=x.producto_id and p.sucursal_id=x.sucursal_id and p.stock is distinct from x.total;

-- La implementación antigua queda inaccesible; solo la fachada idempotente
-- de 11 argumentos puede ser invocada por la aplicación.
revoke execute on function public.transferir_stock_sucursal(bigint,bigint,uuid,uuid,numeric,text,numeric,uuid,text,text)
from public,anon,authenticated;

insert into public.business_audit_events(event_type,entity_type,entity_id,metadata)
values('TRANSFER_PERSISTENCE_GUARD_ENABLED','inventario','v5',jsonb_build_object('executed_at',clock_timestamp()));

commit;
