# mieru runbook

Commands run on freeride unless noted. `APP` = `$(docker ps -q -f name=mieru-app)`,
`DB` = `$(docker ps -q -f name=mieru-db)`.

## Deep health is red

`curl -s https://mieru.byeolki.me/api/health/deep | jq` and act on the failing check:

| Check | Meaning | Action |
|---|---|---|
| `disk` | free space under `DISK_RESERVE_BYTES` (new uploads are refused) | run storage GC (below), remove old backups or other data on `/data` |
| `processing` | a version has been processing for over an hour | check app logs for parser errors; restarting the app re-queues unfinished versions |
| `trending` | the trending job has not succeeded for an hour | check logs for `job failed`; a restart runs it immediately |
| `backups` | newest dump is older than 26 h, or none | check the Dokploy schedule log; run `scripts/backup.sh` by hand |
| `db` / `storage` | database unreachable / storage not writable | check `mieru-db`, the bind mount and its ownership (uid 10001) |

## Restore

1. Stop the app in Dokploy so nothing writes during the restore.
2. Database:
   ```sh
   gunzip -c /data/backups/mieru/db/mieru-<stamp>.sql.gz \
     | docker exec -i $DB sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
   ```
3. Blobs: `rsync -a /data/backups/mieru/blobs/ /data/projects/mieru/storage/blobs/`. If the dump
   is older than the last backup, also copy back the needed `blobs-deleted/<stamp>/` folders.
4. Start the app. Parsed sidecars are regenerated on demand when missing.

**Restore drill** (do once after the first backup, and after schema changes): restore into a
scratch database (`CREATE DATABASE mieru_drill`) instead of `mieru`, then check row counts
against production with `SELECT COUNT(*) FROM models` and `FROM users`.

## Storage GC

Runs nightly in the app. By hand (dry run first):

```sh
docker exec $APP node dist/scripts/storage-gc.js
docker exec $APP node dist/scripts/storage-gc.js --apply
```

## Takedown

Normally from **신고 관리** (`/admin/reports`). Without the UI:

```sh
curl -X POST https://mieru.byeolki.me/api/admin/models/<id>/takedown \
  -H "authorization: Bearer <admin access token>" -H 'content-type: application/json' \
  -d '{"reason":"..."}'
```

Restore with `POST /api/admin/models/<id>/restore`, or the **복구하기** button on the repository.

## Admins

```sh
docker exec $APP node dist/scripts/admin.js grant <username>
docker exec $APP node dist/scripts/admin.js revoke <username>
```

Takes effect on the next request; no sign-out needed.

## Secret rotation

| Secret | Effect of changing it |
|---|---|
| `JWT_SECRET` | access tokens become invalid; clients refresh silently (refresh tokens are DB-backed) |
| `TICKET_SECRET` | in-flight download links (60 s) fail; users click download again |
| `VIEW_SALT_SECRET` | today's view dedupe resets (a viewer may count twice today) |
| `LINK_TOKEN_KEY` | owners can no longer re-display existing share link URLs; links themselves still work (matched by hash). Create new links if the old URLs are needed |

Rotate in Dokploy env, then redeploy. To sign everyone out, run
`UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE revoked_at IS NULL;`.
