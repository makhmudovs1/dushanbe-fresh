#!/bin/sh
set -eu
umask 077
test "${DF_TARENA_PILOT:-}" = 1
test "${PGDATABASE:-}" = df_tarena_test
test "${PGUSER:-}" = rehearsal_backup
backup_once() (
  mkdir /backups/.lock || { printf 'Backup lock busy; refusing overlapping backup\n' >&2; exit 1; }
  trap 'rmdir /backups/.lock' EXIT
  marker=$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT value #>> '{}' FROM app_settings WHERE key='tarena_pilot_marker'")
  test "$marker" = df-tarena-synthetic-only-20261029
  safe=$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*)=100 AND bool_and(id ~ '^tarena-product-[0-9]+$') FROM products")
  test "$safe" = t
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  test ! -e "/backups/$stamp.tar"
  work="/backups/.snapshot-$stamp"
  mkdir "$work"
  # The parent transaction holds one exported snapshot for both dump and row fingerprints.
  export BACKUP_WORK="$work"
  psql -X -q -v ON_ERROR_STOP=1 -f /ops/export-snapshot.sql
  test -f "$work/.dump-complete"
  # Uploads are immutable and copied after the DB snapshot; physical deletion must remain disabled.
  test -z "$(find /images -mindepth 1 ! -type f -print -quit)"
  mkdir "$work/images"
  find /images -maxdepth 1 -type f -name '*.webp' -exec cp -p {} "$work/images/" \;
  (cd "$work"; find images -type f -name '*.webp' -exec sha256sum {} \; | sort > images.sha256; sha256sum database.dump data.sha256 images.sha256 > SHA256SUMS)
  tar -C "$work" -cf "/backups/$stamp.tar" database.dump data.sha256 images.sha256 SHA256SUMS images
  sha256sum "/backups/$stamp.tar" > "/backups/$stamp.tar.sha256"
  printf '{"generatedAt":"%s","archive":"%s.tar","syntheticOnly":true}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$stamp" > /backup-status/latest.tmp
  mv /backup-status/latest.tmp /backup-status/latest.json
  # Only our exact completed scratch directory is removed; archives are retained.
  rm -r "$work"
  printf 'Synthetic snapshot completed: %s.tar\n' "$stamp"
)
if test "${1:-}" = --loop; then
  while :; do
    # A fresh shell preserves errexit inside backup guards even when the caller handles failure.
    if /bin/sh /ops/backup.sh --once; then
      sleep 3600
    else
      printf 'Scheduled rehearsal backup failed; retry in one minute\n' >&2
      sleep 60
    fi
  done
else
  backup_once
fi
