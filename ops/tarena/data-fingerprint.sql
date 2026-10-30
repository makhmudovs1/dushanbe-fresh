\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
\if :{?snapshot}
SET TRANSACTION SNAPSHOT :'snapshot';
\endif
SELECT format(
  'SELECT %L AS table_name, count(*) AS rows, encode(sha256(convert_to(coalesce(string_agg(row_to_json(t)::text, E''\n'' ORDER BY row_to_json(t)::text), ''''), ''UTF8'')), ''hex'') AS sha256 FROM public.%I AS t;',
  tablename, tablename)
FROM pg_tables WHERE schemaname = 'public'
  AND tablename NOT IN ('refresh_sessions', 'customer_sessions', 'customer_otp_challenges', 'customer_auth_limits', 'mobile_customer_sessions', 'mobile_refresh_tokens', 'mobile_api_limits')
ORDER BY tablename
\gexec
COMMIT;
