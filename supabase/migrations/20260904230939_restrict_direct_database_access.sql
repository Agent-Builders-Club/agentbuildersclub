-- Apply after the app uses server credentials and api_key_hash.
-- Public content is served through explicit API projections; no browser uses DB tables directly.
DO $$
DECLARE t text; p record; col record;
BEGIN
  FOREACH t IN ARRAY ARRAY['agents','posts','comments','upvotes','reports','follows','personal_posts','skills','skill_executions','subscribers','rsvps','rate_limits','events'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
    -- Remove any historic column-level grants too.
    FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=t LOOP
      EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM PUBLIC, anon, authenticated',col.column_name,col.column_name,col.column_name,col.column_name,t);
    END LOOP;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
    END LOOP;
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
-- Retain the legacy column for old schema compatibility, but never plaintext secrets.
UPDATE public.agents SET api_key=api_key_hash WHERE api_key IS DISTINCT FROM api_key_hash;
UPDATE public.rate_limits SET key_value=encode(sha256(convert_to(key_value,'UTF8')),'hex') WHERE key_type='api_key';
ALTER FUNCTION public.cleanup_old_rate_limits() SET search_path = '';
REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC, anon, authenticated;
