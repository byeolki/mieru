#!/usr/bin/env bash
# Backup sidecar: dumps the database and copies new blobs into /backups once a day at $RUN_AT
# (container time zone), and right away when the newest dump is older than a day.
set -uo pipefail

KEEP_DAYS="${KEEP_DAYS:-14}"
RUN_AT="${RUN_AT:-04:15}"
DAY_SECONDS=86400

backup_once() {
  local stamp dump
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dump="/backups/db/mieru-$stamp.sql.gz"
  mkdir -p /backups/db /backups/blobs
  if ! MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -h "$MYSQL_HOST" -u "$MYSQL_USER" \
    --single-transaction --quick --no-tablespaces "$MYSQL_DATABASE" | gzip > "$dump.partial"; then
    rm -f "$dump.partial"
    echo "backup $stamp: mysqldump failed" >&2
    return 1
  fi
  # Renamed only when complete, so the deep health check never counts a half-written dump.
  mv "$dump.partial" "$dump"
  # Blobs are content-addressed and never modified, so copying missing files is enough. Blobs
  # deleted from live storage stay here, which keeps every retained dump restorable.
  if [[ -d /storage/blobs ]]; then
    cp -an /storage/blobs/. /backups/blobs/
  fi
  find /backups/db -name 'mieru-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
  echo "backup $stamp: done ($(du -h "$dump" | cut -f1))"
}

newest_dump_age() {
  local newest
  newest="$(find /backups/db -name 'mieru-*.sql.gz' -printf '%T@\n' 2>/dev/null | sort -n | tail -1)"
  [[ -z "$newest" ]] && { echo "$DAY_SECONDS"; return; }
  echo $(( $(date +%s) - ${newest%.*} ))
}

seconds_until_next_run() {
  local now next
  now="$(date +%s)"
  next="$(date -d "today $RUN_AT" +%s)"
  (( next <= now )) && next="$(date -d "tomorrow $RUN_AT" +%s)"
  echo $(( next - now ))
}

if (( $(newest_dump_age) >= DAY_SECONDS )); then backup_once; fi
while true; do
  sleep "$(seconds_until_next_run)"
  backup_once
done
