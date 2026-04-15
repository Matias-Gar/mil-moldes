# SQL para política RLS en carritos_pendientes

-- Permitir inserts a todos (anónimos y autenticados)

DROP POLICY IF EXISTS "Permitir inserts a todos" ON public.carritos_pendientes;
CREATE POLICY "Permitir inserts a todos"
	ON public.carritos_pendientes
	FOR INSERT
	TO anon, authenticated
	WITH CHECK (true);

-- Asegúrate de que RLS esté activado
ALTER TABLE public.carritos_pendientes ENABLE ROW LEVEL SECURITY;
