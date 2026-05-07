-- Fix signup failures: "Database error saving new user".
-- Run in Supabase SQL Editor.
--
-- Cause usually seen in this project:
-- an older auth.users trigger inserts into public.perfiles without email,
-- while public.perfiles.email is NOT NULL.

begin;

alter table public.perfiles add column if not exists nombre text;
alter table public.perfiles add column if not exists telefono text;
alter table public.perfiles add column if not exists nit_ci text;
alter table public.perfiles add column if not exists rol text default 'cliente';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role text;
  v_nombre text;
  v_telefono text;
  v_nit_ci text;
begin
  v_email := nullif(trim(coalesce(new.email, new.raw_user_meta_data ->> 'email', '')), '');
  v_role := lower(nullif(trim(coalesce(new.raw_user_meta_data ->> 'rol', 'cliente')), ''));
  v_nombre := nullif(trim(coalesce(new.raw_user_meta_data ->> 'nombre', '')), '');
  v_telefono := nullif(trim(coalesce(new.raw_user_meta_data ->> 'telefono', '')), '');
  v_nit_ci := nullif(trim(coalesce(new.raw_user_meta_data ->> 'nit_ci', new.raw_user_meta_data ->> 'nitCi', '')), '');

  if v_role not in ('admin', 'administracion', 'vendedor', 'almacen', 'cliente') then
    v_role := 'cliente';
  end if;

  insert into public.perfiles (id, email, rol, nombre, telefono, nit_ci)
  values (new.id, v_email, v_role, v_nombre, v_telefono, v_nit_ci)
  on conflict (id) do update
  set email = coalesce(excluded.email, public.perfiles.email),
      rol = coalesce(public.perfiles.rol, excluded.rol),
      nombre = coalesce(excluded.nombre, public.perfiles.nombre),
      telefono = coalesce(excluded.telefono, public.perfiles.telefono),
      nit_ci = coalesce(excluded.nit_ci, public.perfiles.nit_ci);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill any users that were created before the trigger was fixed.
insert into public.perfiles (id, email, rol)
select
  u.id,
  nullif(trim(u.email), ''),
  'cliente'
from auth.users u
where not exists (
  select 1
  from public.perfiles p
  where p.id = u.id
)
on conflict (id) do nothing;

commit;
