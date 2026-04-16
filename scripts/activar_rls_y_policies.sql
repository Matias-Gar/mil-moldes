-- Asegura que la función de creación de perfil inserte el email correctamente
CREATE OR REPLACE FUNCTION public.crear_perfil_para_nuevo_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.perfiles (id, rol, email)
  VALUES (NEW.id, 'cliente', NEW.email);
  RETURN NEW;
END;
$function$;

-- (Opcional, recrea el trigger si es necesario)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_para_nuevo_usuario();
-- ...existing code...
-- Eliminar objetos existentes antes de crear vistas
DROP TABLE IF EXISTS public.flujo_diario CASCADE;
DROP VIEW IF EXISTS public.flujo_diario CASCADE;
DROP TABLE IF EXISTS public.qr_daily_stats CASCADE;
DROP VIEW IF EXISTS public.qr_daily_stats CASCADE;
DROP TABLE IF EXISTS public.qr_kpis CASCADE;
DROP VIEW IF EXISTS public.qr_kpis CASCADE;
DROP TABLE IF EXISTS public.qr_recent_payments CASCADE;
DROP VIEW IF EXISTS public.qr_recent_payments CASCADE;
DROP TABLE IF EXISTS public.top_productos CASCADE;
DROP VIEW IF EXISTS public.top_productos CASCADE;
DROP TABLE IF EXISTS public.users_public CASCADE;
DROP VIEW IF EXISTS public.users_public CASCADE;
DROP TABLE IF EXISTS public.v_productos_catalogo CASCADE;
DROP VIEW IF EXISTS public.v_productos_catalogo CASCADE;
DROP TABLE IF EXISTS public.ventas_con_utilidad CASCADE;
DROP VIEW IF EXISTS public.ventas_con_utilidad CASCADE;
-- ...existing code...
-- Activa RLS en todas las tablas principales
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carritos_pendientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_imagenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_detalle ENABLE ROW LEVEL SECURITY;

-- Políticas RLS exportadas
-- Habilita RLS y políticas mínimas para producto_variantes
DROP POLICY IF EXISTS "Permitir inserción de variantes a usuarios autenticados" ON public.producto_variantes;
CREATE POLICY "Permitir inserción de variantes a usuarios autenticados"
  ON public.producto_variantes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir lectura de variantes a usuarios autenticados" ON public.producto_variantes;
DROP POLICY IF EXISTS "Permitir actualización de stock a usuarios autenticados" ON public.producto_variantes;
ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura de variantes a usuarios autenticados"
  ON public.producto_variantes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Permitir actualización de stock a usuarios autenticados"
  ON public.producto_variantes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
-- Permitir a los administradores eliminar cualquier variante
DROP POLICY IF EXISTS "Admins can delete producto_variantes" ON public.producto_variantes;
CREATE POLICY "Admins can delete producto_variantes"
  ON public.producto_variantes
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'));

-- Permitir a los administradores eliminar cualquier producto
DROP POLICY IF EXISTS "Admins can delete productos" ON public.productos;
CREATE POLICY "Admins can delete productos"
  ON public.productos
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'));
-- Ejemplo:
CREATE POLICY "Admins can delete app settings" ON "public"."app_settings" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = 'admin'::text))));
-- ...continúa pegando todos los CREATE POLICY aquí...
