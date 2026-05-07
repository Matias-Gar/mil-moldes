ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS vista_producto text DEFAULT 'articulos';

UPDATE public.productos
SET vista_producto = COALESCE(NULLIF(TRIM(vista_producto), ''), 'articulos')
WHERE vista_producto IS NULL OR TRIM(vista_producto) = '';
