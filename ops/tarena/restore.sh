#!/bin/sh
set -eu
umask 077
test "${DF_TARENA_PILOT:-}" = 1
test "${PGDATABASE:-}" = df_tarena_restore
test "${PGUSER:-}" = restore_owner
test "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")" = 0
test "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_roles WHERE rolname='pilot_api'")" = 0
test -z "$(find /images -mindepth 1 -print -quit)"
printf '%s' "${PILOT_RESTORE_API_PASSWORD:-}" | grep -Eq '^[A-Za-z0-9_-]{40,64}$'
cd /source
sha256sum -c SHA256SUMS
if test -s images.sha256; then sha256sum -c images.sha256; fi
# ONLY our freshly generated trusted synthetic snapshot, never a FirstVDS dump.
pg_restore --no-owner --no-acl --exit-on-error -d df_tarena_restore database.dump
psql -X -q -A -t -F '|' -f /ops/data-fingerprint.sql > /images/.restored-data.sha256
cmp data.sha256 /images/.restored-data.sha256
rm /images/.restored-data.sha256
test "$(psql -X -A -t -c "SELECT value #>> '{}' FROM app_settings WHERE key='tarena_pilot_marker'")" = df-tarena-synthetic-only-20261029
test "$(psql -X -A -t -c "SELECT count(*)=100 AND bool_and(id ~ '^tarena-product-[0-9]+$') FROM products")" = t
for table in refresh_sessions customer_sessions customer_otp_challenges customer_auth_limits mobile_customer_sessions mobile_refresh_tokens mobile_api_limits; do
  test "$(psql -X -A -t -c "SELECT count(*) FROM $table")" = 0
done
printf "CREATE ROLE pilot_api LOGIN PASSWORD '%s' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;\nGRANT USAGE ON SCHEMA public TO pilot_api;\nGRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pilot_api;\nGRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pilot_api;\nREVOKE ALL ON TABLE public._prisma_migrations FROM pilot_api;\n" "$PILOT_RESTORE_API_PASSWORD" | psql -X -q -v ON_ERROR_STOP=1
find /source/images -maxdepth 1 -type f -name '*.webp' -exec cp -p {} /images/ \;
printf 'Trusted synthetic restore: row fingerprints, files and empty session tables verified; new runtime role created.\n'
