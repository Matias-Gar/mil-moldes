-- Mil Moldes: Storage permissions for catalog staff, independent of filename/folder.
-- Run as postgres. Does not change files, products, stock, or other buckets.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product_images') THEN
    RAISE EXCEPTION 'Missing bucket product_images; aborting';
  END IF;
  IF to_regprocedure('public.inventory_role()') IS NULL THEN
    RAISE EXCEPTION 'Missing inventory_role(); aborting';
  END IF;
END $$;

-- Reuse the database role lookup used by inventory operations (not JWT metadata).
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
DROP POLICY IF EXISTS mm_product_images_staff_select ON storage.objects;
DROP POLICY IF EXISTS mm_product_images_staff_insert ON storage.objects;
DROP POLICY IF EXISTS mm_product_images_staff_update ON storage.objects;
DROP POLICY IF EXISTS mm_product_images_staff_delete ON storage.objects;
CREATE POLICY mm_product_images_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product_images' AND public.inventory_role() IN ('admin','administracion','almacen'));
CREATE POLICY mm_product_images_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product_images' AND public.inventory_role() IN ('admin','administracion','almacen'));
CREATE POLICY mm_product_images_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product_images' AND public.inventory_role() IN ('admin','administracion','almacen'))
  WITH CHECK (bucket_id = 'product_images' AND public.inventory_role() IN ('admin','administracion','almacen'));
CREATE POLICY mm_product_images_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product_images' AND public.inventory_role() IN ('admin','administracion','almacen'));
COMMIT;

SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname;
