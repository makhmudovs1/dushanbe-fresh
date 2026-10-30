#!/bin/sh
set -eu
umask 077
test "${DF_TARENA_PILOT:-}" = 1
case "${BACKUP_WORK:-}" in /backups/.snapshot-????????T??????Z) ;; *) exit 1;; esac
test -n "${PG_SNAPSHOT:-}"
pg_dump -Fc --no-owner --no-acl --snapshot="$PG_SNAPSHOT" \
  --exclude-table-data=refresh_sessions --exclude-table-data=customer_sessions \
  --exclude-table-data=customer_otp_challenges --exclude-table-data=customer_auth_limits \
  --exclude-table-data=mobile_customer_sessions --exclude-table-data=mobile_refresh_tokens \
  --exclude-table-data=mobile_api_limits -f "$BACKUP_WORK/database.dump"
psql -X -q -A -t -F '|' -v snapshot="$PG_SNAPSHOT" -f /ops/data-fingerprint.sql > "$BACKUP_WORK/data.sha256"
touch "$BACKUP_WORK/.dump-complete"
