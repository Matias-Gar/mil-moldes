-- Supabase instala pgcrypto normalmente en el esquema extensions.
-- Las funciones v2/v3 restringían search_path a public y no encontraban digest().
begin;

alter function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid,text)
  set search_path = public, extensions;

alter function public.crear_venta_completa(jsonb,jsonb,jsonb,uuid,text,text,uuid,text,bigint)
  set search_path = public, extensions;

alter function public.transferir_stock_sucursal(bigint,bigint,uuid,uuid,numeric,text,numeric,uuid,text,text,text)
  set search_path = public, extensions;

insert into public.business_audit_events(event_type,entity_type,entity_id,metadata)
values('PGCRYPTO_FUNCTION_PATH_FIXED','inventario','v6',jsonb_build_object('executed_at',clock_timestamp()));

commit;

-- Verificación sin modificar inventario:
-- select encode(extensions.digest('inventory-v6'::text,'sha256'::text),'hex') is not null as digest_ok;
