ALTER TABLE productos
ADD COLUMN IF NOT EXISTS unidad_base TEXT DEFAULT 'unidad';

ALTER TABLE productos
ADD COLUMN IF NOT EXISTS unidades_alternativas TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE productos
ADD COLUMN IF NOT EXISTS factor_conversion NUMERIC;

UPDATE productos
SET unidad_base = COALESCE(NULLIF(TRIM(unidad_base), ''), 'unidad')
WHERE unidad_base IS NULL OR TRIM(unidad_base) = '';
