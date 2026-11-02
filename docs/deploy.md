# Deploying mieru on freeride (Dokploy)

Target: `https://mieru.byeolki.me`, one app container plus one MySQL 8.4 container on freeride,
exposed through Cloudflare. Read `~/SERVER.md` on the host before touching anything there.

## 1. Database (`mieru-db`)

Dokploy → Create → Database → MySQL.

| Setting | Value |
|---|---|
| Image | `mysql:8.4` |
| Database / user | `mieru` / `mieru` (generate the password in Dokploy) |
| Memory limit | 1 GiB |
| Command args | `--innodb-buffer-pool-size=512M --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci` |
| External port | none (internal network only) |

## 2. Host directories

Ask the user to run these (they need `sudo`):

```sh
sudo mkdir -p /data/projects/mieru/storage /data/backups/mieru/db
sudo chown -R 10001:10001 /data/projects/mieru/storage   # the image runs as uid/gid 10001
```

## 3. Application (`mieru-app`)

Dokploy → Create → Application, source GitHub `main`, build type **Dockerfile** (repo root).

| Setting | Value |
|---|---|
| Replicas | 1 |
| Memory / CPU | 2 GiB / 4 CPUs |
| Health check | built into the image (`GET /api/health`) |
| Mounts | bind `/data/projects/mieru/storage` → `/var/lib/mieru/storage` |
|  | bind `/data/backups/mieru/db` → `/var/lib/mieru/backups` (read-only) |
| Domain | `mieru.byeolki.me`, container port 3000, HTTPS handled by Cloudflare |

Environment (Dokploy only, never committed):

```sh
APP_ORIGIN=https://mieru.byeolki.me
DATABASE_URL=mysql://mieru:<password>@<mieru-db internal host>:3306/mieru
TRUST_PROXY=2            # Traefik + cloudflared; verify below
BACKUP_DIR=/var/lib/mieru/backups
LOG_LEVEL=info
# 32+ random bytes each: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
JWT_SECRET=
LINK_TOKEN_KEY=
TICKET_SECRET=
VIEW_SALT_SECRET=
```

`NODE_ENV`, `HOST`, `PORT`, `STORAGE_DIR` and `WEB_DIST_DIR` are set by the image. Rate limiting
is always on in production. The container runs migrations at start, then the server.

## 4. Cloudflare

The `cloudflared` tunnel already routes to Traefik. Add a public hostname `mieru.byeolki.me` →
Traefik. Keep Cloudflare caching off for `/api/*` (responses already send `no-store`). Uploads
use 50 MiB tus chunks, under Cloudflare's 100 MB request limit.

### Verify the proxy hop count

After the first deploy, sign in from a phone on mobile data and open **Settings → Sessions**. The
session IP must be the phone's public IP. If it shows a 172.x/10.x address, `TRUST_PROXY` is too
low; if anything but the real IP shows up, it is too high. Fix and redeploy.

## 5. Monitoring

- Uptime Kuma: HTTP monitor on `https://mieru.byeolki.me/api/health/deep`, every 5 min, alert on
  non-200. The body lists which check failed (disk, processing, trending, backups, db, storage).
- Logs: Dozzle / Dokploy logs (pino JSON; tokens, cookies and passwords are redacted).

## 6. Backups

Dokploy → Schedules → on the **host**, daily at 04:15 KST:

```sh
DB_CONTAINER=$(docker ps -q -f name=mieru-db) /path/to/repo/scripts/backup.sh
```

See `docs/runbook.md` for restore and other operations. Backups share the NVMe with live data:
they protect against mistakes, not drive failure (accepted risk).

## 7. First admin

```sh
docker exec -it $(docker ps -q -f name=mieru-app) node dist/scripts/admin.js grant <username>
```
