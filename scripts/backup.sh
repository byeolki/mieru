#!/usr/bin/env bash
# Nightly backup for the freeride host (run as a Dokploy scheduled task on the host).
# Dumps the database and mirrors blobs into $BACKUP_ROOT. Blobs deleted from live storage are
# kept for $KEEP_DAYS days so every retained dump still has the files it references.
set -euo pipefail

: "${DB_CONTAINER:?set DB_CONTAINER to the running mieru-db container name or id}"
BACKUP_ROOT="${BACKUP_ROOT:-/data/backups/mieru}"
STORAGE_DIR="${STORAGE_DIR:-/data/projects/mieru/storage}"
KEEP_DAYS="${KEEP_DAYS:-14}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_ROOT/db" "$BACKUP_ROOT/blobs" "$BACKUP_ROOT/blobs-deleted"

# Credentials stay inside the database container's own environment.
dump="$BACKUP_ROOT/db/mieru-$stamp.sql.gz"
docker exec "$DB_CONTAINER" sh -c \
  'exec mysqldump --single-transaction --quick --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "$dump.partial"
# Renamed only when complete, so the deep health check never sees a half-written dump as fresh.
mv "$dump.partial" "$dump"

rsync -a --delete --backup --backup-dir="$BACKUP_ROOT/blobs-deleted/$stamp" \
  "$STORAGE_DIR/blobs/" "$BACKUP_ROOT/blobs/"

find "$BACKUP_ROOT/db" -name 'mieru-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_ROOT/blobs-deleted" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "backup $stamp done: $(du -sh "$dump" | cut -f1) dump"
