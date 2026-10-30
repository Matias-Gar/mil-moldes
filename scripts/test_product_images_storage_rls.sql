-- Tests metadata RLS using real profile roles; all probe rows roll back.
-- Storage HTTP and physical-file behavior must also be checked with a staff login.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $test$
DECLARE
  member record;
  probe text := '__rls_probe__/' || gen_random_uuid()::text || '.png';
  affected integer;
  allowed boolean;
BEGIN
  FOR member IN
    SELECT DISTINCT ON (lower(rol)) id, lower(rol) AS rol
    FROM public.perfiles WHERE rol IS NOT NULL ORDER BY lower(rol), id
  LOOP
    allowed := member.rol IN ('admin','administracion','almacen');
    PERFORM set_config('request.jwt.claims', json_build_object('sub',member.id,'role','authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', member.id::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      INSERT INTO storage.objects(bucket_id,name) VALUES ('product_images',probe);
      IF NOT allowed THEN RAISE EXCEPTION 'Unexpected upload permission for %',member.rol; END IF;
      PERFORM 1 FROM storage.objects WHERE bucket_id='product_images' AND name=probe;
      IF NOT FOUND THEN RAISE EXCEPTION 'Cannot read uploaded object'; END IF;
      UPDATE storage.objects SET metadata='{"mimetype":"image/png"}'::jsonb
        WHERE bucket_id='product_images' AND name=probe;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'Cannot update uploaded object'; END IF;
      -- No direct DELETE: storage.protect_delete() requires the Storage API.
      -- End this role's probe with a subtransaction rollback instead.
      RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'probe_complete';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN
      NULL;
    WHEN insufficient_privilege THEN
      IF allowed THEN RAISE; END IF;
    END;
    EXECUTE 'RESET ROLE';
    RAISE NOTICE 'PASS Storage SELECT/INSERT/UPDATE role=% allowed=%; DELETE requires API test', member.rol, allowed;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    INSERT INTO storage.objects(bucket_id,name) VALUES ('product_images',probe);
    RAISE EXCEPTION 'Unexpected anonymous upload permission';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anonymous upload denied';
  END;
  EXECUTE 'RESET ROLE';
END $test$;
ROLLBACK;
