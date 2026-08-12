-- Cierre final: corte contable y guardas contra escritura directa.
-- Ejecutar DESPUÉS de v3 y de las regularizaciones críticas aprobadas.
begin;

create table if not exists public.inventory_cutover_balances (
  producto_id bigint not null,
  variante_id bigint,
  sucursal_id uuid,
  stock_base numeric not null check(stock_base>=0),
  cutover_at timestamptz not null default clock_timestamp(),
  correlation_id uuid not null default gen_random_uuid(),
  motivo text not null,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists ux_inventory_cutover_scope
  on public.inventory_cutover_balances(producto_id,coalesce(variante_id,-1));

-- Fotografía sin modificar inventario. Es el inicio verificable de la era v4.
insert into public.inventory_cutover_balances(producto_id,variante_id,sucursal_id,stock_base,motivo,metadata)
select p.user_id,pv.id,p.sucursal_id,
  case when pv.id is null then coalesce(p.stock,0)::numeric else coalesce(pv.stock_decimal,pv.stock,0)::numeric end,
  'Corte contable posterior al blindaje; el historial anterior se conserva sin reinterpretarlo',
  jsonb_build_object('historico_previo','conservado','source','snapshot_verificado_post_v3')
from public.productos p
left join public.producto_variantes pv on pv.producto_id=p.user_id and coalesce(pv.activo,true)
where not exists(select 1 from public.inventory_cutover_balances c
  where c.producto_id=p.user_id and c.variante_id is not distinct from pv.id);

create or replace function public.guard_inventory_columns()
returns trigger language plpgsql set search_path=public as $$
begin
  -- Las funciones SECURITY DEFINER autorizadas ejecutan como propietario.
  -- Las peticiones directas authenticated/anon jamás pueden tocar inventario.
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      if tg_table_name='productos' then new.stock:=0; end if;
      if tg_table_name='producto_variantes' then
        new.stock:=0;new.stock_decimal:=0;new.stock_inicial:=0;new.stock_inicial_decimal:=0;
      end if;
    elsif tg_table_name='productos' and new.stock is distinct from old.stock then
      raise exception using errcode='42501',message='Stock protegido: use una operación de inventario auditada';
    elsif tg_table_name='producto_variantes' and (
      new.stock is distinct from old.stock or new.stock_decimal is distinct from old.stock_decimal or
      new.stock_inicial is distinct from old.stock_inicial or new.stock_inicial_decimal is distinct from old.stock_inicial_decimal
    ) then
      raise exception using errcode='42501',message='Stock de variante protegido: use una operación de inventario auditada';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_product_inventory on public.productos;
create trigger trg_guard_product_inventory before insert or update on public.productos
for each row execute function public.guard_inventory_columns();
drop trigger if exists trg_guard_variant_inventory on public.producto_variantes;
create trigger trg_guard_variant_inventory before insert or update on public.producto_variantes
for each row execute function public.guard_inventory_columns();

-- Impide eliminación física aunque reaparezca una ruta cliente antigua.
create or replace function public.prevent_inventory_entity_delete()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user in ('authenticated','anon') then
    raise exception using errcode='42501',message='Eliminación física prohibida; use archivo lógico';
  end if;
  return old;
end $$;
drop trigger if exists trg_prevent_product_delete on public.productos;
create trigger trg_prevent_product_delete before delete on public.productos
for each row execute function public.prevent_inventory_entity_delete();
drop trigger if exists trg_prevent_variant_delete on public.producto_variantes;
create trigger trg_prevent_variant_delete before delete on public.producto_variantes
for each row execute function public.prevent_inventory_entity_delete();

-- Reconstruye desde el corte y valida cada enlace posterior. Lo anterior queda
-- disponible en stock_movimientos, pero ya no contamina la alarma operativa.
create or replace view public.inventory_reconciliation as
with snapshots as (
  select p.user_id producto_id,pv.id variante_id,p.nombre,pv.color,
    case when pv.id is null then coalesce(p.stock,0)::numeric else coalesce(pv.stock_decimal,pv.stock,0)::numeric end stock_sistema
  from public.productos p left join public.producto_variantes pv on pv.producto_id=p.user_id and coalesce(pv.activo,true)
), cutover as (
  select distinct on(producto_id,coalesce(variante_id,-1)) * from public.inventory_cutover_balances
  order by producto_id,coalesce(variante_id,-1),cutover_at desc
), post_moves as (
  select sm.*,lag(sm.stock_despues) over(partition by sm.producto_id,sm.variante_id order by sm.created_at,sm.id) prev_after,
    row_number() over(partition by sm.producto_id,sm.variante_id order by sm.created_at,sm.id) rn,
    row_number() over(partition by sm.producto_id,sm.variante_id order by sm.created_at desc,sm.id desc) rn_desc
  from public.stock_movimientos sm join cutover c on c.producto_id=sm.producto_id and c.variante_id is not distinct from sm.variante_id
  where sm.resultado='aplicado' and sm.created_at>=c.cutover_at
), ledger as (
  select pm.producto_id,pm.variante_id,max(pm.stock_despues) filter(where rn_desc=1) ultimo_stock,
    max(pm.created_at) ultimo_movimiento,count(*) movimientos,
    bool_and(pm.stock_antes is not null and pm.stock_despues is not null and
      case when rn=1 then pm.stock_antes=(select c.stock_base from cutover c where c.producto_id=pm.producto_id and c.variante_id is not distinct from pm.variante_id)
           else pm.prev_after=pm.stock_antes end) cadena_completa
  from post_moves pm group by pm.producto_id,pm.variante_id
)
select s.producto_id,s.variante_id,s.nombre,s.color,s.stock_sistema,
  coalesce(l.ultimo_stock,c.stock_base) stock_reconstruido,
  s.stock_sistema-coalesce(l.ultimo_stock,c.stock_base) diferencia,l.ultimo_movimiento,
  case when c.producto_id is null then 'SIN_CORTE'
       when not coalesce(l.cadena_completa,true) then 'INCONSISTENCIA_CRITICA'
       when s.stock_sistema=coalesce(l.ultimo_stock,c.stock_base) then 'OK'
       else 'INCONSISTENCIA_CRITICA' end estado
from snapshots s left join cutover c on c.producto_id=s.producto_id and c.variante_id is not distinct from s.variante_id
left join ledger l on l.producto_id=s.producto_id and l.variante_id is not distinct from s.variante_id;

revoke all on public.inventory_cutover_balances from anon,authenticated;
grant select on public.inventory_reconciliation to authenticated;

insert into public.business_audit_events(event_type,entity_type,entity_id,metadata)
values('INVENTORY_CUTOVER_COMPLETED','inventario','v4',jsonb_build_object(
  'balances',(select count(*) from public.inventory_cutover_balances),
  'executed_at',clock_timestamp()
));

commit;
