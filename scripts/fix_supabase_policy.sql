-- Elimina la política anterior si existe
DROP POLICY IF EXISTS "Permitir insertos públicos" ON public.carritos_pendientes;

-- Crea una política permisiva para inserts anónimos y autenticados
CREATE POLICY "Permitir insertos públicos"
ON public.carritos_pendientes
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
