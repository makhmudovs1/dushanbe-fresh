\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot() AS snapshot
\gset
\setenv PG_SNAPSHOT :snapshot
\! /bin/sh /ops/dump-held-snapshot.sh
COMMIT;
