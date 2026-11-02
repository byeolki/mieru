# Deploying mieru on freeride

Target: `https://mieru.byeolki.me`. The stack is `deploy/compose.yml` (app, MySQL 8.4, backup
sidecar), run with the Docker CLI next to Dokploy. Dokploy's Traefik picks up the app through
Docker labels. Read `~/SERVER.md` on the host before touching anything there.

Traffic path: Cloudflare → `cloudflared` (host service) → Traefik `:80` → `mieru-app-1:3000`.

## Layout on freeride

| Path | Contents |
|---|---|
| `/data/projects/mieru/src` | source snapshot (`git archive`), build context |
| `/data/projects/mieru/mieru.env` | secrets and host paths, mode `600`, never committed |
| `/data/projects/mieru/storage` | uploads, blobs, parsed sidecars (owned by `admin`, mode `700`) |
| `/data/backups/mieru` | `db/` dumps (14 days) and `blobs/` mirror, written by the backup sidecar |
| Docker volume `mieru_db-data` | MySQL data |

The app and backup containers run as `admin` (uid/gid 1001), so the host directories need no
`sudo` to set up.

## Env file

```sh
HOST_UID=1001
HOST_GID=1001
STORAGE_PATH=/data/projects/mieru/storage
BACKUP_PATH=/data/backups/mieru
TRUST_PROXY=2
MYSQL_PASSWORD=<hex>
MYSQL_ROOT_PASSWORD=<hex>
JWT_SECRET=<32+ random bytes>
LINK_TOKEN_KEY=<32+ random bytes>
TICKET_SECRET=<32+ random bytes>
VIEW_SALT_SECRET=<32+ random bytes>
```

Generate each secret with `openssl rand -hex 32`. Keep passwords hex so they are safe inside
`DATABASE_URL`.

## Deploy or update

From the repo on m4pro:

```sh
git archive HEAD | ssh ssh.byeolki.me 'rm -rf /data/projects/mieru/src && mkdir -p /data/projects/mieru/src && tar -x -C /data/projects/mieru/src'
ssh ssh.byeolki.me 'cd /data/projects/mieru/src/deploy && docker compose --env-file /data/projects/mieru/mieru.env up -d --build'
ssh ssh.byeolki.me 'docker image prune -f --filter label=com.docker.compose.project=mieru'
```

The app runs migrations at start, then the server. Rate limiting is always on in production.

## Cloudflare (one time, needs the user)

1. Cloudflare DNS: `CNAME mieru → a272d13d-b889-4e5a-afc9-1b6f1b04cb42.cfargotunnel.com`, proxied.
2. `/etc/cloudflared/config.yml` gets an ingress entry before the 404 catch-all:
   `- hostname: mieru.byeolki.me` / `service: http://localhost:80`.
3. `sudo systemctl restart cloudflared`.

Keep Cloudflare caching off for `/api/*` (responses send `no-store`). Uploads use 50 MiB tus
chunks, under Cloudflare's 100 MB request limit.

### Verify the proxy hop count

Sign in from a phone on mobile data and open **설정 → 세션**. The session IP must be the phone's
public IP. A 172.x/10.x address means `TRUST_PROXY` is too low. Any other wrong IP means it is
too high. Fix it in the env file and redeploy.

## Monitoring

- Uptime Kuma: HTTP monitor on `https://mieru.byeolki.me/api/health/deep`, every 5 min, alert on
  non-200. The body names the failing check.
- Logs: `docker logs mieru-app-1` or Dozzle. Tokens, cookies and passwords are redacted.

## First admin

```sh
docker exec mieru-app-1 node dist/scripts/admin.js grant <username>
```
