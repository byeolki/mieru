# mieru — product implementation plan

Status: draft v3, revised after review rounds 1–2. Waiting on answers to [Open questions](#14-open-questions-for-the-user).
Date: 2026-11-02
Production URL: https://mieru.byeolki.me

**mieru** (見える, "visible") is a web service where people upload neural-network model files, explore them visually, and share them with fine-grained access control. Auth and sharing are the core of the product; visualization is why people come.

This is a product plan, not an MVP plan. Release 1 should feel finished: secure accounts, account deletion, public pages with moderation, forks, backups, health monitoring, and a real brand. It's a personal project built to product quality, not a commercial service, so legal and compliance work (terms, privacy policy, cookie banners) is out of scope. The P0/P1/P2 feature priorities from the brief still decide the **order** of work. They don't lower the quality bar for any phase.

---

## 0. Decisions

### 0.1 Answers from review round 1 and what they changed

| # | Your answer | Effect on the plan |
|---|---|---|
| 1 | Deploy to freeride with Dokploy | Ships as a Docker image (Dokploy Application) + Dokploy-managed MySQL. Storage is a bind mount at `/data/projects/mieru/storage`. Traffic arrives through Traefik, and probably Cloudflare Tunnel too (freeride runs `cloudflared-*`), so: **chunked resumable uploads** (Cloudflare caps request bodies at 100 MB) and **asynchronous processing** (Cloudflare times out requests at 100 s). See §2.3 |
| 2 | MySQL on m4pro | Dev + integration tests use Homebrew `mysql@8.4` (LTS) on this Mac (§12.1) |
| 3 | No email verification | **No outgoing email at all.** Email is only a password-login identifier and never confers authority. Sharing targets **usernames**, not emails (removes the email-squatting attack). Password recovery: none (round 2) |
| 4 | Name **mieru**; Japanese-subculture branding via a skill you'll provide | Renamed everywhere (`@mieru/*`). Brand work is its own milestone (M-B), blocked on that skill. §9.1 sets a product UI direction that leaves room for the brand |
| 5 | Direct shares can download, with a setting | `shares.allow_download` per person (editor always true). Same toggle exists on links and for public models |
| 6 | Fork, rather than resharing | Only the owner manages access. Anyone who can download a model can **fork** it into their own account (content-deduplicated, attribution kept). §7.4 |
| 7 | Public models are in scope | General access gains **Public**: listed on Explore and the owner's profile, viewable anonymously. Brings in search, profiles, licenses, reporting, and admin takedown |
| 8 | Links can grant up to editor; anonymous = viewer | `share_links.role` includes `editor`; anonymous visitors are capped at viewer. Logged-in visitors keep link access while the link stays valid (`link_visits`) |
| 9 | 10 GB | Clarified in round 2: **10 GiB per repository** |
| 10 | "What does sharing mean here?" | Answered in §7.1 |
| 11 | npm | npm workspaces |
| 12 | Use design skills | Direction set with `frontend-design` (§9.1). Palette/categorical colors via `dataviz`/`better-colors`, and `better-interface`, `impeccable`, `kill-ai-slop` before each UI milestone closes |
| 13 | Account deletion | Self-service deletion with re-authentication (§6.9) |

**Round 2**

| # | Your answer | Effect on the plan |
|---|---|---|
| 1 | 10 GiB is **per repository**, not per user | A model (repository: every version + labels) can hold up to 10 GiB. There's no per-user quota. Per-file limit: ONNX 2 GiB (format ceiling), safetensors up to the 10 GiB repo limit (parsing reads only the header). A server-wide free-space reserve protects the disk (§8.1) |
| 2 | No password recovery | Recovery codes and `/auth/recover` removed. A password-only user who forgets their password can't get back in; OAuth users just log in with the provider. Signup suggests linking GitHub/Google |
| 3 | Dokploy + Cloudflare, `mieru.byeolki.me` | `APP_ORIGIN=https://mieru.byeolki.me`; OAuth redirect URIs `https://mieru.byeolki.me/api/auth/oauth/{github,google}/callback` |
| 4 | "Can an SSD even die?" | Yes (see §2.3), but for a non-commercial project, same-machine backups to `/data/backups/mieru` are an accepted risk. They still cover the more common failures: mistakes, bad migrations, deleted volumes |
| 5 | No legal pages; not a real commercial service | `/terms`, `/privacy` removed |
| 6 | Korean first | UI ships in **Korean** (`ko` default) with i18n in place; English later. UI font becomes Pretendard (Hangul + Latin) |
| 7 | "What's monitoring?" | freeride's `monitoring_*` stack is Uptime Kuma, Dozzle, Adminer, and RedisInsight (no Prometheus), so the `/metrics` endpoint is dropped. Uptime Kuma checks `/api/health`; logs are read in Dozzle/Dokploy |
| 8 | Fork follows download permission | Kept (D25) |
| 9 | Anonymous reports OK | Kept (IP rate-limited) |

### 0.2 Decision log (self-grill)

| # | Decision | Answer | Why | Confidence |
|---|---|---|---|---|
| D1 | Frontend | Vite + React 19 + TypeScript strict SPA | Brief requires a React SPA. Public model pages don't need SSR: share previews use server-rendered `<meta>` tags only (§9.4) | high |
| D2 | Backend | Fastify 5 + TypeScript | TS-first, zod type provider, `app.inject()` for tests, official plugins for cookies, rate limits, helmet, static files | high |
| D3 | Monorepo | npm workspaces: `apps/web`, `apps/server`, `packages/shared`; no Turbo/Nx | Your choice (npm); three packages don't need a task runner | high |
| D4 | Contracts | zod schemas in `@mieru/shared`, used for server route schemas and client response parsing | One source of truth | high |
| D5 | DB access | `mysql2/promise`, `execute()` only, `query()`/`withTransaction()` helpers, per-feature repository modules | Given | high |
| D6 | IDs | `CHAR(36) ascii` UUIDv7 generated in the app | Non-enumerable URLs, readable in SQL, time-ordered inserts | medium |
| D7 | Tokens | Access JWT (10 min) in memory; refresh token in an `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` cookie, stored hashed, rotated, reuse-detected | XSS can't read tokens; CSRF only applies to two cookie routes, which are guarded (§6.7) | high |
| D8 | Origin | One origin: Fastify serves the SPA build (`@fastify/static`) and `/api` from one container | SameSite=Strict works, no CORS, one Dokploy service | high |
| D9 | Password hashing | argon2id (m=19 MiB, t=2, p=1) | OWASP baseline | high |
| D10 | OAuth | Hand-rolled Authorization Code + PKCE with `fetch` + `jose` | Two providers; auditable | medium |
| D11 | Identity model | `username` (unique handle) is the public identity used for sharing, profiles, and attribution. `email` is nullable, unverified, unique, and only used to log in with a password | Without verification, an email proves nothing, so nothing may depend on it | high |
| D12 | Account linking | Never by email; linking only from Settings while logged in | Account-takeover vector | high |
| D13 | Password recovery | None. OAuth-linked users log in with the provider and can set a new password in Settings; password-only users who forget are locked out | Your answer (round 2) | high |
| D14 | Uploads | **tus resumable uploads** (`@tus/server` + `@tus/file-store`, client `tus-js-client`), 50 MiB chunks, Bearer auth on every chunk, size limits checked at creation from the required `Upload-Length` | Cloudflare's 100 MB body cap; multi-GiB files over home internet need resume. Replaces the brief's "multer diskStorage": still streamed to disk, still UUID names, still size-limited | medium |
| D15 | Processing | Asynchronous: `POST /api/models` returns `202`; an in-process job runner (DB-backed status, concurrency 1, resumes `processing` rows at boot) hashes, dedupes, parses in a `worker_threads` worker with timeout + memory limits, then publishes | Cloudflare's 100 s timeout; hashing + parsing multi-GiB files takes longer than a request should | high |
| D16 | ONNX parsing | Own **streaming protobuf wire scanner** over a file handle for container messages (`ModelProto`, `GraphProto`, `TensorProto` headers); small messages (`NodeProto`, `ValueInfoProto`) decoded with `protobufjs` from the vendored `onnx.proto`. Tensor payloads (`raw_data`, `*_data`) are skipped; only their file offsets are recorded | Loading a 2 GiB file into a 2 GiB container on a shared 15 GiB host isn't acceptable; recorded offsets also feed weight viz (P1) | medium |
| D17 | Storage dedup | Content-addressed `blobs` table (unique sha256); `model_files` reference blobs; a blob's file is deleted when the last reference goes away | Forks and re-uploads cost no disk; parse once per content | high |
| D18 | Parsed cache | Gzipped sidecar `STORAGE_DIR/parsed/<blob_key>.v<parserVersion>.json.gz` + summary columns in MySQL | Large JSON stays out of MySQL; lazy re-parse when the parser version changes | high |
| D19 | Graph renderer | React Flow + elkjs (Web Worker) + prefix-based collapsing; measured spike against Model Explorer | Compound layout for groups; reusable for comments and design mode | medium |
| D20 | UI stack | Tailwind v4 + Radix primitives (via shadcn/ui, restyled to the mieru tokens), TanStack Query, React Router v7, Recharts | Accessible primitives without shadcn's default look; tokens come from §9.1 + the brand skill | medium |
| D21 | Access check | Single resolver `resolveModelAccess` + one Fastify gate; boot fails if a model route lacks the gate | Brief: enforced in one place | high |
| D22 | No-access response | `404` without any role; `403` with a role that is too low | Doesn't leak model existence | high |
| D23 | Downloads | `POST /file-ticket` → 60 s signed URL → `GET /file?ticket=` with single-range `Range` support | `<a href>` can't send headers; 2 GiB downloads need resume | high |
| D24 | Link tokens | SHA-256 for lookup + AES-256-GCM ciphertext so the owner can copy the link again | Drive-like UX, DB leak alone doesn't expose links | medium |
| D25 | Fork gate | Fork allowed iff logged in and `canDownload` | A fork *is* a copy of the file; a separate toggle would be a toggle that can't actually protect anything | medium |
| D26 | Demo gate | In-browser demo requires `canDownload`, file ≤ `DEMO_MAX_BYTES` (512 MiB) | The browser must receive the bytes | high |
| D27 | Weight viz gate | Histograms/stats: any viewer. Filter image grids: `canDownload` | Aggregates reveal little; filter images are the raw weights | medium |
| D28 | Deletion order | DB transaction first, then file unlinks; `storage:gc` sweeps leftovers | Orphan files are harmless; dangling rows aren't | high |
| D29 | Migrations | Forward-only numbered `.sql` + runner with checksums and a `GET_LOCK` advisory lock; runs at container start before listening | Single instance, but Dokploy rolling updates can overlap two containers briefly | high |
| D30 | i18n | UI strings go through `i18next` from day one; **Korean (`ko`) at launch**, English later | Your answer (round 2); retrofitting i18n is expensive | high |
| D34 | Repository size | 10 GiB per model (all versions + labels); per file ONNX ≤ 2 GiB, safetensors ≤ 10 GiB; no per-user total | Your answer (round 2) | high |
| D33 | Public downloads | Per-model choice when going public: **downloads allowed (default)** or **view only**; Explore shows which and can filter | Your answer (round 3); see §7.1 | high |
| D31 | Search | MySQL `FULLTEXT ... WITH PARSER ngram` on model name + description | No extra service; ngram handles CJK names | medium |
| D32 | Tests | Vitest (unit + integration with real MySQL), Playwright headless | Your testing policy | high |

---

## 1. Goals and non-goals

### Goals
1. Accounts: email+password, GitHub, Google; safe sessions; self-service deletion.
2. Upload `.onnx` (≤ 2 GiB) and `.safetensors` (≤ 10 GiB), resumable, with clear feedback while processing; up to 10 GiB per repository.
3. Visualize: ONNX computation graph (op colors, inspector, collapsible blocks, search), safetensors module tree, summary header, Stats tab.
4. Share: private / specific people / anyone with the link / public; viewer / commenter / editor; expiring links; download settings; forks.
5. Discover: Explore page and user profiles for public models, with reporting and admin takedown.
6. Run on freeride via Dokploy at `mieru.byeolki.me` with backups, health checks, and logs.
7. Then P1 (comments, versions + diff, workspaces, in-browser demo, weight viz) and P2 (feature maps, design mode).

### Non-goals
- `.pt` / `.pth` / `.bin` / pickle / `.h5` / TFLite / GGUF (`.pt` gets a conversion guide).
- ONNX external data (`.onnx` + `.data`, > 2 GiB models).
- Server-side inference or shape inference.
- Outgoing email of any kind (notifications, verification, reset) and password recovery.
- Legal/compliance pages (terms, privacy policy).
- Object storage, multi-server, horizontal scaling.
- Paid plans and billing.
- Native apps.

---

## 2. Architecture

### 2.1 Overview

```mermaid
flowchart LR
  subgraph Browser
    SPA["mieru SPA (React)\nTanStack Query · React Router\nReact Flow + elkjs worker\ntus-js-client · onnxruntime-web (P1)"]
  end

  CF["Cloudflare (tunnel)"]

  subgraph freeride["freeride (Dokploy, Docker Swarm)"]
    TR["Traefik"]
    subgraph app["mieru-app container (Node 22)"]
      API["Fastify: /api + static SPA"]
      TUS["tus endpoint /api/uploads"]
      JOB["job runner\n(in-process, DB status)"]
      W["parser worker\n(worker_threads)"]
    end
    DB[("Dokploy MySQL 8.4")]
    FS[("/data/projects/mieru/storage\nuploads/ blobs/ parsed/")]
  end

  GH["GitHub OAuth"]
  GO["Google OIDC"]

  SPA --> CF --> TR --> API
  API --> DB
  TUS --> FS
  JOB --> W --> FS
  JOB --> DB
  API -- "stream download" --> FS
  API --> GH & GO
```

### 2.2 Upload → processing → render
1. The SPA creates a tus upload: `POST /api/uploads` with `Upload-Length` and metadata `{ filename }`. The server checks auth, extension, the per-format file limit, the repository limit (P1 new versions: `repo bytes + pending + Upload-Length ≤ 10 GiB`), and the server free-space reserve, then creates `uploads/<uuid>`.
2. The SPA sends 50 MiB `PATCH` chunks; retries resume from `HEAD`'s `Upload-Offset`.
3. When complete, the SPA calls `POST /api/models { uploadId, name, description?, visibility? }` (or `POST /api/models/:id/versions` in P1). The server checks that the upload belongs to the caller, is complete, and has the right magic bytes, creates `models` + `model_versions(status='processing')`, and returns `202 { model }`.
4. The job runner picks it up: stream-hash (SHA-256) → if a blob with that hash exists, drop the upload and reuse the blob and its parse; otherwise run the parser worker (timeout scales with size: 30 s + 30 s/GiB) → write the sidecar → `rename` into `blobs/<uuid>` → insert `blobs` + `model_files`, set version `ready`, point `current_version_id` at it. On failure: version `failed` with a reason code; files are cleaned.
5. The SPA polls `GET /api/models/:id` every 2 s while `processing` (TanStack Query `refetchInterval`), then loads `GET /api/models/:id/graph`.

### 2.3 Deployment (Dokploy on freeride)
- **Image**: multi-stage `Dockerfile` at repo root (`node:22-bookworm-slim`; build web + server; runtime image has `apps/server/dist`, `apps/web/dist`, prod `node_modules`). Runs as a non-root `mieru` user (fixed UID so the bind-mount ownership is predictable).
- **Dokploy Application** `mieru-app`: builds from the GitHub repo (auto-deploy on `main`). One replica. Limits: 2 GiB memory, 4 CPUs. Health check `GET /api/health`. Bind mount `/data/projects/mieru/storage:/var/lib/mieru/storage`. Env vars set in Dokploy (never in the repo).
- **Dokploy MySQL** `mieru-db`: MySQL 8.4, 1 GiB memory limit, `innodb_buffer_pool_size=512M`, internal network only. Data on Dokploy's volume (on `/mnt/docker-data`, per `~/SERVER.md`).
- **Entrypoint**: `node dist/scripts/migrate.js && node dist/server.js` (migrations hold a MySQL `GET_LOCK('mieru_migrate')`).
- **Network path**: Cloudflare → `cloudflared` → Traefik → app. `TRUST_PROXY` hop count + `CF-Connecting-IP` handling are verified in M-R.2 (rate limits depend on the real client IP). `/api` responses send `Cache-Control: private, no-store` unless stated otherwise, so Cloudflare never caches them.
- **Domain**: `mieru.byeolki.me` added as a Dokploy domain on the app, exposed through Cloudflare like your other freeride services. `APP_ORIGIN=https://mieru.byeolki.me`.
- **Backups**: daily `mysqldump --single-transaction` (keep 14) and an `rsync` of `storage/blobs` (`parsed/` is rebuildable, so it's skipped) into `/data/backups/mieru`, run as Dokploy scheduled tasks. Accepted risk: `/data` is the same NVMe that holds the live data, so this protects against mistakes (bad migration, deleted rows, removed volume), not against the drive itself failing. SSDs do fail, often suddenly (controller/firmware) rather than gradually. A restore drill is part of M-R.
- **Observability** (fits what freeride already runs: Uptime Kuma, Dozzle, Adminer; there's no Prometheus):
  - pino JSON logs to stdout, read in Dozzle or Dokploy's log view.
  - `GET /api/health`: liveness (DB reachable, storage writable). Used by the Docker health check, so it never fails for soft problems.
  - `GET /api/health/deep`: returns `503` when free disk < reserve, the job queue is stuck (oldest `processing` > 15 min), or backups are older than 36 h. An Uptime Kuma HTTP monitor on it gives you alerts.
  - Adminer (already running) for ad-hoc SQL; it's reachable only from your network, never exposed through mieru.

---

## 3. Repo layout and tooling

```
mieru/
├─ apps/
│  ├─ server/                       # @mieru/server
│  │  ├─ migrations/                # 001_init.sql …
│  │  ├─ scripts/                   # migrate.ts, storage-gc.ts, make-fixtures.ts, admin.ts
│  │  ├─ src/
│  │  │  ├─ app.ts  server.ts  config.ts
│  │  │  ├─ db/                     # pool.ts, query.ts
│  │  │  ├─ plugins/                # auth.ts, model-access.ts, rate-limits.ts, errors.ts, static-spa.ts
│  │  │  ├─ features/
│  │  │  │  ├─ auth/                # password, sessions, oauth/{github,google}.ts
│  │  │  │  ├─ users/               # profile, settings, account deletion
│  │  │  │  ├─ uploads/             # tus server wiring, size limits
│  │  │  │  ├─ models/              # routes, service, repo, download, fork
│  │  │  │  ├─ sharing/             # access-service.ts (THE resolver), shares, links
│  │  │  │  ├─ explore/             # public listing, search
│  │  │  │  ├─ moderation/          # reports, takedowns, admin routes
│  │  │  │  ├─ comments/ workspaces/ demo/ weights/   # P1
│  │  │  ├─ jobs/                   # runner.ts, process-version.ts
│  │  │  ├─ parsing/                # worker.ts, run-parser.ts, onnx/, safetensors/, limits.ts
│  │  │  ├─ storage/                # paths.ts (UUID-only), blobs.ts, disk.ts
│  │  │  └─ observability/          # health.ts (liveness + deep)
│  │  └─ test/
│  └─ web/                          # @mieru/web
│     ├─ src/
│     │  ├─ main.tsx  router.tsx  i18n/
│     │  ├─ lib/                    # api-client.ts, auth-store.ts, query-client.ts, upload.ts
│     │  ├─ design/                 # tokens.css (from §9.1 + brand skill), Radix-based primitives
│     │  └─ features/               # auth, dashboard, explore, profile, upload, model-view, sharing, settings, admin
│     ├─ e2e/
│     └─ playwright.config.ts
├─ packages/shared/                 # @mieru/shared: zod schemas, DTOs, ParsedModel, roles
├─ docs/plans/  docs/deploy.md  docs/runbook.md
├─ Dockerfile  .dockerignore
├─ paseo.json                       # scripts: server, web (bind $PASEO_PORT)
├─ package.json                     # workspaces + root scripts
├─ tsconfig.base.json  eslint.config.js  .prettierrc  vitest.workspace.ts
├─ .github/workflows/ci.yml         # lint, typecheck, unit, integration (MySQL service container)
└─ .env.example
```

**Tooling**: Node 22 LTS (`.nvmrc`, `engines`), npm 10 workspaces, TypeScript 5 strict + `noUncheckedIndexedAccess`, ESM. ESLint flat config (`typescript-eslint` strict-type-checked, `react-hooks`, `jsx-a11y`), Prettier. Vitest + Playwright. Dev server: `tsx watch` *only inside the Paseo `server` script*; never run by agents directly.

**Root scripts**: `lint`, `format:check`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `build`, plus workspace scripts `db:migrate`, `storage:gc`, `fixtures`, `admin`.

**Key dependencies**
- server: `fastify`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/static`, `fastify-type-provider-zod`, `@tus/server`, `@tus/file-store`, `mysql2`, `argon2`, `jose`, `protobufjs` (+ `protobufjs-cli` dev), `pino`, `uuid`.
- web: `react`, `react-router`, `@tanstack/react-query`, `@tanstack/react-virtual`, `@xyflow/react`, `elkjs`, `recharts`, `tus-js-client`, `i18next` + `react-i18next`, Radix primitives, `tailwindcss`, `zod`. P1: `onnxruntime-web`.

---

## 4. MySQL schema

MySQL 8.4 LTS. `utf8mb4_0900_ai_ci`, `DATETIME(3)` in UTC (pool `timezone: 'Z'`). App pool: `multipleStatements: false`; the migration runner uses its own connection with `multipleStatements: true`.

### `001_init.sql` (Release 1)

```sql
CREATE TABLE schema_migrations (
  version     INT UNSIGNED NOT NULL,
  name        VARCHAR(255) NOT NULL,
  checksum    CHAR(64) CHARACTER SET ascii NOT NULL,
  applied_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id                  CHAR(36) CHARACTER SET ascii NOT NULL,
  username            VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL, -- [a-z0-9_-]{3,30}, case-insensitive unique
  display_name        VARCHAR(100) NOT NULL,
  bio                 VARCHAR(300) NULL,
  avatar_url          VARCHAR(2048) NULL,
  email               VARCHAR(320) NULL,                       -- password-login identifier only; unverified
  email_normalized    VARCHAR(320) COLLATE utf8mb4_bin NULL,
  password_hash       VARCHAR(255) NULL,
  role                ENUM('user','admin') NOT NULL DEFAULT 'user',
  failed_login_count  INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME(3) NULL,
  password_changed_at DATETIME(3) NULL,
  onboarded_at        DATETIME(3) NULL,                        -- username confirmed (OAuth signups pick one)
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email_normalized (email_normalized),    -- multiple NULLs allowed
  CONSTRAINT chk_users_password_needs_email CHECK (password_hash IS NULL OR email_normalized IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE oauth_accounts (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id           CHAR(36) CHARACTER SET ascii NOT NULL,
  provider          ENUM('github','google') NOT NULL,
  provider_user_id  VARCHAR(255) CHARACTER SET ascii NOT NULL,
  provider_email    VARCHAR(320) NULL,                         -- display in Settings only
  provider_login    VARCHAR(255) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_oauth_provider_subject (provider, provider_user_id),
  UNIQUE KEY uq_oauth_user_provider (user_id, provider),
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE refresh_tokens (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id           CHAR(36) CHARACTER SET ascii NOT NULL,
  family_id         CHAR(36) CHARACTER SET ascii NOT NULL,
  token_hash        BINARY(32) NOT NULL,
  replaced_by_id    CHAR(36) CHARACTER SET ascii NULL,
  rotated_at        DATETIME(3) NULL,
  revoked_at        DATETIME(3) NULL,
  revoke_reason     ENUM('logout','logout_all','reuse_detected','password_changed','account_deleted','session_revoked') NULL,
  auth_time         DATETIME(3) NOT NULL,                      -- when the user last proved identity (re-auth checks)
  expires_at        DATETIME(3) NOT NULL,                      -- 30 d per token
  family_expires_at DATETIME(3) NOT NULL,                      -- 90 d per session
  user_agent        VARCHAR(255) NULL,
  ip                VARCHAR(45) CHARACTER SET ascii NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY ix_refresh_family (family_id),
  KEY ix_refresh_user (user_id),
  KEY ix_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Content-addressed files on disk. Shared by forks and identical uploads.
CREATE TABLE blobs (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  storage_key     CHAR(36) CHARACTER SET ascii NOT NULL,       -- file name under blobs/
  sha256          BINARY(32) NOT NULL,
  size_bytes      BIGINT UNSIGNED NOT NULL,
  format          ENUM('onnx','safetensors','labels_json') NOT NULL,
  parser_version  SMALLINT UNSIGNED NULL,
  total_params    BIGINT UNSIGNED NULL,
  node_count      INT UNSIGNED NULL,
  tensor_count    INT UNSIGNED NULL,
  summary         JSON NULL,                                   -- ModelSummary (§8.4)
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_blobs_storage_key (storage_key),
  UNIQUE KEY uq_blobs_sha256 (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE models (
  id                       CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_id                 CHAR(36) CHARACTER SET ascii NOT NULL,
  name                     VARCHAR(200) NOT NULL,
  description              TEXT NULL,
  license                  VARCHAR(64) CHARACTER SET ascii NULL,   -- SPDX id, e.g. 'apache-2.0'
  visibility               ENUM('private','users','link','public') NOT NULL DEFAULT 'private',
  public_allow_download    TINYINT(1) NOT NULL DEFAULT 0,          -- applies to public + anonymous access
  current_version_id       CHAR(36) CHARACTER SET ascii NULL,
  forked_from_model_id     CHAR(36) CHARACTER SET ascii NULL,
  forked_from_version_id   CHAR(36) CHARACTER SET ascii NULL,
  taken_down_at            DATETIME(3) NULL,
  taken_down_reason        VARCHAR(500) NULL,
  created_at               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_models_owner_updated (owner_id, updated_at),
  KEY ix_models_public (visibility, taken_down_at, updated_at),
  KEY ix_models_forked_from (forked_from_model_id),
  FULLTEXT KEY ft_models_name_desc (name, description) WITH PARSER ngram,
  -- RESTRICT: user deletion goes through the service so blobs are released properly
  CONSTRAINT fk_models_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_models_forked_from FOREIGN KEY (forked_from_model_id) REFERENCES models (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_versions (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  version_number  INT UNSIGNED NOT NULL,
  status          ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
  failure_reason  VARCHAR(64) CHARACTER SET ascii NULL,        -- stable code (§8.2)
  upload_id       CHAR(36) CHARACTER SET ascii NULL,           -- tus upload consumed by the job
  original_name   VARCHAR(255) NOT NULL,
  note            VARCHAR(500) NULL,
  created_by      CHAR(36) CHARACTER SET ascii NULL,           -- NULL after the uploader deletes their account
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_versions_model_number (model_id, version_number),
  KEY ix_versions_status (status, created_at),
  CONSTRAINT fk_versions_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_versions_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE models
  ADD CONSTRAINT fk_models_current_version FOREIGN KEY (current_version_id) REFERENCES model_versions (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_models_forked_from_version FOREIGN KEY (forked_from_version_id) REFERENCES model_versions (id) ON DELETE SET NULL;

CREATE TABLE model_files (
  id             CHAR(36) CHARACTER SET ascii NOT NULL,
  version_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  kind           ENUM('model','labels') NOT NULL,
  blob_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  original_name  VARCHAR(255) NOT NULL,                        -- display + Content-Disposition only
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_model_files_version_kind (version_id, kind),
  KEY ix_model_files_blob (blob_id),
  CONSTRAINT fk_model_files_version FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE,
  CONSTRAINT fk_model_files_blob FOREIGN KEY (blob_id) REFERENCES blobs (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- In-flight tus uploads; repository-size checks count declared lengths of pending uploads.
CREATE TABLE uploads (
  id             CHAR(36) CHARACTER SET ascii NOT NULL,       -- also the file name under uploads/
  user_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  target_model_id CHAR(36) CHARACTER SET ascii NULL,          -- P1: upload meant as a new version of this model
  original_name  VARCHAR(255) NOT NULL,
  declared_size  BIGINT UNSIGNED NOT NULL,
  completed_at   DATETIME(3) NULL,
  consumed_at    DATETIME(3) NULL,                             -- handed to a model version
  expires_at     DATETIME(3) NOT NULL,                         -- 24 h
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_uploads_user (user_id, consumed_at),
  KEY ix_uploads_expires (expires_at),
  CONSTRAINT fk_uploads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE shares (
  model_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id         CHAR(36) CHARACTER SET ascii NOT NULL,
  role            ENUM('viewer','commenter','editor') NOT NULL,
  allow_download  TINYINT(1) NOT NULL DEFAULT 1,               -- forced to 1 for editor in the service
  created_by      CHAR(36) CHARACTER SET ascii NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (model_id, user_id),
  KEY ix_shares_user (user_id, created_at),
  CONSTRAINT fk_shares_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE share_links (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  token_hash        BINARY(32) NOT NULL,
  token_ciphertext  VARBINARY(128) NOT NULL,                   -- AES-256-GCM(iv|tag|ct)
  label             VARCHAR(100) NULL,
  role              ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
  allow_download    TINYINT(1) NOT NULL DEFAULT 0,
  expires_at        DATETIME(3) NULL,
  revoked_at        DATETIME(3) NULL,
  last_used_at      DATETIME(3) NULL,
  created_by        CHAR(36) CHARACTER SET ascii NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_share_links_token_hash (token_hash),
  KEY ix_share_links_model (model_id),
  CONSTRAINT fk_share_links_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_share_links_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A logged-in user who opened a link keeps that access while the link stays valid.
CREATE TABLE link_visits (
  user_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  link_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  first_opened_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_opened_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, link_id),
  KEY ix_link_visits_link (link_id),
  CONSTRAINT fk_link_visits_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_link_visits_link FOREIGN KEY (link_id) REFERENCES share_links (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reports (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  reporter_id  CHAR(36) CHARACTER SET ascii NULL,              -- NULL = anonymous or deleted account
  reason       ENUM('malware','copyright','illegal','spam','other') NOT NULL,
  details      VARCHAR(2000) NULL,
  status       ENUM('open','dismissed','actioned') NOT NULL DEFAULT 'open',
  resolved_by  CHAR(36) CHARACTER SET ascii NULL,
  resolved_at  DATETIME(3) NULL,
  reporter_ip  VARCHAR(45) CHARACTER SET ascii NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_reports_status (status, created_at),
  KEY ix_reports_model (model_id),
  CONSTRAINT fk_reports_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_resolver FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    CHAR(36) CHARACTER SET ascii NULL,
  action      VARCHAR(64) CHARACTER SET ascii NOT NULL,        -- 'auth.reuse_detected', 'share.update', 'admin.takedown', …
  target_type VARCHAR(32) CHARACTER SET ascii NULL,
  target_id   CHAR(36) CHARACTER SET ascii NULL,
  ip          VARCHAR(45) CHARACTER SET ascii NULL,
  meta        JSON NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_actor (actor_id, created_at),
  KEY ix_audit_target (target_type, target_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

Repository size = `SUM(blobs.size_bytes)` over the model's `model_files` (every version, model + labels) + `SUM(declared_size)` of unconsumed, unexpired uploads targeting it. Limit `MAX_REPO_BYTES` = 10 GiB. Computed with one indexed query; no counter column to drift. There is no per-user total (round 2); disk safety comes from the server-wide free-space reserve.

### `002_comments.sql` (P1)

```sql
CREATE TABLE comments (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  version_id   CHAR(36) CHARACTER SET ascii NULL,
  node_ref     VARCHAR(512) NULL,                              -- ONNX node name / safetensors module path; NULL = model-level
  parent_id    CHAR(36) CHARACTER SET ascii NULL,
  author_id    CHAR(36) CHARACTER SET ascii NULL,              -- NULL = deleted account ("Deleted user")
  body         TEXT NOT NULL,
  resolved_at  DATETIME(3) NULL,
  resolved_by  CHAR(36) CHARACTER SET ascii NULL,
  deleted_at   DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_comments_model_node (model_id, node_ref(191), created_at),
  KEY ix_comments_parent (parent_id),
  CONSTRAINT fk_comments_model    FOREIGN KEY (model_id)    REFERENCES models (id)         ON DELETE CASCADE,
  CONSTRAINT fk_comments_version  FOREIGN KEY (version_id)  REFERENCES model_versions (id) ON DELETE SET NULL,
  CONSTRAINT fk_comments_parent   FOREIGN KEY (parent_id)   REFERENCES comments (id)       ON DELETE CASCADE,
  CONSTRAINT fk_comments_author   FOREIGN KEY (author_id)   REFERENCES users (id)          ON DELETE SET NULL,
  CONSTRAINT fk_comments_resolver FOREIGN KEY (resolved_by) REFERENCES users (id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### `003_workspaces.sql` (P1)

```sql
CREATE TABLE workspaces (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  slug        VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  name        VARCHAR(100) NOT NULL,
  created_by  CHAR(36) CHARACTER SET ascii NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_workspaces_slug (slug),
  CONSTRAINT fk_workspaces_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workspace_members (
  workspace_id  CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  role          ENUM('owner','member') NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, user_id),
  KEY ix_workspace_members_user (user_id),
  CONSTRAINT fk_wm_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_wm_user      FOREIGN KEY (user_id)      REFERENCES users (id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE models
  ADD COLUMN workspace_id CHAR(36) CHARACTER SET ascii NULL AFTER owner_id,
  ADD KEY ix_models_workspace_updated (workspace_id, updated_at),
  ADD CONSTRAINT fk_models_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT;
```

### Later migrations
- `004_stars.sql` (P1, Explore ranking): `stars(user_id, model_id, created_at, PK(user_id, model_id), KEY(model_id))`.
- `005_designs.sql` (P2): `designs(id, owner_id, name, spec JSON, visibility, forked_from_design_id, …)`, specified when P2 starts.
- Versions, demo labels, and weight stats need no new tables (`model_versions`, `model_files.kind='labels'`, sidecar `parsed/<blob_key>.stats.v<N>.json.gz`). The ONNX tensor payload offsets the scanner records are stored in that sidecar.

**mysql2 gotcha**: with `execute()`, `LIMIT ?`/`OFFSET ?` must be bound as strings on MySQL 8.0.22+; the `query()` helper handles it and has a unit test.

---

## 5. REST API

Conventions: JSON; errors `{ "error": { "code", "message", "details"? } }`. Auth: **none**, **user** (`Authorization: Bearer`), **cookie** (refresh cookie + CSRF checks), **principal** (user and/or `X-Share-Link`, or anonymous for public models). Role = minimum effective role (§7). Cursor pagination `?limit&cursor` → `{ items, nextCursor }`.

### Auth
| Method | Path | Auth | Request → Response |
|---|---|---|---|
| POST | `/api/auth/signup` | none (rate-limited) | `{ username, email, password, displayName }` → `201 { accessToken, user }` + cookie |
| POST | `/api/auth/login` | none (rate-limited, backoff) | `{ identifier (email or username), password }` → `{ accessToken, user }` + cookie · `401` · `429 { retryAfterSec }` |
| POST | `/api/auth/refresh` | cookie | → `{ accessToken, user }` + rotated cookie · `401` |
| POST | `/api/auth/logout` | cookie | → `204` |
| POST | `/api/auth/logout-all` | user | → `204` |
| POST | `/api/auth/oauth/:provider/authorize` | none / user for `link`,`reauth` | `{ intent: 'login'\|'link'\|'reauth', returnTo? }` → `{ authorizeUrl }` + `mieru_oauth` tx cookie |
| GET | `/api/auth/oauth/:provider/callback` | tx cookie | → `302 /auth/callback?status=…` (+ cookie on login) |
| POST | `/api/auth/reauth` | user | `{ password }` → `{ accessToken }` with fresh `auth_time` (OAuth-only users use `intent=reauth`) |

### Me and users
| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/api/me` | user | `{ id, username, displayName, bio, avatarUrl, email, hasPassword, oauthProviders, role, onboarded }` |
| PATCH | `/api/me` | user | `{ username? (needs onboarding or 30-day cooldown), displayName?, bio? }` |
| POST | `/api/me/onboarding` | user | `{ username }` (OAuth signups) |
| PUT | `/api/me/password` | user + recent auth | `{ email (if none yet), newPassword }` → `204`, revokes other sessions |
| DELETE | `/api/me/oauth/:provider` | user | `204` · `409 last_login_method` |
| GET / DELETE | `/api/me/sessions[/:familyId]` | user | list / revoke |
| DELETE | `/api/me` | user + recent auth (≤ 10 min) | `{ confirmUsername }` → `204` (§6.9) · `409 sole_workspace_owner` (P1) |
| GET | `/api/users/search?q=` | user (rate-limited) | prefix search on username/display name → `[{ username, displayName, avatarUrl }]` (max 10) |
| GET | `/api/users/:username` | none | public profile `{ username, displayName, bio, avatarUrl, createdAt }` |
| GET | `/api/users/:username/models` | none | public, non-taken-down models |

### Uploads (tus 1.0, Bearer on every request)
| Method | Path | Notes |
|---|---|---|
| OPTIONS / POST | `/api/uploads` | create; `Upload-Length` required (no deferred length); metadata `filename` (+ `modelId` for P1 versions). `413 file_too_large` (ONNX > 2 GiB, safetensors > 10 GiB), `413 repository_full`, `415 unsupported_format` (+ conversion hint for `.pt`), `507 server_storage_low` |
| HEAD / PATCH | `/api/uploads/:uploadId` | resume / append (owner only, otherwise 404) |
| DELETE | `/api/uploads/:uploadId` | tus termination |

### Models
| Method | Path | Auth | Role | Request → Response |
|---|---|---|---|---|
| GET | `/api/models?scope=owned\|shared` | user | — | `{ items: ModelListItem[], nextCursor }` (`shared` = direct shares + visited links) |
| POST | `/api/models` | user | — | `{ uploadId, name, description?, license?, visibility? }` → `202 ModelDetail` (`status: 'processing'`) |
| GET | `/api/models/:id` | principal | viewer | `ModelDetail` |
| PATCH | `/api/models/:id` | user | editor (`visibility`, `publicAllowDownload`: owner) | `{ name?, description?, license?, visibility?, publicAllowDownload? }` |
| DELETE | `/api/models/:id` | user | owner | `204` |
| GET | `/api/models/:id/graph?version=` | principal | viewer | `ParsedModel` (gzip, `ETag`) · `409 not_ready` |
| POST | `/api/models/:id/file-ticket` | principal | viewer + canDownload | `{ kind?, version? }` → `{ url, expiresAt }` |
| GET | `/api/models/:id/file?ticket=` | ticket | re-checked | stream; `Accept-Ranges: bytes`; `206` for a single range |
| POST | `/api/models/:id/fork` | user | viewer + canDownload | `{ name?, version? }` → `201 ModelDetail` (instant: no copy, no re-parse) |
| GET | `/api/models/:id/forks` | principal | viewer | forks the caller can see |
| POST | `/api/models/:id/reports` | none (rate-limited) | viewer | `{ reason, details? }` → `204` |

`ModelListItem = { id, name, format, owner: { username, displayName, avatarUrl }, myRole, status, sizeBytes, totalParams, visibility, updatedAt }`
`ModelDetail = ModelListItem & { description, license, forkedFrom: { id, name, ownerUsername } | { hidden: true } | null, forkCount, currentVersion: { id, number, status, failureReason, originalName, sha256, summary, createdAt }, myAccess: { role, canDownload, canFork, via }, takenDown: boolean }`

### Sharing (owner only)
| Method | Path | Request → Response |
|---|---|---|
| GET | `/api/models/:id/shares` | `[{ user: { id, username, displayName, avatarUrl }, role, allowDownload, createdAt }]` |
| PUT | `/api/models/:id/shares/:username` | `{ role, allowDownload? }` (upsert) → `Share` · `404 user_not_found` · `422 cannot_share_with_owner` |
| DELETE | `/api/models/:id/shares/:username` | `204` |
| GET | `/api/models/:id/share-links` | `[{ id, url, label, role, allowDownload, expiresAt, revokedAt, lastUsedAt, visitorCount }]` |
| POST | `/api/models/:id/share-links` | `{ role, allowDownload, expiresAt?, label? }` → `201 ShareLink` |
| PATCH | `/api/models/:id/share-links/:linkId` | `{ role?, allowDownload?, expiresAt?, label? }` |
| DELETE | `/api/models/:id/share-links/:linkId` | `204` (revokes; visitors lose access) |
| POST | `/api/share-links/resolve` | `X-Share-Link` header (rate-limited) → `{ modelId, role, canDownload }`; records `link_visits` for logged-in callers · `404` for unknown/expired/revoked/not-link-visible |

### Explore and moderation
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/explore?q=&format=&sort=recent\|forks\|stars(P1)` | none | public, non-taken-down, `ready` models; FULLTEXT when `q` is set |
| GET | `/api/admin/reports?status=` | admin | queue |
| POST | `/api/admin/reports/:id/resolve` | admin | `{ action: 'dismiss'\|'takedown', reason? }` |
| POST | `/api/admin/models/:id/takedown` / `restore` | admin | taken-down models are visible only to their owner (with the reason) and admins; links, shares, and downloads stop |

### P1 / P2
| Method | Path | Auth | Role |
|---|---|---|---|
| GET/POST | `/api/models/:id/comments` | principal / user | viewer / commenter |
| PATCH/DELETE | `/api/comments/:commentId` | user | author; editor resolves; owner deletes |
| GET/POST | `/api/models/:id/versions` | principal / user | viewer / editor (`{ uploadId, note? }` → `202`) |
| DELETE | `/api/models/:id/versions/:n` | user | owner (not the only ready version) |
| GET | `/api/models/:id/diff?from=&to=` | principal | viewer |
| PUT | `/api/models/:id/labels` | user | editor (`labels.json` ≤ 1 MiB via a normal JSON body) |
| GET | `/api/models/:id/tensors/stats?name=` | principal | viewer (histogram) |
| GET | `/api/models/:id/tensors/filters?name=` | principal | viewer + canDownload |
| PUT/DELETE | `/api/models/:id/star` | user | viewer |
| CRUD | `/api/workspaces[/:slug[/members]]` | user | ws owner for writes |
| POST | `/api/models/:id/move` | user | owner + ws member |

---

## 6. Auth flows

### 6.1 Tokens
- Access: JWT HS256 via `jose`, 10 min, `{ sub, sid (family), auth_time, iat, exp, iss, aud }`, in memory only.
- Refresh: 32 random bytes base64url, cookie `mieru_rt` (`HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=30d`), DB stores SHA-256. 30 d per token, 90 d per family.
- "Recent auth" = `auth_time` within 10 min. Required for password change and account deletion.

### 6.2 Signup (password)
1. zod: `username` `^[a-z0-9][a-z0-9_-]{2,29}$` and not reserved (`admin`, `api`, `explore`, `settings`, `s`, `m`, `u`, `help`, …), `email` RFC-ish, `password` 10–128 chars, `displayName` 1–100.
2. `409 username_taken` / `409 email_taken` (enumeration accepted for usernames, which are public anyway; emails are rate-limited, R8).
3. argon2id → insert user (`onboarded_at = now`).
4. Issue session. The signup form states that mieru can't reset forgotten passwords and suggests linking GitHub or Google in Settings; a dismissible Settings hint repeats it until an OAuth account is linked.

### 6.3 Login + brute force
1. IP limit 10/min. `identifier` containing `@` → email lookup, else username.
2. `locked_until > now` → `429` (dummy argon2 verify keeps timing flat).
3. Unknown user or no password set → dummy verify → `401 invalid_credentials`.
4. Wrong password → `failed_login_count += 1`; at ≥ 5, `locked_until = now + min(2^(count-5), 30) min`.
5. Success → reset counters, rehash if params changed, issue a session (`auth_time = now`).

### 6.4 Session issue, refresh rotation, reuse detection
- **Issue**: new `family_id`, insert a token row with `auth_time`, set the cookie, sign the JWT.
- **Refresh** (one transaction, `SELECT … FOR UPDATE` on the token row):
  1. CSRF checks (§6.7). Not found / revoked → `401` + clear cookie.
  2. Already rotated: rotated ≤ 10 s ago → `401 stale_refresh` (benign multi-tab race; the browser already holds the newer cookie, and the client retries once). Otherwise **reuse detected**: revoke the whole family (`reuse_detected`), write an `audit_events` row, `401`.
  3. Expired (token or family) → `401`.
  4. `password_changed_at > token.created_at` → revoke family, `401`.
  5. Insert the successor (same family, same `auth_time`, same `family_expires_at`), mark the old one rotated, commit, set the cookie, return a new JWT.
- **Client**: single-flight refresh per tab + `navigator.locks.request('mieru-refresh')` across tabs; boot calls `/refresh`; any `401` from the API triggers one refresh + one retry. tus requests refresh the header through `onBeforeRequest`.

### 6.5 Logout
`logout`: revoke the cookie's family, clear the cookie, `204`; the client drops its token and clears the query cache. `logout-all`: revoke every family. Settings → Sessions can revoke individual families.

### 6.6 OAuth (GitHub, Google), Authorization Code + PKCE
1. `POST /authorize { intent, returnTo }`. `returnTo` must be a same-origin relative path, else `/dashboard`.
2. Server makes `state`, `code_verifier` (→ S256 `code_challenge`), and `nonce` (Google), and stores them with `{ provider, intent, userId?, returnTo, exp: 10 min }` in a signed `mieru_oauth` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/api/auth/oauth`; Lax because the callback is a cross-site top-level redirect).
3. SPA navigates to `authorizeUrl`. Scopes: GitHub `read:user user:email`, Google `openid email profile`.
4. Callback: verify signature, expiry, provider, and `state` (constant-time), clear the tx cookie, exchange the code with `code_verifier` + client secret.
5. Identity: Google `id_token` verified with `jose` against JWKS (`iss`, `aud`, `exp`, `nonce`) → `sub`; GitHub `GET /user` → numeric `id`, `login`, avatar.
6. Resolution:
   - `link`: attach to `userId` unless that `(provider, subject)` belongs to someone else (`already_linked`).
   - `reauth`: must resolve to the current user; then the new session family gets `auth_time = now`.
   - `login`, existing `oauth_accounts` row → log in.
   - `login`, new subject → create a user with `onboarded_at = NULL`, a suggested username (provider login, deduplicated), and avatar; `email` stays NULL (the provider email goes to `oauth_accounts.provider_email` for display). The SPA routes non-onboarded users to `/welcome` to confirm a username before anything else.
   - Emails are never compared across accounts (D12).
7. Issue the session cookie, `302 /auth/callback?status=ok&returnTo=…`; the callback page calls `/refresh`. Tokens never travel in URLs.

### 6.7 CSRF
- Every API route except `/api/auth/refresh` and `/api/auth/logout` authenticates only through `Authorization` (or `X-Share-Link`) headers, which browsers never attach on their own → CSRF-immune.
- Cookie routes: `SameSite=Strict` cookie scoped to `/api/auth`; `Origin` must equal `APP_ORIGIN` (missing → reject); `Content-Type: application/json` required (cross-origin requests would need a preflight, and no CORS policy is served).
- Download tickets are 60 s bearer URLs scoped to one file and principal; an attacker page can't mint one.

### 6.8 Forgotten passwords
Not supported (round 2). Users with a linked GitHub/Google account log in through it and can set a new password in Settings (recent auth). Password-only users who forget their password lose the account; the signup form and Settings say so plainly.

### 6.9 Account deletion
1. Settings → Delete account. The UI lists what will be deleted: owned models (N), versions, links; forks other people made of your models stay with them (their copy has `forked_from` cleared); your comments show as "Deleted user".
2. Requires recent auth (password re-entry or OAuth `reauth`) and typing the username.
3. Server (`users/delete-account.ts`): (P1) `409 sole_workspace_owner` if the user is the only owner of a workspace with other members. Then, in one transaction: collect blob ids referenced by the user's models → delete the models (cascades versions, files, shares, links, visits, comments on them, reports on them) → delete the user (cascades OAuth, tokens, uploads; `SET NULL` on authored comments, `created_by` columns, reports) → write an `audit_events` row (actor NULL, target = user id, no PII). After commit: unlink upload files and any blobs that now have zero references; `storage:gc` catches failures.
4. Response `204` + cleared cookie. The username becomes available again after 30 days (reserved through `audit_events` lookup) to prevent impersonation of the deleted account.

### 6.10 Rate limits (`@fastify/rate-limit`, in-memory, keyed on the real client IP)
| Route | Key | Limit |
|---|---|---|
| all `/api/*` | IP | 300/min |
| `POST /auth/login` | IP | 10/min (+ account backoff) |
| `POST /auth/signup` | IP | 5/hour |
| `POST /auth/refresh` | IP | 30/min |
| `POST /auth/reauth` | user | 10/hour |
| `POST /share-links/resolve`, requests with `X-Share-Link` | IP | 30/min; failed lookups count double |
| `POST /api/uploads` (create) | user | 30/hour |
| `POST /models/:id/fork` | user | 30/hour |
| `GET /users/search` | user | 60/min |
| `POST /models/:id/reports` | IP | 10/hour |

---

## 7. Sharing and permissions

### 7.1 What sharing means in mieru
Every model belongs to exactly one **owner**. Sharing is how the owner lets other people in. There are four ways, and they stack:

1. **People.** The owner adds specific mieru accounts by username and gives each a role: viewer, commenter, or editor, plus whether they may download the original file. They see it under "Shared with me".
2. **Links.** The owner creates one or more secret links, each with its own role (up to editor), expiry, and download setting. Anyone holding the link can open the model; people who aren't logged in always get viewer. A logged-in person who opens a link keeps access (and sees it under "Shared with me") until the link expires or is revoked.
3. **Public.** The model is listed on Explore and on the owner's profile, and anyone can view it. Downloads are off unless the owner allows them.
4. **Workspaces (P1).** Models in a team workspace are available to its members.

Sharing never copies anything. It grants access to the owner's model, and the owner can take that access back at any time. Only the owner changes who has access; editors change the model, not the guest list. When someone wants their own copy, to change or reshare it, they **fork** it (§7.4). Forking needs download permission, since a fork contains the file.

General-access setting on a model: **Private** (owner only; existing people and links are kept but inactive) → **Specific people** → **Anyone with the link** (people + links) → **Public** (people + links + everyone as viewer).

**Public: downloadable or view-only (decided in round 3).** Making a model public asks one more thing in the same dialog: "다운로드 허용" (default, checked) or "보기 전용". This is `models.public_allow_download`.
- *Downloadable*: anyone can download, fork (if logged in), run the demo, and see filter images. This is the open-weights case and the default, because sharing is mostly about passing models around.
- *View only*: anyone can explore the graph/tree, stats, and weight histograms; download, fork, demo, and filter images are off for the public. People and links the owner added keep their own download settings. Use cases: showing an architecture for a paper or portfolio while keeping trained weights private, course assignments, competition entries.
- Honest limit, stated in the dialog: view-only protects the **weights**, not the **architecture**. The graph shows the full structure, so anyone could rebuild an untrained copy.
- Explore shows a "보기 전용" marker on such models and has a "다운로드 가능만" filter.
- Cost: none beyond what's already designed; the resolver row and column exist. Choosing "always downloadable" instead would delete one column and one checkbox.

### 7.2 Roles and capabilities
| Capability | viewer | commenter | editor | owner |
|---|:-:|:-:|:-:|:-:|
| View metadata, graph/tree, stats, histograms | ✓ | ✓ | ✓ | ✓ |
| Download original, run demo (P1), filter images (P1), fork | if `canDownload` | if `canDownload` | ✓ | ✓ |
| Comment (P1, logged in) | | ✓ | ✓ | ✓ |
| Resolve any comment (P1) | | | ✓ | ✓ |
| Edit name/description/license, upload versions (P1), labels (P1) | | | ✓ | ✓ |
| Change general access, people, links, public download | | | | ✓ |
| Delete model or versions, move to workspace (P1) | | | | ✓ |

### 7.3 Resolution table
| Source | Condition | Role | Download |
|---|---|---|---|
| Owner | `owner_id = user` | owner | yes |
| Workspace owner (P1) | model in workspace, user is ws owner | owner, except deleting the model (stays with `owner_id`) | yes |
| Workspace member (P1) | user is ws member | editor | yes |
| Direct share | `visibility ∈ {users, link, public}` and a `shares` row | `shares.role` | `shares.allow_download` (editor: yes) |
| Link via header | `visibility ∈ {link, public}`, `X-Share-Link` hash matches, not revoked, not expired | `link.role`; **viewer if anonymous** | `link.allow_download` |
| Link via visit | logged-in user with a `link_visits` row for a link meeting the same conditions | `link.role` | `link.allow_download` |
| Public | `visibility = public` | viewer | `public_allow_download` |
| Takedown | `taken_down_at IS NOT NULL` | owner keeps view-only access with the notice; admins view; **everyone else → none** | no |
| Nothing applies | | → `404` | |

Effective role = max over sources; `canDownload` = OR over sources that grant a role; `canFork` = logged in ∧ `canDownload` ∧ not taken down. Admins get viewer on any model for moderation, plus admin routes. Model status `processing`/`failed` limits the graph endpoint (`409 not_ready`), not access.

### 7.4 Forks
- `POST /models/:id/fork` creates a new model owned by the caller: `forked_from_model_id/version_id` set, `visibility = private`, name `<name> (fork)` unless provided, and **one** version pointing at the same blob(s) as the source version (model + labels). No file copy, no re-parse, so it completes instantly. A fork's single version is never larger than the source version, so it always fits the repository limit.
- Comments, shares, links, and stars are not copied.
- Attribution: "Forked from @owner/name" links back when the viewer can see the source; otherwise it reads "Forked from a private model". If the source is deleted, the link disappears (`SET NULL`).
- Forks of public models inherit the source's `license` as the default.

### 7.5 Enforcement
- **One resolver**: `features/sharing/access-service.ts` → `resolveModelAccess(db, modelId, principal)`. It runs one SQL query (`models` LEFT JOIN `shares`, `share_links` matched by header hash, `link_visits` → `share_links`, P1 `workspace_members`) and passes the rows to a pure `combineGrants(rows, principal, now)`, which gets a table-driven unit test covering §7.3 row by row.
- **One gate**: `requireModelAccess(minRole, { download?, fork? })` preHandler sets `request.modelAccess`. At boot, a route walk **refuses to start** if any route under `/api/models/:id` lacks the gate.
- **Lists** (`scope=shared`, profiles, Explore) use dedicated SQL. A matrix integration test (users × visibilities × shares × links × visits × takedown) asserts that every list returns exactly the models the resolver grants.
- **Tickets** carry `{ modelId, fileId, principal }` and are re-resolved on use, so revocation applies to the next byte range request.
- The SPA reads `myAccess` only to hide controls.

---

## 8. Parsing pipeline

### 8.1 Validation before parsing
1. At tus creation: extension allow-list (`.onnx`, `.safetensors`; `.pt|.pth|.bin|.pkl|.ckpt` → `415` + `hint: 'convert'`), per-format file limit (`MAX_ONNX_BYTES` 2 GiB, `MAX_SAFETENSORS_BYTES` 10 GiB), repository limit (§4), and `statfs` free space ≥ `Upload-Length + DISK_RESERVE_BYTES` (default 50 GiB, because `/data` is shared with other projects).
2. Original filename: strip control characters and path separators, NFC, ≤ 255. Display and `Content-Disposition` only.
3. At `POST /models`: the upload is complete and owned by the caller, and the first bytes match:
   - safetensors: `N = u64le(0)`, `2 ≤ N ≤ 100 MiB`, `8 + N ≤ size`, byte 8 = `{`.
   - ONNX: byte 0 = `0x08` (field 1 `ir_version`, varint; every official serializer writes it first). Heuristic, backed by the full scan.

### 8.2 Guarded execution
- The job runner spawns `parsing/worker.ts` (`worker_threads`, `resourceLimits.maxOldGenerationSizeMb = 512`) with a timeout of 30 s + 30 s per GiB, then `worker.terminate()`. Concurrency is 1 (freeride shares 15 GiB RAM and 20 threads with other services); the queue depth is exported as a metric.
- At boot, `processing` versions older than the worker timeout are re-queued (at-least-once; the job is idempotent because blob insertion is keyed by sha256).
- Failure codes (stable, user-facing copy in the SPA): `bad_header`, `truncated`, `bad_protobuf`, `bad_json`, `offsets_invalid`, `unsupported_dtype`, `limits_exceeded`, `external_data_unsupported`, `timeout`, `internal`.
- Limits (`parsing/limits.ts`): ≤ 200k nodes, ≤ 500k tensors, ≤ 16 dims, names ≤ 1 KiB, attribute lists summarized beyond 64 items, nested subgraphs counted only, safetensors JSON depth ≤ 4.

### 8.3 What is extracted

**ONNX** (D16: streaming wire scanner + `protobufjs` for small messages; `onnx.proto` vendored from a pinned ONNX release, Apache-2.0)
- Model: `ir_version`, `opset_import`, `producer_name/version`, `doc_string` (≤ 4 KiB), `metadata_props`.
- Graph inputs/outputs (minus initializers), dtype + shape (`number | symbolic string | null`), `value_info` shapes for intermediate edges.
- Initializers: name, dtype, dims, numel, byte size, **payload offset + length in the file** (for weight viz). `data_location = EXTERNAL` → `external_data_unsupported`.
- Nodes: id `n<index>`, name (synthesized `<opType>_<index>` when empty), op type, domain, inputs/outputs, attributes (scalars and lists rendered; TENSOR → dtype/shape; GRAPH → node count).
- Initializer inputs and `Constant` outputs fold into the consuming node as `params` with `paramCount`.
- Edges: producer (node or graph input) → each consumer (node or graph output), with tensor info when known.
- Group path: node names split on `/` and `.` boundaries (`/model/layers.3/self_attn/q_proj/MatMul` → `["model","layers.3","self_attn","q_proj"]`).
- Architecture strip (§9.1): op category per node in topological order, run-length encoded.

**safetensors**
- Header JSON per tensor `{ dtype, shape, data_offsets }` + `__metadata__` (values ≤ 1 KiB).
- Validation: known dtypes, `end - begin = numel × dtypeSize`, sorted non-overlapping offsets, `8 + N + max(end) = fileSize`.
- Module tree: split on `.`; numeric segments stay as levels; each module aggregates params, bytes, dtype breakdown.
- Architecture strip: module-level parameter share in name order.

### 8.4 JSON sent to the frontend (`@mieru/shared/parsed-model.ts`)

```ts
export const PARSER_VERSION = 1;

type Dim = number | string | null;
type DType = string;
interface TensorInfo { name: string; dtype: DType | null; shape: Dim[] | null; }

interface ModelSummary {
  format: 'onnx' | 'safetensors';
  fileSizeBytes: number;
  totalParams: number;
  tensorCount: number;
  nodeCount?: number;
  opsetVersion?: number;
  producer?: string;
  dtypeBreakdown: Record<DType, { params: number; bytes: number }>;
  strip: { category: string; weight: number }[];   // architecture strip, ≤ 512 segments
}

type AttrValue =
  | { kind: 'int' | 'float'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ints' | 'floats'; value: number[]; truncated: boolean }
  | { kind: 'strings'; value: string[]; truncated: boolean }
  | { kind: 'tensor'; dtype: DType; shape: number[] }
  | { kind: 'graph'; nodeCount: number };

interface OnnxNode {
  id: string; name: string; opType: string; domain: string;
  category: OpCategory;
  groupPath: string[];
  inputs: string[]; outputs: string[];
  params: TensorInfo[]; paramCount: number;
  attributes: Record<string, AttrValue>;
}
interface OnnxEdge { id: string; source: string; target: string; tensor: TensorInfo; } // "in:<name>" / "out:<name>" for graph IO

interface OnnxGraphPayload {
  kind: 'onnx-graph';
  inputs: TensorInfo[]; outputs: TensorInfo[];
  nodes: OnnxNode[]; edges: OnnxEdge[];
  metadata: Record<string, string>;
}

interface ModuleNode {
  path: string; name: string;
  children: ModuleNode[];
  tensors: { name: string; dtype: DType; shape: number[]; params: number; bytes: number }[];
  paramCount: number; byteSize: number;
}
interface SafetensorsTreePayload { kind: 'safetensors-tree'; root: ModuleNode; metadata: Record<string, string>; }

export interface ParsedModel { parserVersion: number; summary: ModelSummary; payload: OnnxGraphPayload | SafetensorsTreePayload; }
```
The zod mirror validates payloads at the SPA boundary. Tensor payload offsets are **not** sent to the client; they go to the stats sidecar.

### 8.5 Caching
- Sidecar `parsed/<blob_key>.v<PARSER_VERSION>.json.gz` (gzip 6) + summary columns on `blobs`. Forks and duplicate uploads share it.
- `GET /graph` streams it with `Content-Encoding: gzip`, `ETag "<blob_key>.v<N>"`, `Cache-Control: private, no-cache`; `If-None-Match` → `304`.
- Missing sidecar for the current version → enqueue a re-parse and return `409 not_ready { retryAfterSec }`; the SPA shows "Updating view…" and polls.
- P1 diff cache `parsed/diff-<fromBlob>-<toBlob>.v<N>.json.gz`.

**P1 `GraphDiff`**: match ONNX nodes by name (fallback op type + topological index), safetensors tensors by name; status `added | removed | changed (op/attrs/param shapes/dtypes) | unchanged`. Weight-value changes come from per-tensor hashes the scanner can compute while it already has the bytes streaming past (added in M7.2; bumps `PARSER_VERSION`).

### 8.6 Large graphs
- Fixed op-category palette (conv, matmul/gemm, normalization, activation, pooling, elementwise, shape/reshape/gather, attention/fused, control flow, other), colorblind-checked (§9.1).
- Grouping trie over `groupPath`; start at the shallowest depth with ≤ 300 visible items; expanding re-lays out only that compound node (ELK `INCLUDE_CHILDREN`); hard cap 1,500 visible nodes.
- No hierarchical names and > 300 nodes → topological blocks of ~50.
- elkjs in a Web Worker; React Flow `onlyRenderVisibleElements`, memoized nodes, minimap off above 1,000 nodes.
- Search pans and expands to matches.
- **Model Explorer**: purpose-built WebGL renderer for huge graphs and would beat React Flow beyond ~5k visible nodes. But it's an Angular-based component, and we'd still need React Flow for node comments and design mode. M3.7 measures a synthetic 10k-node transformer graph. If expand/pan interactions stay under ~100 ms at the cap, keep React Flow only; otherwise add Model Explorer's visualizer (Apache-2.0; verify current packaging then) as an alternate renderer above a node threshold, fed from the same payload.

---

## 9. Frontend

### 9.1 Design direction (from `frontend-design`; brand layer pending your skill)

**Subject, audience, job.** Subject: the inside of a neural network. Audience: ML engineers, researchers, and students who want to see a model's structure and show it to someone. Primary job: understand an architecture in seconds and pass it on.

**Concept: the light table.** The product UI is an instrument that recedes so the model can be seen, which is the literal meaning of the name. The graph canvas is the hero on every model page. The brand's Japanese-subculture personality (logo, mascot, display type, voice) goes where people aren't working: the landing page, empty states, loading and processing states, 404 and takedown pages, the profile header, and share-preview images. That split is what lets a playful brand and a dense technical tool live together.

**Signature element: the architecture strip.** Every model gets a thin horizontal band of op-category colors in topological order (from `summary.strip`). It appears in lists, on Explore, on profiles, in the model header, and in share previews. A ResNet and a transformer look different at a glance. It's the one bold device; everything around it stays quiet.

**Tokens (provisional; palette direction fixed in round 3: pastel pink + lavender, Y2K/heisei kirakira logo)**
| Token | Value | Use |
|---|---|---|
| `paper` | `#F6F7FA` | app background, canvas |
| `sumi` | `#1B1E2B` | text, strokes (blue-black ink) |
| `fog` | `#E3E6EE` | dividers, canvas dot grid |
| `slate` | `#5A6072` | secondary text |
| `sakura` | `#F9D7EA` | brand pastel pink: logo fill, brand surfaces, soft highlights |
| `lilac` | `#CDB9F7` | brand pastel lavender: logo shadow, selected rows, canvas selection halo |
| `signal` | `#C2408A` | deeper rose for primary actions, focus rings, links. The pastels fail text contrast on `paper`, so interactive color uses this shade (≥ 4.5:1) |
| `canvas-dark` | `#12141D` | dark-mode canvas (dark mode ships at launch; graph tools get used at night) |

- The op-category palette (10 hues) is a separate data palette built with the `dataviz` skill and validated for color-vision deficiency and for contrast on both `paper` and `canvas-dark`. It never reuses `signal`.
- The canvas background is a fine screentone dot grid (`fog` on `paper`), a quiet nod to manga print that doubles as a spatial reference while panning.

**Type (provisional)**: brand/display = the face chosen with the brand skill (it must cover Japanese; candidates like M PLUS 1 or Zen Kaku Gothic New get decided there). UI/body = **Pretendard** (Korean-first UI; covers Hangul and Latin; already used in your other React project), with tabular figures for parameter counts and sizes. The brand display face must cover Hangul too wherever it sets Korean headings. Tensor shapes and dtypes = IBM Plex Mono, because they're literal code tokens (`[1, 3, 224, 224]`, `float16`). Monospace stays out of ordinary labels. Scale: 13 / 14 / 16 / 20 / 28 / 40 px; UI runs at 14.

**Layout**

```
Model page (desktop)
┌───────────────────────────────────────────────────────────────────┐
│ mieru   resnet50-v2  by @kai   25.6M params · 98 MB · 176 nodes   │ ← one-row header
│ ▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░  [Share] [Download] [⋯] │ ← architecture strip
├────┬──────────────────────────────────────────────┬───────────────┤
│Grph│                                              │ Conv_23       │
│Stat│     canvas (screentone dots, full bleed)     │ Conv · ai.onnx│
│Info│                                              │ in  [1,64,56,56]
│Vers│                                              │ out [1,64,56,56]
│Demo│                                [search][fit] │ params 36,864 │
└────┴──────────────────────────────────────────────┴───────────────┘
 rail        canvas                                   inspector (closes)

Dashboard / Explore: a dense list, not a card grid
┌───────────────────────────────────────────────────────────────────┐
│ name                    owner     params   size    updated        │
│ ▓▒░▓▒░▓▒░▓▒░  resnet50-v2   @kai      25.6M    98 MB   2d         │
│ ▓▓▓░░░▓▓▓░░░  llama-tiny    @mio      110M     440 MB  5h         │
└───────────────────────────────────────────────────────────────────┘
```
- Left-aligned everywhere; numbers right-aligned in tables.
- No card grids, no gradient washes, no all-caps eyebrows, no decorative numbering.
- Motion: only for responses to actions. Group expand/collapse animates nodes from the group's position (shows what changed), and the inspector slides in. One orchestrated moment on the landing page belongs to the brand. `prefers-reduced-motion` disables all of it.
- Copy: plain, sentence case, names things the way users do ("Who can see this", "Anyone with the link", "Fork to my models"). Errors say what happened and what to do ("This file isn't valid ONNX: the graph ends early. Re-export it and upload again.").

**Self-review against defaults**: the first draft was a dark canvas with one neon accent and mono labels everywhere. That's a stock "dev tool" look, so it was changed to a light paper canvas with blue-black ink, dark mode as an option, mono reserved for tensor literals, and the color budget spent on the data palette and the architecture strip instead of chrome.

**Skill owners**: `frontend-design` (this direction) → your branding skill (logo, mascot, display face, voice, final tokens) → `dataviz` (op palette, charts) → `emil-design-eng` / `animate` (expand/collapse, inspector) → `better-interface` + `web-design-guidelines` before each UI milestone closes → `impeccable` + `kill-ai-slop` once per release.

### 9.2 Routes
| Route | Page |
|---|---|
| `/` | Landing (logged out, brand-led) / redirect to `/dashboard` |
| `/explore` | Public models: search, format filter, sort |
| `/u/:username` | Profile: public models |
| `/login`, `/signup` | Auth |
| `/auth/callback`, `/welcome` | OAuth landing; username pick for new OAuth users |
| `/dashboard` | My models · Shared with me (+ Workspaces in P1) |
| `/upload` | Resumable upload with progress, pause/resume, processing state |
| `/m/:modelId` | Model view (rail: Graph/Tree, Stats, Info; P1: Versions, Demo, Weights, comments panel) |
| `/s/:token` | Link entry: resolves, then renders the model view (token kept in memory as `X-Share-Link`, URL replaced with `/m/:id?via=link`) |
| `/settings/*` | Profile, login methods (password, OAuth), sessions, delete account |
| `/admin/reports` | Moderation queue (admins) |
| `/help/convert` | `.pt` → ONNX / safetensors guide |
| `*` | 404 (also for no-access models) |

### 9.3 Main components
- `AuthProvider` / `auth-store`, `api-client` (Bearer + `X-Share-Link`, refresh-retry, zod parsing), `upload.ts` (tus client with token refresh).
- `ModelHeader` + `ArchitectureStrip`, `OnnxGraphView` (`OpNode`, `GroupNode`, `IoNode`, legend, search, layout worker), `NodeInspector`, `SafetensorsTreeView` (virtualized), `StatsTab` (`ParamsPerLayerChart`, `OpTypeDistribution` / dtype breakdown).
- `ShareDialog` (general access, `PeoplePicker` with username search, per-person role + download, `ShareLinkManager`, public download toggle), `ForkButton`, `ReportDialog`.
- `ModelTable` (dashboard, Explore, profile), `RepoSizeMeter` (model Info tab and versions upload), `UploadPanel`, `ProcessingState`, `DeleteAccountFlow`, `ReportQueue`.

### 9.4 Share previews
Public models and links get Open Graph tags so chat apps show a preview. Fastify answers `GET /m/:id` and `/u/:username` for crawler user agents (and for everyone, cheaply) with the SPA `index.html` with `<meta>` tags injected (title, description, an OG image of the architecture strip + brand frame rendered as SVG → PNG with `@resvg/resvg-js`). Private and link-only models get a generic "mieru" preview and never leak names.

---

## 10. Milestones

Releases: **R1 Launch** = M0–M5 + M-B + M-R (P0 features plus the product essentials you asked for). **R2** = P1. **R3** = P2. Each task is one focused Conventional Commit with tests; AC = observable acceptance criterion.

### M0 — Foundations
| # | Task | AC |
|---|---|---|
| 0.1 | npm workspaces, TS base, ESLint, Prettier, `.nvmrc`, `.env.example`, root scripts | `npm run lint && npm run format:check && npm run typecheck` pass |
| 0.2 | `@mieru/shared` consumed by both apps | typecheck resolves imports from both |
| 0.3 | Server skeleton: `buildApp`, zod config (fails fast), pino with redaction (`authorization`, `cookie`, `x-share-link`, `ticket`, `upload-*` metadata), error shape, `/api/health` | unit: missing `JWT_SECRET` throws; inject `/api/health` → `200 { db: 'ok', storage: 'ok' }` |
| 0.4 | DB pool, `query`/`withTransaction`, LIMIT-as-string | integration: prepared SELECT + rollback |
| 0.5 | Migration runner (checksums, `GET_LOCK`) + `001_init.sql` | second run is a no-op; edited file → abort; two concurrent runs → one waits |
| 0.6 | Web skeleton: Vite, Router, Query, Tailwind, i18next, tokens file, Radix primitives restyled | `npm run build -w @mieru/web` succeeds; Playwright smoke loads `/` |
| 0.7 | Vitest workspace, Playwright config (headless), `paseo.json` scripts | `npm run test:unit` and `npm run test:e2e` run headless |
| 0.8 | Helmet headers, CSP for the SPA, `Referrer-Policy: no-referrer` | integration asserts headers |
| 0.9 | GitHub Actions CI (lint, typecheck, unit, integration with a MySQL 8.4 service) | workflow file passes `actionlint` locally if available; runs on the first push (you push) |

### M1 — Accounts and sessions
| # | Task | AC |
|---|---|---|
| 1.1 | Signup (username rules, reserved names, argon2id) | integration: 201 + cookie flags; taken username → 409 |
| 1.2 | Token service + `auth` plugin | expired/tampered JWT rejected; `/api/me` 401/200 |
| 1.3 | Login by email or username + backoff | 5 failures → 429 with `retryAfterSec`; success resets |
| 1.4 | Refresh rotation, grace window, reuse detection, `audit_events` | fake clock: replay after 10 s kills the family; within 10 s → `stale_refresh`, family intact |
| 1.5 | CSRF guard on cookie routes | bad/missing Origin → 403; `text/plain` → 415 |
| 1.6 | Logout, logout-all, sessions list/revoke | revoked family can't refresh |
| 1.8 | Rate-limit plugin per §6.10, real-IP extraction behind configured proxies | 11th login/min → 429; spoofed `X-Forwarded-For` ignored when hops = 0 |
| 1.9 | OAuth core + GitHub | MockAgent: bad state → `state_mismatch`; happy path creates user with `onboarded_at NULL`; token request carries `code_verifier` |
| 1.10 | Google (JWKS mock, nonce), link/unlink/reauth intents, onboarding endpoint | tests per rule incl. `already_linked`, `last_login_method`, reauth for another account rejected |
| 1.11 | Password set/change (recent auth), profile edit, username change cooldown | change revokes other sessions; second rename within 30 days → 409 |
| 1.12 | Account deletion service + endpoint | integration: user with models, a fork made by someone else, a comment-less share: after delete, models/rows gone, the other user's fork still downloads (same sha256), orphaned blobs unlinked, audit row has no PII |
| 1.13 | Web (Korean copy via i18next): AuthProvider, login/signup/callback/welcome, Settings (profile, login methods, sessions, delete account) | Playwright: signup → reload keeps session → logout → login → delete account → login fails |

### M2 — Upload, storage, processing
| # | Task | AC |
|---|---|---|
| 2.1 | `storage/paths.ts` (UUID-only keys, fixed areas `uploads`, `blobs`, `parsed`), dir creation with `0700` | `pathFor('blobs', '../x')` throws; every path stays under `STORAGE_DIR` |
| 2.2 | Fixture generator (tiny CNN/MLP ONNX, nested safetensors, malformed variants, a synthetic 10k-node ONNX, a > 100 MB safetensors made of zero pages written sparsely) | `npm run fixtures -w @mieru/server` is deterministic (same sha256 twice) |
| 2.3 | safetensors parser + tree + strip | valid fixture → expected totals; each malformed variant → its reason code |
| 2.4 | ONNX streaming wire scanner + protobufjs small-message decode, folding, edges, groups, strip, payload offsets | CNN fixture → expected counts and params; peak RSS while scanning the large fixture < 200 MB (measured in test); truncated → `truncated`; external data → `external_data_unsupported` |
| 2.5 | Worker runner (timeout, memory limit) + job runner (DB status, boot recovery, concurrency 1) | infinite-loop stub → `timeout`; killing the runner mid-job and restarting completes the job |
| 2.6 | tus endpoint (auth on every request, ownership, per-format + repository + free-space checks, 24 h expiry) | integration: chunked upload over 3 PATCHes completes; another user's HEAD → 404; ONNX declared at 2 GiB + 1 → 413 `file_too_large`; free space below reserve (stubbed `statfs`) → 507 |
| 2.7 | `POST /api/models` → 202, processing pipeline with dedup | integration: upload → poll until `ready` → blob + sidecar exist; uploading the same bytes again creates no new blob file; garbage `.onnx` → version `failed` with `bad_protobuf`, no files left |
| 2.8 | `GET /models/:id`, `GET /graph` (gzip passthrough, ETag, `not_ready`, lazy re-parse) | 304 on revalidation; deleted sidecar → 409 then ready after the job |
| 2.9 | File tickets + streaming download with single `Range` | sha256 of downloaded bytes = original; `Range: bytes=100-199` → 206 with 100 bytes; expired ticket → 401 |
| 2.10 | Delete model (rows → blobs with zero refs) + PATCH metadata | delete with a fork sharing the blob keeps the file; deleting both removes it |
| 2.11 | `storage:gc` (dry-run default; unreferenced blobs and sidecars older than 1 h, expired uploads, stale parser versions) | planted orphan listed in dry-run, removed with `--apply`, referenced files untouched |

### M3 — Visualization
| # | Task | AC |
|---|---|---|
| 3.1 | Model page shell, `ModelHeader`, `ArchitectureStrip`, Info tab, processing/failed states | Playwright: CNN fixture header shows the right params/nodes; failed upload shows its reason copy |
| 3.2 | `SafetensorsTreeView` | Playwright: expected tree, keyboard expand/collapse |
| 3.3 | Op palette (via `dataviz` skill, CVD-checked) + `OnnxGraphView` + ELK worker | Playwright: N `op-node`s; Conv carries the conv category |
| 3.4 | `NodeInspector` | clicking Conv shows `kernel_shape`, IO shapes, params |
| 3.5 | Grouping/LOD, expand/collapse animation, no-name chunking, search | unit: 2,000-node graph → ≤ 300 visible; Playwright: expand increases visible count; search focuses a match |
| 3.6 | Stats tab | unit aggregations; Playwright bar counts |
| 3.7 | Perf spike on the 10k-node fixture | report: first render, expand latency, memory; renderer go/no-go |
| 3.8 | Upload UI (tus progress, pause/resume, processing poll), dashboard My models | Playwright: upload → progress → lands on the model when ready; dashboard lists it with its strip |
| 3.9 | Dark mode | Playwright screenshot comparisons for light/dark model page (headless, stored baselines) |

### M4 — Sharing, forks, discovery
| # | Task | AC |
|---|---|---|
| 4.1 | `combineGrants` + `resolveModelAccess` | table test covering every §7.3 row incl. takedown and anonymous editor-link cap |
| 4.2 | `requireModelAccess` gate + boot route walk | non-shared user gets 404 on every model route (parametrized); boot fails on an ungated test route |
| 4.3 | People shares by username (+ allow_download), general access PATCH | viewer: graph 200, PATCH 403; `allow_download=0` → ticket 403; set Private → 404; back to Specific people → restored |
| 4.4 | Share links (hash + ciphertext, editor role, expiry, revoke) + resolve + `link_visits` | anonymous editor link → viewer; logged-in editor link → PATCH works; after visit, access without header; revoke → 404 for visitors |
| 4.5 | Public visibility + `public_allow_download`, profiles, Explore + FULLTEXT search | anonymous GET of public model 200; Explore `q=resnet` finds it; private model never appears |
| 4.6 | Forks | fork completes without new blob; source deleted → fork intact with `forkedFrom: null`; no download right → 403 |
| 4.7 | "Shared with me" + list/resolver matrix test | matrix test passes |
| 4.8 | Web: `ShareDialog`, `/s/:token`, Explore, profile, fork button, Shared with me | Playwright: owner shares to @bob as commenter without download → Bob sees it, no download button; editor link opened logged-out shows viewer UI; fork lands in My models with attribution |
| 4.9 | OG previews (§9.4) | integration: public model page HTML has `og:title` = model name; private model returns the generic tags |

### M5 — Moderation and safety
| # | Task | AC |
|---|---|---|
| 5.1 | Reports API + rate limit; admin role + `admin` CLI (`npm run admin -w @mieru/server -- grant <username>`) | report creates a row; non-admin → 403 on admin routes |
| 5.2 | Takedown/restore + resolver integration | taken-down model: owner sees the notice, others 404, links/shares/downloads stop, Explore excludes it |
| 5.3 | Admin UI (`/admin/reports`) | Playwright: admin dismisses and takes down from the queue |
| 5.4 | Security review pass (authz per route, upload limits, headers, redaction, cookie flags, CSP) | checklist in the report, each item linked to a test |

### M-B — Brand (logo direction: `docs/brand/drafts/logo3-star-*`)
| # | Task | AC |
|---|---|---|
| B.1 | Turn the chosen draft into a brand: logo/wordmark redrawn as SVG (generated images only set the direction), mascot or motif, display face, voice, final tokens (replacing §9.1's provisional values) | brand sheet committed under `docs/brand/`; `tokens.css` updated; contrast checks pass (`better-colors`) |
| B.2 | Apply to landing, empty/loading/processing states, 404/takedown, profile header, OG image frame, favicon/app icons | Playwright screenshots of each surface; `better-interface` review findings resolved |
| B.3 | Release polish: `impeccable`, `kill-ai-slop` | findings list addressed or explicitly waived in the report |

### M-R — Release
| # | Task | AC |
|---|---|---|
| R.1 | Dockerfile (multi-stage, non-root, healthcheck), `.dockerignore` | image build is run on freeride by Dokploy (not on this Mac); the build log is attached to the report |
| R.2 | `docs/deploy.md`: Dokploy app + MySQL setup, env list, bind mount and ownership, resource limits, proxy chain and `TRUST_PROXY`, domain + OAuth redirect URIs | following the doc on freeride gives a healthy `/api/health` over the public domain (with your approval to deploy) |
| R.3 | Backups (Dokploy scheduled `mysqldump` + blob rsync) and `docs/runbook.md` (restore, gc, takedown, rotating secrets) | a restore drill into a scratch DB succeeds and is recorded |
| R.4 | `/api/health/deep` (disk reserve, stuck jobs, backup age) + Uptime Kuma monitor setup in `docs/deploy.md` | integration: stubbed low disk → 503 with `{ disk: 'low' }`; liveness stays 200 |
| R.5 | Full e2e suite green; production build | `npm run test:e2e` and `npm run build` pass |

### R2 (P1)
| # | Task | AC |
|---|---|---|
| M6 Comments | 002 migration, API, inspector thread, node badges, "Deleted user" rendering | viewer POST 403, commenter 201; badge survives reload |
| M7.1 Versions | tus → `POST /versions` (same format), switcher, delete version, repository size meter | v2 increments; `?version=1` still serves v1 graph; a version that would push the repo past 10 GiB → 413 `repository_full` at upload creation |
| M7.2 Diff | per-tensor hashing (parser v2), `GraphDiff`, diff coloring | changed-kernel fixture → exactly one `changed` node |
| M8 Workspaces | 003 migration, CRUD, members, move, resolver rows, sole-owner deletion guard | resolver table + list matrix still pass |
| M8.1 Stars | 004 migration, star button, Explore `sort=stars` | star count updates; sort order correct |
| M9.1 Demo infra | lazy `onnxruntime-web`, bytes via ticket (Range-chunked fetch with progress), COOP/COEP `credentialless` on the demo route, WebGPU with WASM fallback | Playwright: MLP fixture output equals precomputed values (WASM, headless) |
| M9.2 Inputs | shape-based picker: `[1,3,H,W]` image (resize, normalize presets), `[1,N]` numeric form/CSV | unit mapping; Playwright CSV run |
| M9.3 Outputs | `labels.json`, Top-5 bars, raw values fallback | CNN + labels shows 5 bars |
| M10 Weights | `/tensors/stats` (F32/F16/BF16 from recorded offsets, sidecar cache), histograms, filter grid (download-gated) | known-tensor histogram; filter grid tile count = out channels |

### R3 (P2)
| # | Task | AC |
|---|---|---|
| M11 Feature maps | server-side ONNX rewrite exposing intermediates (needs dtype from `value_info`; others listed as unavailable), download-gated derived file, activation thumbnails on nodes during a demo run | rewritten fixture returns extra outputs in ORT-web; thumbnails appear on Conv nodes |
| M12 Design mode | 005 migration, block palette on React Flow, TS shape inference with inline errors, PyTorch `nn.Sequential` export, save/share/fork through the same resolver | shape-inference table tests; exported code snapshot; Playwright flags then clears a bad `in_features` |

---

## 11. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest `unit` | parsers (valid, malformed, seeded byte-flip fuzz, limits, memory), grouping/LOD, palette mapping, stats, `combineGrants`, tokens, path builder, config, username rules |
| Integration | Vitest `integration` + `app.inject()` + MySQL 8.4 (`mieru_test`) + temp `STORAGE_DIR` | every route; tus flows; job runner recovery; rate limits with an injected clock; OAuth via undici `MockAgent`; account deletion; list/resolver matrix |
| E2E | Playwright (chromium, headless) against Paseo `server` + `web` scripts | the journeys in §10 ACs; anonymous visitors use `browser.newContext()`; visual baselines for light/dark |

Rules: injected clock for expiry/lockout/grace tests; fixtures generated by script (no network); `globalSetup` recreates the test schema and runs migrations; tables truncated per test file; integration project runs with `fileParallelism: false`. No watch modes, nothing headed.

---

## 12. Verification

### 12.1 One-time environment setup on m4pro (approved by your answer 2; heavy, run once)
```bash
brew install mysql@8.4
brew services start mysql@8.4          # background service, bound to 127.0.0.1
mysql -uroot -e "CREATE DATABASE mieru_dev; CREATE DATABASE mieru_test; \
  CREATE USER 'mieru'@'localhost' IDENTIFIED BY '<from .env>'; \
  GRANT ALL ON mieru_dev.* TO 'mieru'@'localhost'; GRANT ALL ON mieru_test.* TO 'mieru'@'localhost';"
npm ci
npx -w @mieru/web playwright install chromium   # headless shell, ~150 MB
```

### 12.2 Checks (non-interactive, headless)
```bash
npm run lint
npm run format:check
npm run typecheck
npm run fixtures -w @mieru/server
npm run test:unit
TEST_DATABASE_URL='mysql://mieru:***@127.0.0.1:3306/mieru_test' npm run test:integration
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate -w @mieru/server   # twice; second prints "no pending migrations"

paseo script start server
paseo script start web
npm run test:e2e                                   # Playwright headless, baseURL from $PASEO_PORT
paseo script stop web
paseo script stop server

STORAGE_DIR=/tmp/mieru-verify npm run storage:gc -w @mieru/server -- --dry-run
npm run build                                      # moderate CPU, ~1 min
```

### 12.3 Needs manual check
- Real GitHub/Google OAuth round trips with registered apps (mocked in tests).
- Deployment on freeride via Dokploy at `mieru.byeolki.me`, the Cloudflare → Traefik → app proxy chain, a 1+ GiB upload over the public domain, and the Uptime Kuma monitor.
- WebGPU demo backend (headless runs WASM).
- Graph layout quality on real models (ResNet-50, BERT-base, a small LLM export).
- Brand surfaces against the branding skill's intent.

---

## 13. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Hand-written ONNX wire scanner has bugs | Small surface (varint, length-delimited skip, a handful of field numbers); cross-checked in tests against a full `protobufjs` decode of every small fixture; fuzzed |
| R2 | React Flow too slow on huge graphs | LOD caps visible nodes; M3.7 spike decides on the Model Explorer fallback |
| R3 | GitHub PKCE support must be confirmed at implementation time | `code_challenge` sent anyway; client secret + state keep it secure if ignored |
| R4 | freeride shares 15 GiB RAM with many services; multi-GiB hash + parse plus Node heap | Concurrency 1, streaming everything (memory use doesn't grow with file size), container memory limit 2 GiB, job duration + peak RSS logged per job |
| R5 | Cloudflare limits (100 MB bodies, 100 s timeouts) and caching | tus 50 MiB chunks, async processing, `no-store` on `/api`, downloads streamed (verify CF doesn't buffer large downloads in R.2) |
| R6 | Disk fills (`/data` holds other projects' data too, and there's no per-user total) | Free-space reserve check at upload creation, `/api/health/deep` → Uptime Kuma alert, upload-creation rate limit, dedup, gc. Admins can take down abusive accounts' models |
| R7 | Public content brings abuse (malware-laden files, copyright) | Files are never executed server-side; downloads are `attachment` + `nosniff`; reports + takedown |
| R8 | Signup reveals taken emails | Rate limit; emails aren't public or authoritative here |
| R9 | Forgotten passwords are unrecoverable for password-only users | Accepted (round 2); signup copy + Settings hint push linking GitHub/Google |
| R10 | ORT-web threading needs COOP/COEP, which interferes with cross-origin avatars | `credentialless` COEP on the demo route only, or proxy avatars |
| R11 | Username squatting/impersonation | Reserved list, 30-day hold after rename/deletion, takedown applies to profiles too if needed |
| R12 | In-memory rate limits and job queue reset on deploy | Single instance; jobs persist in DB and resume; rate-limit reset on deploy is acceptable |
| R13 | Brand skill arrives late | M-B is isolated; provisional tokens keep the UI shippable for internal testing |

---

## 14. Open questions for the user

Each is worded so "yes" accepts the recommendation.

1. **Branding**: confirm the final logo draft in `docs/brand/drafts/logo3-star-*` (derived from `logo2-a2`: italic pastel-pink `mieru` with lavender offset shadow, the four-point star as the dot of the i, orbit swoosh, hiragana `みえる`; no other sparkles, no eye). Recommended pick: `logo3-star-2` (closest to the original swoosh and shadow). M-B redraws it as SVG with real lettering.
