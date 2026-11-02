# mieru — product implementation plan

Status: draft v5, revised after review round 4. Ready for approval.
Date: 2026-11-02
Production URL: https://mieru.byeolki.me

**mieru** (見える, "visible") is a web service for **model repositories**. Each repository holds a neural-network model file, a README, and an issues channel. People can explore the model visually, star it, and share it with fine-grained access control. Auth and sharing are the core of the product; visualization is why people come.

This is a product plan, not an MVP plan. Release 1 should feel finished: secure accounts, account deletion, READMEs, issues, stars, a discovery page with trending models, moderation, backups, health monitoring, and a real brand. It's a personal project built to product quality, not a commercial service, so legal and compliance work (terms, privacy policy, cookie banners) is out of scope. The brief's P0/P1/P2 priorities decide the **order** of work, not the quality bar.

---

## 0. Decisions

### 0.1 Review history

| Round | Decisions |
|---|---|
| 1 | Deploy on freeride with Dokploy. MySQL on m4pro for dev/tests. No email at all. Name **mieru**, Japanese-subculture branding. Per-person download setting. Public visibility in scope. Links can grant editor (anonymous = viewer). npm workspaces. Design via skills. Account deletion |
| 2 | **10 GiB per repository** (no per-user total). No password recovery. Domain `mieru.byeolki.me` via Dokploy + Cloudflare. Same-machine backups accepted. No legal pages. **Korean UI first.** Monitoring = existing Uptime Kuma/Dozzle (no Prometheus). Anonymous reports OK |
| 3 | Public models: owner picks **downloadable (default)** or **view only**. Logo confirmed (`docs/brand/logo-final.jpg`); primary colors sampled from it |
| 4 | **Forks removed.** **README** uploaded with the model and editable. **Issues channel** per repository (bug / question / feedback). **Comments and the commenter role removed:** roles are viewer and editor (+ owner). **Stars.** **Explore shows trending models** without searching. **Email + password accounts only** (no GitHub/Google) |

### 0.2 Decision log (self-grill)

| # | Decision | Answer | Why | Confidence |
|---|---|---|---|---|
| D1 | Frontend | Vite + React 19 + TypeScript strict SPA | Brief requires a React SPA; share previews only need server-injected `<meta>` tags (§9.5) | high |
| D2 | Backend | Fastify 5 + TypeScript | TS-first, zod type provider, `app.inject()` for tests, official plugins for cookies, rate limits, helmet, static files | high |
| D3 | Monorepo | npm workspaces: `apps/web`, `apps/server`, `packages/shared` | Your choice; three packages don't need a task runner | high |
| D4 | Contracts | zod schemas in `@mieru/shared` for server routes and client parsing | One source of truth | high |
| D5 | DB access | `mysql2/promise`, `execute()` only, `query()`/`withTransaction()` helpers, per-feature repositories | Given | high |
| D6 | IDs | `CHAR(36) ascii` UUIDv7 generated in the app; issues also get a per-repository `number` (#1, #2…) | Non-enumerable URLs; human-friendly issue references | high |
| D7 | Tokens | Access JWT (10 min) in memory; refresh token in an `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` cookie, hashed, rotated, reuse-detected | XSS can't read tokens; CSRF only matters for two guarded cookie routes (§6.6) | high |
| D8 | Origin | One origin: Fastify serves the SPA build and `/api` from one container | SameSite=Strict works, no CORS, one Dokploy service | high |
| D9 | Accounts | **Email + password only.** Signup asks for email and password; a `username` handle is generated from the email (editable later) | Your answer (round 4). Sharing and profiles still need a public handle that isn't the email | high |
| D10 | Password hashing | argon2id (m=19 MiB, t=2, p=1) | OWASP baseline | high |
| D11 | Recovery | None. A forgotten password means a lost account; signup says so | Your answers (rounds 2 and 4) | high |
| D12 | Sharing target | Username, chosen from a search picker showing display name + avatar | Emails are unverified, so sharing by email would let someone pre-register a victim's address | high |
| D13 | Uploads | tus resumable uploads (`@tus/server` + `@tus/file-store`, `tus-js-client`), 50 MiB chunks, Bearer auth per chunk, limits checked from `Upload-Length` | Cloudflare's 100 MB body cap; multi-GiB files need resume. Still streamed to disk, UUID names, size-limited | medium |
| D14 | Processing | Async: `POST /api/models` → `202`; in-process job runner (DB status, concurrency 1, resumes at boot) hashes, dedupes, parses in a `worker_threads` worker with timeout + memory limits | Cloudflare's 100 s timeout | high |
| D15 | ONNX parsing | Streaming protobuf wire scanner over a file handle for container messages; `protobufjs` for small messages; tensor payloads skipped with offsets recorded | 2 GiB files in a 2 GiB container on a shared 15 GiB host | medium |
| D16 | Storage dedup | Content-addressed `blobs` (unique sha256); `model_files` reference blobs; file deleted when the last reference goes | Re-uploads and P1 versions with identical files cost no disk; parse once per content | medium |
| D17 | Parsed cache | Gzipped sidecar `parsed/<blob_key>.v<N>.json.gz` + summary columns | Large JSON stays out of MySQL; lazy re-parse on parser upgrades | high |
| D18 | README | Repository-level Markdown in `models.readme_md` (≤ 256 KiB), set at creation (upload a `README.md` or write it) and editable by editors; not versioned per model version | Like a GitHub repo README; versioning it adds little for model cards | medium |
| D19 | Markdown rendering | One shared `Markdown` component: `react-markdown` + `remark-gfm`, **raw HTML skipped**, links `rel="nofollow ugc noopener"`, images only over `https:` with `referrerpolicy="no-referrer"`, code highlighting lazy-loaded | Same renderer for README, issues, and replies; no HTML injection path | high |
| D20 | Issues | Per-repository issues with kind (bug / question / feedback), state (open / closed), optional link to a graph node or tensor, replies, lock. Any **logged-in viewer** can open issues and reply; editors moderate | Your answer (round 4); replaces node comments and the commenter role | high |
| D21 | Issue notifications | No email or push. Dashboard "Activity" lists issues on repositories you own/edit and issues you opened or replied to, with unread markers (`issue_reads`) | Without it, owners would never notice new issues | medium |
| D22 | Stars | `stars` table + denormalized `models.star_count` updated in the same transaction; nightly reconcile | Sorting Explore by stars must stay cheap | high |
| D23 | Trending | Score from stars, unique views, and issues opened over 7 days with exponential decay (half-life ≈ 33 h), recomputed every 15 min into `model_trending`; only public, ready, not-taken-down models | Explore needs something to show without a search box; computable in SQL on this scale | medium |
| D24 | View counting | `model_view_days(model_id, day, viewer_hash)` with `INSERT IGNORE`; `viewer_hash` = truncated SHA-256 of (user id or IP + UA, daily salt); rows older than 30 days purged | Unique daily views without storing raw IPs or tracking people across days | medium |
| D25 | Roles | viewer / editor / owner (no commenter) | Your answer (round 4) | high |
| D26 | Graph renderer | React Flow + elkjs (Web Worker) + prefix collapsing; measured spike vs Model Explorer | Compound layout for groups; reusable for P2 design mode | medium |
| D27 | UI stack | Tailwind v4 + Radix primitives (shadcn/ui restyled), TanStack Query, React Router v7, Recharts, i18next (Korean first) | Accessible primitives; tokens from §9.1 | medium |
| D28 | Access check | Single resolver `resolveModelAccess` + one Fastify gate; boot fails if a model route lacks it | Brief: enforced in one place | high |
| D29 | No-access response | `404` without a role; `403` with a role that's too low | Doesn't leak existence | high |
| D30 | Downloads | `POST /file-ticket` → 60 s signed URL → `GET /file?ticket=` with single-range `Range` | `<a href>` can't send headers; large downloads need resume | high |
| D31 | Link tokens | SHA-256 for lookup + AES-256-GCM ciphertext so the owner can copy links again | Drive-like UX; a DB leak alone doesn't expose links | medium |
| D32 | Demo gate (P1) | Requires `canDownload` and file ≤ 512 MiB | The browser must receive the bytes | high |
| D33 | Weight viz gate (P1) | Histograms: any viewer. Filter images: `canDownload` | Filter images are the raw weights | medium |
| D34 | Deletion order | DB transaction first, then file unlinks; `storage:gc` sweeps leftovers | Orphan files are harmless; dangling rows aren't | high |
| D35 | Migrations | Forward-only numbered `.sql`, checksums, `GET_LOCK`, run at container start | Rolling updates can overlap two containers briefly | high |
| D36 | Repository size | 10 GiB per repository; per file ONNX ≤ 2 GiB, safetensors ≤ 10 GiB; server free-space reserve | Your answer (round 2) | high |
| D37 | Public downloads | Owner picks downloadable (default) or view only when going public | Your answer (round 3) | high |
| D38 | Search | MySQL `FULLTEXT ... WITH PARSER ngram` on name + description + README | No extra service; ngram handles Korean/Japanese | medium |
| D39 | Tests | Vitest (unit + integration with real MySQL), Playwright headless | Your testing policy | high |

---

## 1. Goals and non-goals

### Goals
1. Accounts: sign up with email + password; safe sessions; self-service deletion.
2. Repositories: upload `.onnx` (≤ 2 GiB) or `.safetensors` (≤ 10 GiB) with a README, resumable, up to 10 GiB per repository.
3. Visualize: ONNX computation graph (op colors, inspector, collapsible blocks, search), safetensors module tree, summary header, Stats tab.
4. Share: private / specific people / anyone with the link / public; viewer / editor; expiring links; download settings.
5. Community: issues (bug / question / feedback) with replies, and stars.
6. Discover: Explore with trending, new, and most-starred sections plus search; user profiles; reporting and admin takedown.
7. Run on freeride via Dokploy at `mieru.byeolki.me` with backups, health checks, and logs.
8. Then P1 (versions + diff, workspaces, in-browser demo, weight viz) and P2 (feature maps, design mode).

### Non-goals
- `.pt` / `.pth` / `.bin` / pickle / `.h5` / TFLite / GGUF (`.pt` gets a conversion guide).
- ONNX external data (> 2 GiB models).
- Server-side inference or shape inference.
- Social login (GitHub/Google), outgoing email, password recovery.
- Forks, comments, discussions outside issues.
- Legal/compliance pages.
- Object storage, multi-server, horizontal scaling, billing, native apps.

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
      JOB["job runner\n(parse jobs, trending every 15 min,\nnightly cleanup)"]
      W["parser worker\n(worker_threads)"]
    end
    DB[("Dokploy MySQL 8.4")]
    FS[("/data/projects/mieru/storage\nuploads/ blobs/ parsed/")]
  end

  SPA --> CF --> TR --> API
  API --> DB
  TUS --> FS
  JOB --> W --> FS
  JOB --> DB
  API -- "stream download" --> FS
```

### 2.2 Create a repository: upload → processing → render
1. The upload page collects the model file, an optional `README.md` file (or text typed into the editor, prefilled with a template), name, description, and visibility.
2. The SPA creates a tus upload: `POST /api/uploads` with `Upload-Length` and metadata `{ filename }`. The server checks auth, extension, per-format file limit, repository limit (P1 versions), and the free-space reserve, then creates `uploads/<uuid>`.
3. The SPA sends 50 MiB `PATCH` chunks; retries resume from `HEAD`'s `Upload-Offset`.
4. When complete: `POST /api/models { uploadId, name, description?, readme?, license?, visibility? }`. The server checks upload ownership, completion, and magic bytes, creates `models` + `model_versions(status='processing')`, and returns `202`.
5. The job runner stream-hashes the file. If a blob with that hash exists, it reuses the blob and its parse; otherwise it runs the parser worker (timeout 30 s + 30 s/GiB), writes the sidecar, renames into `blobs/<uuid>`, inserts `blobs` + `model_files`, marks the version `ready`, and sets `current_version_id`. On failure the version becomes `failed` with a reason code and files are cleaned.
6. The SPA polls `GET /api/models/:id` every 2 s while `processing`; the README is visible right away, and the graph appears when ready.

### 2.3 Background jobs (in-process scheduler, single instance)
| Job | Schedule | Work |
|---|---|---|
| `process-version` | queue (DB status) | §2.2 step 5 |
| `trending` | every 15 min | recompute `model_trending` (§8.7) |
| `cleanup` | nightly 04:00 KST | purge `model_view_days` > 30 d, expired uploads/tickets, reconcile `star_count`, delete expired refresh tokens |
| `storage-gc` | nightly 04:30 KST | same as `npm run storage:gc -- --apply` with a 1 h safety window |

Each job takes a MySQL `GET_LOCK` so an overlapping container during a rolling deploy can't run it twice.

### 2.4 Deployment (Dokploy on freeride)
- **Image**: multi-stage `Dockerfile` (`node:22-bookworm-slim`), non-root `mieru` user with a fixed UID.
- **Dokploy Application** `mieru-app`: auto-deploy from GitHub `main`, one replica, 2 GiB memory, 4 CPUs, health check `GET /api/health`, bind mount `/data/projects/mieru/storage:/var/lib/mieru/storage`, env vars in Dokploy only.
- **Dokploy MySQL** `mieru-db`: MySQL 8.4, 1 GiB memory, `innodb_buffer_pool_size=512M`, internal network only.
- **Entrypoint**: `node dist/scripts/migrate.js && node dist/server.js`.
- **Domain**: `mieru.byeolki.me` on the Dokploy app, exposed through Cloudflare; `APP_ORIGIN=https://mieru.byeolki.me`.
- **Network path**: Cloudflare → `cloudflared` → Traefik → app. `TRUST_PROXY` hops and `CF-Connecting-IP` are verified in M-R.2. `/api` responses send `Cache-Control: private, no-store` unless stated otherwise.
- **Backups**: daily `mysqldump --single-transaction` (keep 14) + `rsync` of `storage/blobs` into `/data/backups/mieru` as Dokploy scheduled tasks. Accepted risk: same NVMe as live data, so it protects against mistakes, not drive failure. Restore drill in M-R.
- **Observability**: pino JSON logs (Dozzle / Dokploy), `GET /api/health` (liveness for Docker), `GET /api/health/deep` (`503` on low disk, stuck jobs, stale backups or trending older than 1 h) watched by an Uptime Kuma monitor.

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
│  │  │  │  ├─ auth/                # signup, login, sessions, tokens
│  │  │  │  ├─ users/               # profile, settings, username, account deletion
│  │  │  │  ├─ uploads/             # tus wiring, size limits
│  │  │  │  ├─ models/              # routes, service, repo, readme, download
│  │  │  │  ├─ sharing/             # access-service.ts (THE resolver), shares, links
│  │  │  │  ├─ issues/              # issues, replies, reads, activity feed
│  │  │  │  ├─ stars/
│  │  │  │  ├─ explore/             # sections, search, trending, view counting
│  │  │  │  ├─ moderation/          # reports, takedowns, admin routes
│  │  │  │  ├─ workspaces/ demo/ weights/   # P1
│  │  │  ├─ jobs/                   # scheduler.ts, process-version.ts, trending.ts, cleanup.ts
│  │  │  ├─ parsing/                # worker.ts, run-parser.ts, onnx/, safetensors/, limits.ts
│  │  │  ├─ storage/                # paths.ts (UUID-only), blobs.ts, disk.ts
│  │  │  └─ observability/          # health.ts
│  │  └─ test/
│  └─ web/                          # @mieru/web
│     ├─ src/
│     │  ├─ main.tsx  router.tsx  i18n/ (ko first)
│     │  ├─ lib/                    # api-client.ts, auth-store.ts, query-client.ts, upload.ts
│     │  ├─ design/                 # tokens.css, Radix-based primitives, Markdown component
│     │  └─ features/               # auth, dashboard, explore, profile, upload, repo (overview, graph, stats, issues), sharing, settings, admin
│     ├─ e2e/
│     └─ playwright.config.ts
├─ packages/shared/                 # @mieru/shared: zod schemas, DTOs, ParsedModel, roles
├─ docs/plans/  docs/deploy.md  docs/runbook.md  docs/brand/
├─ Dockerfile  .dockerignore  paseo.json  package.json
├─ tsconfig.base.json  eslint.config.js  .prettierrc  vitest.workspace.ts
├─ .github/workflows/ci.yml
└─ .env.example
```

**Tooling**: Node 22 LTS, npm 10 workspaces, TypeScript 5 strict + `noUncheckedIndexedAccess`, ESM, ESLint flat config (`typescript-eslint` strict-type-checked, `react-hooks`, `jsx-a11y`), Prettier, Vitest, Playwright. Dev servers only via Paseo scripts.

**Root scripts**: `lint`, `format:check`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `build`; workspace scripts `db:migrate`, `storage:gc`, `fixtures`, `admin`.

**Key dependencies**
- server: `fastify`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/static`, `fastify-type-provider-zod`, `@tus/server`, `@tus/file-store`, `mysql2`, `argon2`, `jose`, `protobufjs` (+ `protobufjs-cli`), `pino`, `uuid`, `@resvg/resvg-js` (OG images).
- web: `react`, `react-router`, `@tanstack/react-query`, `@tanstack/react-virtual`, `@xyflow/react`, `elkjs`, `recharts`, `tus-js-client`, `i18next` + `react-i18next`, `react-markdown` + `remark-gfm` (+ lazy `rehype-highlight`), Radix primitives, `tailwindcss`, `zod`. P1: `onnxruntime-web`.

---

## 4. MySQL schema

MySQL 8.4 LTS, `utf8mb4_0900_ai_ci`, `DATETIME(3)` UTC (pool `timezone: 'Z'`). App pool `multipleStatements: false`; the migration runner uses its own connection.

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
  id                    CHAR(36) CHARACTER SET ascii NOT NULL,
  email                 VARCHAR(320) NOT NULL,
  email_normalized      VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,     -- trimmed + lowercased; login identifier
  password_hash         VARCHAR(255) NOT NULL,
  username              VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL, -- public handle, generated at signup
  username_changed_at   DATETIME(3) NULL,
  display_name          VARCHAR(100) NOT NULL,
  bio                   VARCHAR(300) NULL,
  avatar_key            CHAR(36) CHARACTER SET ascii NULL,              -- uploaded avatar under blobs/ (P1); NULL = generated avatar
  role                  ENUM('user','admin') NOT NULL DEFAULT 'user',
  failed_login_count    INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME(3) NULL,
  password_changed_at   DATETIME(3) NULL,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email_normalized (email_normalized),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Usernames freed by renames or deletions stay reserved for 30 days (anti-impersonation).
CREATE TABLE released_usernames (
  username     VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  released_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (username)
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

CREATE TABLE blobs (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  storage_key     CHAR(36) CHARACTER SET ascii NOT NULL,
  sha256          BINARY(32) NOT NULL,
  size_bytes      BIGINT UNSIGNED NOT NULL,
  format          ENUM('onnx','safetensors','labels_json') NOT NULL,
  parser_version  SMALLINT UNSIGNED NULL,
  total_params    BIGINT UNSIGNED NULL,
  node_count      INT UNSIGNED NULL,
  tensor_count    INT UNSIGNED NULL,
  summary         JSON NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_blobs_storage_key (storage_key),
  UNIQUE KEY uq_blobs_sha256 (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A model repository.
CREATE TABLE models (
  id                     CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_id               CHAR(36) CHARACTER SET ascii NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  description            VARCHAR(500) NULL,
  readme_md              MEDIUMTEXT NULL,                       -- ≤ 256 KiB enforced in the service
  readme_updated_at      DATETIME(3) NULL,
  readme_updated_by      CHAR(36) CHARACTER SET ascii NULL,
  license                VARCHAR(64) CHARACTER SET ascii NULL,  -- SPDX id
  visibility             ENUM('private','users','link','public') NOT NULL DEFAULT 'private',
  public_allow_download  TINYINT(1) NOT NULL DEFAULT 1,         -- only consulted when visibility = 'public'
  current_version_id     CHAR(36) CHARACTER SET ascii NULL,
  star_count             INT UNSIGNED NOT NULL DEFAULT 0,       -- updated with stars in one transaction
  open_issue_count       INT UNSIGNED NOT NULL DEFAULT 0,
  next_issue_number      INT UNSIGNED NOT NULL DEFAULT 1,
  published_at           DATETIME(3) NULL,                      -- first time it became public (Explore "new")
  taken_down_at          DATETIME(3) NULL,
  taken_down_reason      VARCHAR(500) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_models_owner_updated (owner_id, updated_at),
  KEY ix_models_public_published (visibility, taken_down_at, published_at),
  KEY ix_models_public_stars (visibility, taken_down_at, star_count),
  FULLTEXT KEY ft_models_search (name, description, readme_md) WITH PARSER ngram,
  CONSTRAINT fk_models_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_models_readme_editor FOREIGN KEY (readme_updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_versions (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  version_number  INT UNSIGNED NOT NULL,
  status          ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
  failure_reason  VARCHAR(64) CHARACTER SET ascii NULL,
  upload_id       CHAR(36) CHARACTER SET ascii NULL,
  original_name   VARCHAR(255) NOT NULL,
  note            VARCHAR(500) NULL,
  created_by      CHAR(36) CHARACTER SET ascii NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_versions_model_number (model_id, version_number),
  KEY ix_versions_status (status, created_at),
  CONSTRAINT fk_versions_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_versions_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE models
  ADD CONSTRAINT fk_models_current_version FOREIGN KEY (current_version_id) REFERENCES model_versions (id) ON DELETE SET NULL;

CREATE TABLE model_files (
  id             CHAR(36) CHARACTER SET ascii NOT NULL,
  version_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  kind           ENUM('model','labels') NOT NULL,
  blob_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_model_files_version_kind (version_id, kind),
  KEY ix_model_files_blob (blob_id),
  CONSTRAINT fk_model_files_version FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE,
  CONSTRAINT fk_model_files_blob FOREIGN KEY (blob_id) REFERENCES blobs (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE uploads (
  id               CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  target_model_id  CHAR(36) CHARACTER SET ascii NULL,         -- P1: new version of this repository
  original_name    VARCHAR(255) NOT NULL,
  declared_size    BIGINT UNSIGNED NOT NULL,
  completed_at     DATETIME(3) NULL,
  consumed_at      DATETIME(3) NULL,
  expires_at       DATETIME(3) NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_uploads_user (user_id, consumed_at),
  KEY ix_uploads_target (target_model_id, consumed_at),
  KEY ix_uploads_expires (expires_at),
  CONSTRAINT fk_uploads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_uploads_target FOREIGN KEY (target_model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE shares (
  model_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id         CHAR(36) CHARACTER SET ascii NOT NULL,
  role            ENUM('viewer','editor') NOT NULL,
  allow_download  TINYINT(1) NOT NULL DEFAULT 1,              -- forced to 1 for editors in the service
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
  role              ENUM('viewer','editor') NOT NULL DEFAULT 'viewer',
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

CREATE TABLE issues (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  number        INT UNSIGNED NOT NULL,                         -- #1, #2 … per repository
  kind          ENUM('bug','question','feedback') NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body_md       TEXT NOT NULL,                                 -- ≤ 64 KiB
  node_ref      VARCHAR(512) NULL,                             -- ONNX node name or safetensors module path
  state         ENUM('open','closed') NOT NULL DEFAULT 'open',
  closed_at     DATETIME(3) NULL,
  closed_by     CHAR(36) CHARACTER SET ascii NULL,
  locked_at     DATETIME(3) NULL,                              -- locked: no new replies
  author_id     CHAR(36) CHARACTER SET ascii NULL,             -- NULL = deleted account
  reply_count   INT UNSIGNED NOT NULL DEFAULT 0,
  last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at    DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_issues_model_number (model_id, number),
  KEY ix_issues_model_state (model_id, state, last_activity_at),
  KEY ix_issues_model_node (model_id, node_ref(191)),
  KEY ix_issues_author (author_id, last_activity_at),
  CONSTRAINT fk_issues_model  FOREIGN KEY (model_id)  REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_issues_author FOREIGN KEY (author_id) REFERENCES users (id)  ON DELETE SET NULL,
  CONSTRAINT fk_issues_closer FOREIGN KEY (closed_by) REFERENCES users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE issue_replies (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  issue_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  author_id   CHAR(36) CHARACTER SET ascii NULL,
  body_md     TEXT NOT NULL,                                   -- ≤ 16 KiB
  deleted_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_issue_replies_issue (issue_id, created_at),
  KEY ix_issue_replies_author (author_id, created_at),
  CONSTRAINT fk_issue_replies_issue  FOREIGN KEY (issue_id)  REFERENCES issues (id) ON DELETE CASCADE,
  CONSTRAINT fk_issue_replies_author FOREIGN KEY (author_id) REFERENCES users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Unread tracking for the dashboard Activity feed.
CREATE TABLE issue_reads (
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  issue_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  last_read_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, issue_id),
  CONSTRAINT fk_issue_reads_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
  CONSTRAINT fk_issue_reads_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stars (
  user_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, model_id),
  KEY ix_stars_model_created (model_id, created_at),
  CONSTRAINT fk_stars_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
  CONSTRAINT fk_stars_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per unique viewer per model per day; purged after 30 days.
CREATE TABLE model_view_days (
  model_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  day          DATE NOT NULL,
  viewer_hash  BINARY(16) NOT NULL,                            -- SHA-256(user id | ip+ua, daily salt)[:16]
  PRIMARY KEY (model_id, day, viewer_hash),
  KEY ix_view_days_day (day),
  CONSTRAINT fk_view_days_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_trending (
  model_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  score         DOUBLE NOT NULL,
  stars_7d      INT UNSIGNED NOT NULL,
  views_7d      INT UNSIGNED NOT NULL,
  issues_7d     INT UNSIGNED NOT NULL,
  computed_at   DATETIME(3) NOT NULL,
  PRIMARY KEY (model_id),
  KEY ix_trending_score (score),
  CONSTRAINT fk_trending_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reports (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  issue_id     CHAR(36) CHARACTER SET ascii NULL,             -- set when an issue (not the repository) is reported
  reporter_id  CHAR(36) CHARACTER SET ascii NULL,
  reason       ENUM('malware','copyright','illegal','spam','abuse','other') NOT NULL,
  details      VARCHAR(2000) NULL,
  status       ENUM('open','dismissed','actioned') NOT NULL DEFAULT 'open',
  resolved_by  CHAR(36) CHARACTER SET ascii NULL,
  resolved_at  DATETIME(3) NULL,
  reporter_ip  VARCHAR(45) CHARACTER SET ascii NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_reports_status (status, created_at),
  KEY ix_reports_model (model_id),
  CONSTRAINT fk_reports_model    FOREIGN KEY (model_id)    REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_issue    FOREIGN KEY (issue_id)    REFERENCES issues (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id)  ON DELETE SET NULL,
  CONSTRAINT fk_reports_resolver FOREIGN KEY (resolved_by) REFERENCES users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    CHAR(36) CHARACTER SET ascii NULL,
  action      VARCHAR(64) CHARACTER SET ascii NOT NULL,
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

**Repository size** = `SUM(blobs.size_bytes)` over the repository's `model_files` (all versions) + declared sizes of pending uploads targeting it; limit 10 GiB.

**Counters** (`star_count`, `open_issue_count`, `reply_count`, `next_issue_number`) are only changed inside the same transaction as the row they count (`UPDATE … SET star_count = star_count + 1` after a successful `INSERT IGNORE` that affected one row). The nightly job reconciles them and logs any drift.

### `002_workspaces.sql` (P1)

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

Later: `003_designs.sql` (P2 design mode), specified when P2 starts. Versions, demo labels, and weight stats need no new tables.

**mysql2 gotcha**: `LIMIT ?`/`OFFSET ?` must be bound as strings with `execute()` on MySQL 8.0.22+; the `query()` helper handles it (unit-tested).

---

## 5. REST API

Conventions: JSON; errors `{ "error": { "code", "message", "details"? } }`. Auth: **none**, **user** (`Authorization: Bearer`), **cookie** (refresh cookie + CSRF checks), **principal** (user and/or `X-Share-Link`, or anonymous for public repositories). Role = minimum effective role (§7). Cursor pagination `?limit&cursor` → `{ items, nextCursor }`.

### Auth
| Method | Path | Auth | Request → Response |
|---|---|---|---|
| POST | `/api/auth/signup` | none (rate-limited) | `{ email, password }` → `201 { accessToken, user }` + cookie · `409 email_taken` |
| POST | `/api/auth/login` | none (rate-limited, backoff) | `{ email, password }` → `{ accessToken, user }` + cookie · `401` · `429 { retryAfterSec }` |
| POST | `/api/auth/refresh` | cookie | → `{ accessToken, user }` + rotated cookie · `401` |
| POST | `/api/auth/logout` | cookie | → `204` |
| POST | `/api/auth/logout-all` | user | → `204` |

### Me and users
| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/api/me` | user | `{ id, email, username, displayName, bio, role, createdAt }` |
| PATCH | `/api/me` | user | `{ username? (30-day cooldown), displayName?, bio? }` · `409 username_taken` |
| PUT | `/api/me/password` | user | `{ currentPassword, newPassword }` → `204`, revokes other sessions |
| PUT | `/api/me/email` | user | `{ currentPassword, newEmail }` → `204` |
| GET / DELETE | `/api/me/sessions[/:familyId]` | user | list / revoke |
| DELETE | `/api/me` | user | `{ password, confirmUsername }` → `204` (§6.8) |
| GET | `/api/me/activity` | user | issue activity on my repositories and my issues, with `unread` flags (§8.8) |
| GET | `/api/me/stars` | user | starred repositories I can still access |
| GET | `/api/users/search?q=` | user (rate-limited) | prefix search on username/display name → `[{ username, displayName, avatarUrl }]` (max 10) |
| GET | `/api/users/:username` | none | public profile `{ username, displayName, bio, avatarUrl, createdAt, publicModelCount, starsReceived }` |
| GET | `/api/users/:username/models` | none | public repositories |
| GET | `/api/users/:username/stars` | none | public repositories they starred |

### Uploads (tus 1.0, Bearer on every request)
| Method | Path | Notes |
|---|---|---|
| OPTIONS / POST | `/api/uploads` | create; `Upload-Length` required; metadata `filename` (+ `modelId` for P1 versions). `413 file_too_large`, `413 repository_full`, `415 unsupported_format` (+ hint for `.pt`), `507 server_storage_low` |
| HEAD / PATCH | `/api/uploads/:uploadId` | resume / append (owner only, else 404) |
| DELETE | `/api/uploads/:uploadId` | termination |

### Repositories
| Method | Path | Auth | Role | Request → Response |
|---|---|---|---|---|
| GET | `/api/models?scope=owned\|shared` | user | — | `{ items: ModelListItem[], nextCursor }` |
| POST | `/api/models` | user | — | `{ uploadId, name, description?, readme?, license?, visibility?, publicAllowDownload? }` → `202 ModelDetail` |
| GET | `/api/models/:id` | principal | viewer | `ModelDetail` (records a unique view for non-editors) |
| PATCH | `/api/models/:id` | user | editor (`visibility`, `publicAllowDownload`: owner) | `{ name?, description?, license?, visibility?, publicAllowDownload? }` |
| DELETE | `/api/models/:id` | user | owner | `204` |
| GET | `/api/models/:id/readme` | principal | viewer | `{ markdown, updatedAt, updatedBy }` (`ETag`) |
| PUT | `/api/models/:id/readme` | user | editor | `{ markdown, baseUpdatedAt }` → `200` · `409 readme_conflict` if someone saved in between |
| GET | `/api/models/:id/graph?version=` | principal | viewer | `ParsedModel` (gzip, `ETag`) · `409 not_ready` |
| POST | `/api/models/:id/file-ticket` | principal | viewer + canDownload | `{ kind?, version? }` → `{ url, expiresAt }` |
| GET | `/api/models/:id/file?ticket=` | ticket | re-checked | stream, `Accept-Ranges: bytes`, `206` for one range |
| PUT / DELETE | `/api/models/:id/star` | user | viewer | `{ starred, starCount }` |
| POST | `/api/models/:id/reports` | none (rate-limited) | viewer | `{ reason, details?, issueNumber? }` → `204` |

`ModelListItem = { id, name, description, format, owner: { username, displayName, avatarUrl }, myRole, status, sizeBytes, totalParams, visibility, starCount, openIssueCount, strip, updatedAt }`
`ModelDetail = ModelListItem & { license, hasReadme, currentVersion: { id, number, status, failureReason, originalName, sha256, summary, createdAt }, myAccess: { role, canDownload, via }, starredByMe, takenDown }`

### Issues
| Method | Path | Auth | Role | Request → Response |
|---|---|---|---|---|
| GET | `/api/models/:id/issues?state=open\|closed&kind=&nodeRef=` | principal | viewer | `{ items: IssueListItem[], nextCursor }` |
| POST | `/api/models/:id/issues` | user (rate-limited) | viewer | `{ kind, title, body, nodeRef? }` → `201 Issue` |
| GET | `/api/models/:id/issues/:number` | principal | viewer | `Issue` + first page of replies; marks it read for the caller |
| PATCH | `/api/models/:id/issues/:number` | user | author: `title`, `body`, `state`; editor: `state`, `locked`, `kind` | `Issue` |
| DELETE | `/api/models/:id/issues/:number` | user | author (no replies yet) or editor | `204` (soft delete) |
| GET | `/api/models/:id/issues/:number/replies?cursor=` | principal | viewer | replies |
| POST | `/api/models/:id/issues/:number/replies` | user (rate-limited) | viewer, issue not locked (editors may still reply) | `{ body }` → `201 Reply` |
| PATCH / DELETE | `/api/models/:id/issues/:number/replies/:replyId` | user | author edits; author or editor deletes | `Reply` / `204` |

`IssueListItem = { number, kind, title, state, author: UserRef | null, nodeRef, replyCount, lastActivityAt, createdAt, locked }`

### Sharing (owner only)
| Method | Path | Request → Response |
|---|---|---|
| GET | `/api/models/:id/shares` | `[{ user: UserRef, role, allowDownload, createdAt }]` |
| PUT | `/api/models/:id/shares/:username` | `{ role: 'viewer'\|'editor', allowDownload? }` → `Share` · `404 user_not_found` · `422 cannot_share_with_owner` |
| DELETE | `/api/models/:id/shares/:username` | `204` |
| GET | `/api/models/:id/share-links` | `[{ id, url, label, role, allowDownload, expiresAt, revokedAt, lastUsedAt, visitorCount }]` |
| POST | `/api/models/:id/share-links` | `{ role, allowDownload, expiresAt?, label? }` → `201 ShareLink` |
| PATCH | `/api/models/:id/share-links/:linkId` | `{ role?, allowDownload?, expiresAt?, label? }` |
| DELETE | `/api/models/:id/share-links/:linkId` | `204` |
| POST | `/api/share-links/resolve` | `X-Share-Link` (rate-limited) → `{ modelId, role, canDownload }`; records `link_visits` for logged-in callers · `404` |

### Explore
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/explore` | none | `{ trending: ModelListItem[12], newest: [12], mostStarred: [12], byFormat: { onnx: [6], safetensors: [6] } }`, cached in memory for 60 s |
| GET | `/api/explore/search?q=&format=&downloadable=&sort=trending\|stars\|recent` | none | paginated; FULLTEXT when `q` is set |

### Moderation (admin)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/reports?status=` | queue |
| POST | `/api/admin/reports/:id/resolve` | `{ action: 'dismiss'\|'takedown'\|'delete_issue', reason? }` |
| POST | `/api/admin/models/:id/takedown` / `restore` | taken-down repositories: owner sees the notice, others 404 |

### P1 / P2
| Method | Path | Role |
|---|---|---|
| GET / POST | `/api/models/:id/versions` | viewer / editor (`{ uploadId, note? }` → `202`) |
| DELETE | `/api/models/:id/versions/:n` | owner |
| GET | `/api/models/:id/diff?from=&to=` | viewer |
| PUT | `/api/models/:id/labels` | editor |
| GET | `/api/models/:id/tensors/stats?name=` | viewer |
| GET | `/api/models/:id/tensors/filters?name=` | viewer + canDownload |
| CRUD | `/api/workspaces[/:slug[/members]]`, `POST /api/models/:id/move` | ws owner / repository owner |

---

## 6. Auth flows

### 6.1 Tokens
- Access: JWT HS256 (`jose`), 10 min, `{ sub, sid, iat, exp, iss, aud }`, in memory only.
- Refresh: 32 random bytes (base64url), cookie `mieru_rt` (`HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=30d`), DB stores SHA-256; 30 d per token, 90 d per family.

### 6.2 Signup
1. Validate `email` and `password` (10–128 chars). Normalize email (trim + lowercase).
2. `409 email_taken` if it exists (rate limit keeps enumeration slow; emails are never public).
3. Generate `username`: email local part → lowercase → keep `[a-z0-9_-]` → trim to 20 → fall back to `user` if under 3 chars → if taken, reserved, or in `released_usernames`, append `-` + 4 random digits (retry up to 5 times). `display_name` = username.
4. argon2id hash, insert, issue a session, `201`.
5. The signup form states plainly that mieru can't reset forgotten passwords. A welcome dialog after signup shows the generated username with a link to change it.

### 6.3 Login + brute force
1. IP limit 10/min. Look up by `email_normalized`.
2. `locked_until > now` → `429` (dummy argon2 verify keeps timing flat).
3. Unknown email → dummy verify → `401 invalid_credentials`.
4. Wrong password → `failed_login_count += 1`; at ≥ 5, `locked_until = now + min(2^(count-5), 30) min`.
5. Success → reset counters, rehash if params changed, issue a session.

### 6.4 Session issue, refresh rotation, reuse detection
- **Issue**: new `family_id`, insert token row, set cookie, sign JWT.
- **Refresh** (one transaction, `SELECT … FOR UPDATE`):
  1. CSRF checks (§6.6). Not found / revoked → `401` + clear cookie.
  2. Already rotated: ≤ 10 s ago → `401 stale_refresh` (benign multi-tab race; the client retries once with the newer cookie). Otherwise **reuse detected**: revoke the family, write `audit_events`, `401`.
  3. Expired token or family → `401`.
  4. `password_changed_at > token.created_at` → revoke family, `401`.
  5. Insert successor (same family and family expiry), mark the old one rotated, commit, set cookie, return JWT.
- **Client**: single-flight refresh per tab + `navigator.locks.request('mieru-refresh')` across tabs; boot calls `/refresh`; any `401` triggers one refresh + one retry; tus refreshes the header in `onBeforeRequest`.

### 6.5 Logout
`logout` revokes the cookie's family and clears the cookie; the client drops its token and query cache. `logout-all` revokes every family. Settings → Sessions revokes individual families.

### 6.6 CSRF
- Every route except `/api/auth/refresh` and `/api/auth/logout` authenticates only via `Authorization` / `X-Share-Link` headers → CSRF-immune.
- Cookie routes: `SameSite=Strict` cookie scoped to `/api/auth`, `Origin` must equal `APP_ORIGIN` (missing → reject), `Content-Type: application/json` required (no CORS policy is served, so cross-origin preflights fail).
- Download tickets are 60 s bearer URLs scoped to one file and principal.

### 6.7 Password and email changes
Both require `currentPassword`. A password change sets `password_changed_at`, revokes other families, and resets the lockout. An email change only changes the login identifier (it confers nothing else).

### 6.8 Account deletion
1. Settings → 계정 삭제 lists the consequences: owned repositories (N) and their files, READMEs, issues, links, and stars are deleted; issues and replies you wrote on other people's repositories stay and show "탈퇴한 사용자"; your stars on other repositories are removed.
2. Requires the current password and typing the username.
3. Server, in one transaction: (P1) `409 sole_workspace_owner` check → collect blob ids of owned repositories → decrement `star_count` on repositories the user starred → delete owned repositories (cascades versions, files, shares, links, visits, issues and replies on them, stars on them, views, trending, reports) → delete the user (cascades tokens, uploads, stars, reads; `SET NULL` on authored issues/replies, `created_by` columns, reporters; issue and reply counters on other repositories stay correct because those rows remain) → insert `released_usernames` → `audit_events` row without PII. After commit: unlink upload files and blobs with zero references.
4. `204` + cleared cookie.

### 6.9 Rate limits (`@fastify/rate-limit`, in-memory, keyed on the real client IP or user)
| Route | Key | Limit |
|---|---|---|
| all `/api/*` | IP | 300/min |
| `POST /auth/login` | IP | 10/min (+ account backoff) |
| `POST /auth/signup` | IP | 5/hour |
| `POST /auth/refresh` | IP | 30/min |
| `PUT /me/password`, `PUT /me/email`, `DELETE /me` | user | 10/hour (password checks count toward lockout) |
| `POST /share-links/resolve`, requests with `X-Share-Link` | IP | 30/min; failed lookups count double |
| `POST /api/uploads` | user | 30/hour |
| `POST …/issues` | user | 20/hour |
| `POST …/replies` | user | 60/hour |
| `PUT/DELETE …/star` | user | 120/hour |
| `GET /users/search` | user | 60/min |
| `POST …/reports` | IP | 10/hour |

---

## 7. Sharing and permissions

### 7.1 What sharing means in mieru
Every repository has exactly one **owner**. Sharing lets the owner bring other people in. Access is granted, never copied, so the owner can take it back at any time. Four ways, and they stack:

1. **People**: add mieru accounts by username as **viewer** or **editor**, with a per-person download setting.
2. **Links**: secret links, each with its own role (viewer or editor), expiry, and download setting. Logged-out visitors always get viewer. A logged-in person who opens a link keeps that access (and sees it under "공유받은 모델") until the link expires or is revoked.
3. **Public**: listed on Explore and the owner's profile; anyone can view. The owner chooses **downloadable** (default) or **view only**. View only hides the download button and demo/filter images for the public. It protects the weights; the architecture is still visible in the graph, and the dialog says so.
4. **Workspaces (P1)**: members of a team workspace get access to its repositories.

Only the owner changes who has access. Editors change the repository's content (metadata, README, issue moderation, P1 versions), not the guest list.

General access on a repository: **Private** (owner only; existing people and links kept but inactive) → **Specific people** → **Anyone with the link** → **Public**.

### 7.2 Roles and capabilities
| Capability | anonymous (public/link) | viewer | editor | owner |
|---|:-:|:-:|:-:|:-:|
| View README, graph/tree, stats, histograms (P1), issues | ✓ | ✓ | ✓ | ✓ |
| Download original, run demo (P1), filter images (P1) | if `canDownload` | if `canDownload` | ✓ | ✓ |
| Star | | ✓ (logged in) | ✓ | ✓ |
| Open issues, reply, edit/close own issues | | ✓ (logged in) | ✓ | ✓ |
| Edit name/description/license/README; close, reopen, lock, relabel, delete any issue or reply; upload versions (P1) | | | ✓ | ✓ |
| Change general access, people, links, public download | | | | ✓ |
| Delete repository or versions, move to workspace (P1) | | | | ✓ |

### 7.3 Resolution table
| Source | Condition | Role | Download |
|---|---|---|---|
| Owner | `owner_id = user` | owner | yes |
| Workspace owner (P1) | repository in workspace, user is ws owner | owner, except deleting the repository | yes |
| Workspace member (P1) | user is ws member | editor | yes |
| Direct share | `visibility ∈ {users, link, public}` and a `shares` row | `shares.role` | `shares.allow_download` (editor: yes) |
| Link via header | `visibility ∈ {link, public}`, valid `X-Share-Link` (not revoked, not expired) | `link.role`; **viewer if anonymous** | `link.allow_download` |
| Link via visit | logged-in user with `link_visits` for a link meeting the same conditions | `link.role` | `link.allow_download` |
| Public | `visibility = public` | viewer | `public_allow_download` |
| Takedown | `taken_down_at IS NOT NULL` | owner keeps view-only access with the notice; admins view; **everyone else → none** | no |
| Nothing applies | | → `404` | |

Effective role = max over sources; `canDownload` = OR over granting sources. Admins get viewer on any repository plus admin routes. Issue and star permissions follow the effective role plus "logged in".

### 7.4 Enforcement
- **One resolver**: `features/sharing/access-service.ts` → `resolveModelAccess(db, modelId, principal)`: one SQL query (`models` LEFT JOIN `shares`, `share_links` by header hash, `link_visits` → `share_links`, P1 `workspace_members`) feeding a pure `combineGrants(rows, principal, now)` with a table-driven unit test per §7.3 row.
- **One gate**: `requireModelAccess(minRole, { download?, loggedIn? })` preHandler sets `request.modelAccess`. A boot-time route walk **refuses to start** if any route under `/api/models/:id` lacks it. Issue routes add an ownership check (author vs editor) on top, inside `issues/service.ts`.
- **Lists** (`scope=shared`, profiles, Explore, stars, activity) use dedicated SQL; a matrix integration test asserts each returns exactly what the resolver grants.
- **Tickets** carry `{ modelId, fileId, principal }` and are re-resolved on use.
- The SPA reads `myAccess` only to hide controls.

---

## 8. Parsing, README, issues, stars, trending

### 8.1 Upload validation
1. At tus creation: extension allow-list (`.onnx`, `.safetensors`; `.pt|.pth|.bin|.pkl|.ckpt` → `415` + conversion hint), per-format limit (`MAX_ONNX_BYTES` 2 GiB, `MAX_SAFETENSORS_BYTES` 10 GiB), repository limit, and `statfs` free space ≥ `Upload-Length + DISK_RESERVE_BYTES` (50 GiB default).
2. Filenames: strip control characters and separators, NFC, ≤ 255; display and `Content-Disposition` only.
3. At `POST /models`: upload complete and owned by the caller; magic bytes: safetensors `2 ≤ u64le(0) ≤ 100 MiB`, `8 + N ≤ size`, byte 8 = `{`; ONNX byte 0 = `0x08` (heuristic, backed by the full scan).
4. README: ≤ 256 KiB of UTF-8, stored as-is (rendering is sanitized, §D19). A selected `README.md` file is read client-side and sent as text.

### 8.2 Guarded execution
- Parser worker via `worker_threads` (`maxOldGenerationSizeMb: 512`), timeout 30 s + 30 s/GiB, concurrency 1; `processing` versions re-queued at boot (idempotent via sha256-keyed blobs).
- Failure codes: `bad_header`, `truncated`, `bad_protobuf`, `bad_json`, `offsets_invalid`, `unsupported_dtype`, `limits_exceeded`, `external_data_unsupported`, `timeout`, `internal` (each with Korean user-facing copy).
- Limits: ≤ 200k nodes, ≤ 500k tensors, ≤ 16 dims, names ≤ 1 KiB, attribute lists summarized beyond 64, nested subgraphs counted only, safetensors JSON depth ≤ 4.

### 8.3 What is extracted
**ONNX** (streaming wire scanner + `protobufjs`; `onnx.proto` vendored from a pinned ONNX release, Apache-2.0): model metadata (`ir_version`, opsets, producer, `doc_string` ≤ 4 KiB, `metadata_props`); graph inputs/outputs (minus initializers) with dtype/shape; `value_info` shapes; initializers (name, dtype, dims, numel, bytes, payload offset/length; external data → error); nodes (id, name or synthesized, op type, domain, IO, summarized attributes); initializers and `Constant` outputs folded into consuming nodes as `params`; edges with tensor info; group paths from `/` and `.` name segments; architecture strip (op category runs in topological order).

**safetensors**: header tensors + `__metadata__` (values ≤ 1 KiB); validation of dtypes, sizes, sorted non-overlapping offsets, and total length; module tree from `.`-split names with aggregated params/bytes/dtypes; strip from module parameter shares.

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
  strip: { category: string; weight: number }[];   // ≤ 512 segments
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
interface OnnxEdge { id: string; source: string; target: string; tensor: TensorInfo; }

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
Validated with the zod mirror at the SPA boundary. Tensor payload offsets stay server-side.

### 8.5 Caching
- Sidecar `parsed/<blob_key>.v<PARSER_VERSION>.json.gz` + summary columns on `blobs`.
- `GET /graph` streams it with `Content-Encoding: gzip`, `ETag "<blob_key>.v<N>"`, `Cache-Control: private, no-cache`; `304` on match.
- Missing sidecar → re-parse job + `409 not_ready { retryAfterSec }`.
- P1 diff cache `parsed/diff-<fromBlob>-<toBlob>.v<N>.json.gz`; `GraphDiff` matches nodes by name (fallback op type + topological index) and tensors by name, statuses `added | removed | changed | unchanged`, weight changes via per-tensor hashes added in parser v2.

### 8.6 Large graphs
- Muted op palette capped at **six families** (compute, attention, normalization, activation, shape & pooling, other), color-vision-deficiency checked; the inspector still shows the exact op type.
- Grouping trie over `groupPath`, start at the shallowest depth with ≤ 300 visible items, expand re-lays out only that group (ELK `INCLUDE_CHILDREN`), hard cap 1,500 visible.
- No hierarchical names and > 300 nodes → topological blocks of ~50.
- elkjs in a Web Worker; `onlyRenderVisibleElements`; minimap off above 1,000 nodes; search pans and expands to matches.
- Nodes with linked issues show a small badge with the open-issue count; clicking it filters the Issues tab by `nodeRef`.
- Model Explorer stays the measured fallback (M3.7): if expand/pan interactions exceed ~100 ms at the cap on a 10k-node fixture, add its visualizer as an alternate renderer above a node threshold.

### 8.7 Trending
Every 15 minutes, for public, ready, not-taken-down repositories with any activity in the last 7 days:

```
score = Σ_events weight(event) × 0.5^(age_hours / 33)
weights: star added = 3, unique daily view = 1, issue opened = 2, new version (P1) = 2
```
- Inputs come from `stars.created_at`, `model_view_days`, `issues.created_at` (one SQL statement per source, aggregated in Node).
- Views by the owner and editors aren't recorded; stars by the owner don't count.
- A repository needs at least 2 distinct users contributing events to qualify, so one person can't push their own model up.
- Results replace `model_trending` in one transaction; `/api/explore` reads the top 12.
- Explore falls back to "most starred" when fewer than 4 repositories qualify (quiet periods, early days).

### 8.8 Issues
- `number` is allocated from `models.next_issue_number` inside the insert transaction (`SELECT … FOR UPDATE` on the model row).
- `open_issue_count` and `reply_count` change in the same transactions as the rows. `last_activity_at` updates on reply, close, or reopen.
- `nodeRef` is validated against the current version's parsed node names/module paths when given; issues keep their `nodeRef` text when a later version renames things (the badge just stops matching).
- Activity feed (`GET /api/me/activity`): issues on repositories where I'm owner/editor plus issues I authored or replied to, ordered by `last_activity_at`; `unread` when there's no `issue_reads` row or `last_read_at < last_activity_at` and the latest activity wasn't mine. The dashboard shows an unread count badge.
- Locked issues accept replies only from editors. Deleted issues and replies render as "삭제된 글" to keep threads readable.

### 8.9 Stars
- `PUT /star`: `INSERT IGNORE INTO stars`; if a row was inserted, increment `star_count` in the same transaction. `DELETE` mirrors it. Responses return the new count.
- Starring needs viewer access; losing access hides the repository from "내 스타" but keeps the row (and the count) until the owner deletes the repository or the user unstars.

### 8.10 View counting
- `GET /api/models/:id` by a viewer who isn't owner/editor inserts `(model_id, CURRENT_DATE, viewer_hash)` with `INSERT IGNORE`, fire-and-forget after the response.
- `viewer_hash` = first 16 bytes of SHA-256(`user:<id>` or `anon:<ip>|<user-agent>`, `HMAC(VIEW_SALT_SECRET, date)`), so hashes can't be linked across days or reversed without the secret.
- Owners and editors see "이번 주 고유 조회수" on the repository Info tab; the public sees stars only.

---

## 9. Frontend

### 9.1 Design direction (`frontend-design`, brand confirmed)

**Subject, audience, job.** Subject: the inside of a neural network. Audience: ML engineers, researchers, students. Primary job: understand an architecture in seconds and pass it on.

**Concept: the light table.** The product UI recedes so the model can be seen, which is what 見える means. The confirmed Y2K-kirakira logo (`docs/brand/logo-final.jpg`) and its pastel energy live in the landing page, Explore header, empty/loading states, 404/takedown pages, profile headers, and share previews. Working surfaces (graph canvas, tables, issue threads) stay calm.

**Signature element: the architecture strip.** A thin band of op-category colors in topological order (`summary.strip`) on every repository row, card, and header. A ResNet and a transformer look different at a glance.

**Tokens (brand colors sampled from the logo; neutrals provisional until M-B)**
| Token | Value | Use |
|---|---|---|
| `paper` | `#F6F7FA` | app background, canvas |
| `sumi` | `#1B1E2B` | text, strokes |
| `fog` | `#E3E6EE` | dividers, canvas dot grid |
| `slate` | `#5A6072` | secondary text |
| `mieru-pink` | `#DE7EA8` | **brand primary** (logo outline): brand surfaces, illustrations, star icon fill; primary action color in dark mode (6.7:1 on `canvas-dark`). Not for text/buttons on light backgrounds (2.6:1) |
| `primary` | `#BC3D86` | light-mode buttons (white text 5.1:1), links, focus rings (4.7:1 on `paper`) |
| `sakura` | `#F2C2D4` | logo fill: soft highlights, selected chips, hover tints (`sumi` on it 10.6:1) |
| `lilac` | `#C8B6D4` | logo shadow: selected rows, canvas selection halo (`sumi` on it 8.8:1) |
| `canvas-dark` | `#12141D` | dark-mode canvas (dark mode ships at launch) |

- Issue kinds use labels with text + icon, never color alone: 버그, 질문, 피드백.
- The op-family palette (six muted families) is a separate data palette, CVD-checked on both canvases, never reusing `mieru-pink`/`primary`.
- Layout and component patterns follow `docs/design/references.md` (Dribbble research, 2026-11-02): repository pages use a top bar + tabs instead of the sidebar, the inspector is docked, Explore uses rows, tinted chips use `sumi` text.
- Canvas background: fine screentone dot grid (`fog` on `paper`).

**Type**: Pretendard for UI and body (Korean-first, tabular figures for numbers); IBM Plex Mono only for tensor literals (`[1, 3, 224, 224]`, `float16`) and code blocks in Markdown; the logo is artwork, redrawn as SVG in M-B. Scale 13 / 14 / 16 / 20 / 28 / 40 px; UI at 14. README/issue prose uses 16 px with 1.7 line height and a max width of ~72 characters.

**Layout**

```
Repository page (desktop)
┌───────────────────────────────────────────────────────────────────────┐
│ mieru   @kai / resnet50-v2   공개 · 다운로드 가능   ☆ 128   [공유] [⋯] │
│ ▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░▓▓▒▒░░  25.6M params · 98 MB · ONNX opset 17  │
│ 개요   그래프   통계   이슈 3   정보        (P1: 버전, 데모, 가중치)     │
├───────────────────────────────────────────┬───────────────────────────┤
│ README (rendered Markdown)                │ 요약                       │
│ # ResNet-50 v2                            │ 입력  [1,3,224,224] f32    │
│ ImageNet classifier exported from …       │ 출력  [1,1000] f32         │
│                                           │ 라이선스 apache-2.0        │
│                                           │ [그래프 미리보기 thumbnail] │
│                                           │ [다운로드]                  │
└───────────────────────────────────────────┴───────────────────────────┘
The 그래프 tab is a full-bleed canvas with the node inspector drawer.

Explore
┌───────────────────────────────────────────────────────────────────────┐
│ [logo]  모델 둘러보기                         [검색 ______________ ]   │
├───────────────────────────────────────────────────────────────────────┤
│ 이번 주 화제                                                          │
│ ▓▒░▓▒░▓▒░  llama-tiny      @mio   110M  ☆ 42 (+18)  이슈 2            │
│ ▓▓░░▓▓░░░  resnet50-v2     @kai   25.6M ☆ 128 (+9)                    │
│ …                                                                     │
│ 새로 올라온 모델              │ 스타 많은 모델                         │
│ …                             │ …                                     │
└───────────────────────────────────────────────────────────────────────┘
```
- Left-aligned; numbers right-aligned in tables. Dense lists rather than card grids.
- Motion only in response to actions: group expand/collapse, inspector drawer, star toggle (a single small pop on the star icon). `prefers-reduced-motion` disables it.
- Copy: Korean, plain, sentence case; actions keep the same name through a flow ("이슈 열기" → "이슈를 열었어요"). Errors say what happened and what to do.

**Skill owners**: `frontend-design` (direction) → M-B brand pass (SVG logo, final neutrals) → `dataviz` (op palette, charts) → `emil-design-eng` / `animate` (expand/collapse, drawer, star) → `better-interface` + `web-design-guidelines` before each UI milestone closes → `impeccable` + `kill-ai-slop` once per release.

### 9.2 Routes
| Route | Page |
|---|---|
| `/` | Landing (logged out, brand-led) / redirect to `/dashboard` |
| `/explore` | Trending, newest, most starred, by format; search |
| `/u/:username` | Profile: public repositories, starred repositories |
| `/login`, `/signup` | Email + password |
| `/dashboard` | 내 모델 · 공유받은 모델 · 활동 (issue activity, unread badge) · 스타 |
| `/new` | Create repository: file (tus, pause/resume), README (file or editor with template), name, description, license, visibility |
| `/m/:modelId` | Repository: 개요 (README + summary), 그래프/트리, 통계, 이슈, 정보 (P1: 버전, 데모, 가중치) |
| `/m/:modelId/issues/:number`, `/m/:modelId/issues/new` | Issue thread / new issue (optionally prefilled `nodeRef` from the inspector's "이 노드에 이슈 열기") |
| `/m/:modelId/readme/edit` | README editor (editors): Markdown with live preview, conflict warning |
| `/s/:token` | Link entry: resolves, then replaces the URL with `/m/:id?via=link` (token kept in memory) |
| `/settings/*` | Profile (username, display name, bio), password, email, sessions, delete account |
| `/admin/reports` | Moderation queue |
| `/help/convert` | `.pt` → ONNX / safetensors guide |
| `*` | 404 (also for no-access repositories) |

### 9.3 Main components
- Core: `AuthProvider` / `auth-store`, `api-client` (Bearer + `X-Share-Link`, refresh-retry, zod parsing), `upload.ts` (tus), `Markdown` (D19), `MarkdownEditor` (textarea + preview tabs, paste-to-upload images is out of scope).
- Repository: `RepoHeader` (+ `ArchitectureStrip`, `StarButton`, `VisibilityBadge`), `ReadmeView`, `SummaryPanel`, `OnnxGraphView` (`OpNode`, `GroupNode`, `IoNode`, legend, search, layout worker, issue badges), `NodeInspector` (+ "이 노드에 이슈 열기"), `SafetensorsTreeView` (virtualized), `StatsTab`.
- Issues: `IssueList` (filters: 열림/닫힘, kind, node), `IssueThread`, `IssueComposer`, `ReplyComposer`, `KindLabel`.
- Sharing: `ShareDialog` (general access, `PeoplePicker`, per-person role + download, `ShareLinkManager`, public download choice with the "weights only" note).
- Discovery: `ExploreSections`, `ModelTable`, `SearchBar`, `ProfileHeader`.
- Account: `SignupForm` (no-recovery notice), `WelcomeDialog` (generated username), `SessionsList`, `DeleteAccountFlow`.
- Admin: `ReportQueue`.

### 9.4 README template (offered in the editor when empty)
Prefilled from the parsed summary: title, one-line description, inputs/outputs table, parameter count, format/opset, and empty sections "용도", "학습 데이터", "평가", "제한 사항", "라이선스". Editors can discard it.

### 9.5 Share previews
For `/m/:id` and `/u/:username`, Fastify injects Open Graph tags into `index.html` (title, description, OG image = architecture strip + logo frame rendered via `@resvg/resvg-js`, cached by blob key). Private and link-only repositories get a generic mieru preview and never leak names.

---

## 10. Milestones

**R1 Launch** = M0–M7 + M-B + M-R. **R2** = P1. **R3** = P2. Each task is one Conventional Commit with tests; AC = observable acceptance criterion.

### M0 — Foundations
| # | Task | AC |
|---|---|---|
| 0.1 | npm workspaces, TS base, ESLint, Prettier, `.nvmrc`, `.env.example`, root scripts | `npm run lint && npm run format:check && npm run typecheck` pass |
| 0.2 | `@mieru/shared` consumed by both apps | typecheck resolves imports from both |
| 0.3 | Server skeleton: `buildApp`, zod config, pino with redaction (`authorization`, `cookie`, `x-share-link`, `ticket`), error shape, `/api/health` | missing `JWT_SECRET` throws; inject `/api/health` → 200 |
| 0.4 | DB pool, `query`/`withTransaction`, LIMIT-as-string | integration: prepared SELECT + rollback |
| 0.5 | Migration runner + `001_init.sql` | second run no-op; edited file aborts; concurrent runs serialize |
| 0.6 | Web skeleton: Vite, Router, Query, Tailwind, i18next (ko), tokens, Radix primitives, `Markdown` component | build succeeds; unit: `<script>` and raw HTML in Markdown render as text; `javascript:` links are dropped; `http:` images aren't loaded |
| 0.7 | Vitest workspace, Playwright (headless), `paseo.json` scripts | `npm run test:unit` and `npm run test:e2e` run headless |
| 0.8 | Helmet headers, CSP (`img-src 'self' https: data:`), `Referrer-Policy: no-referrer` | integration asserts headers |
| 0.9 | In-process scheduler with `GET_LOCK` per job | unit: two scheduler instances against the test DB run a job once |
| 0.10 | GitHub Actions CI (lint, typecheck, unit, integration with MySQL 8.4 service) | workflow file present; runs on your first push |

### M1 — Accounts
| # | Task | AC |
|---|---|---|
| 1.1 | Signup (email + password, username generation, reserved/released names) | integration: `kai.dev@x.com` → username `kai-dev`; second `kai.dev@y.com` → `kai-dev-NNNN`; cookie flags correct; duplicate email → 409 |
| 1.2 | Token service + `auth` plugin | expired/tampered JWT rejected; `/api/me` 401/200 |
| 1.3 | Login + backoff | 5 failures → 429 with `retryAfterSec`; success resets |
| 1.4 | Refresh rotation, grace window, reuse detection, audit | fake clock: replay after 10 s kills the family; within 10 s → `stale_refresh` |
| 1.5 | CSRF guard on cookie routes | bad/missing Origin → 403; `text/plain` → 415 |
| 1.6 | Logout, logout-all, sessions list/revoke | revoked family can't refresh |
| 1.7 | Rate-limit plugin per §6.9 + real-IP extraction | 11th login/min → 429; spoofed `X-Forwarded-For` ignored with hops = 0 |
| 1.8 | Profile edit, username change (cooldown, released names), password and email change | second rename within 30 days → 409; old username unavailable to others for 30 days; password change revokes other sessions |
| 1.9 | Account deletion | integration: user with 2 repositories, an issue on someone else's repository, and 3 stars → repositories and files gone, the foreign issue shows author `null`, starred repositories' `star_count` decremented, audit row has no PII |
| 1.10 | Web: AuthProvider, signup (no-recovery notice), welcome dialog, login, Settings | Playwright: signup → welcome shows username → reload keeps session → logout → login → delete account → login fails |

### M2 — Repositories: upload, storage, processing
| # | Task | AC |
|---|---|---|
| 2.1 | `storage/paths.ts` (UUID-only keys, fixed areas), dirs `0700` | traversal input throws; every path under `STORAGE_DIR` |
| 2.2 | Fixture generator (tiny CNN/MLP ONNX, nested safetensors, malformed variants, synthetic 10k-node ONNX, sparse > 100 MB safetensors) | deterministic sha256 across runs |
| 2.3 | safetensors parser + tree + strip | valid fixture → expected totals; each malformed variant → its code |
| 2.4 | ONNX streaming scanner + `protobufjs`, folding, edges, groups, strip, offsets | CNN fixture counts/params correct; peak RSS on the large fixture < 200 MB; truncated → `truncated` |
| 2.5 | Worker runner + `process-version` job (DB status, boot recovery) | infinite-loop stub → `timeout`; restart mid-job completes it |
| 2.6 | tus endpoint (auth per request, ownership, limits, free-space check, 24 h expiry) | 3-chunk upload completes; other user's HEAD → 404; ONNX > 2 GiB declared → 413; low disk (stubbed) → 507 |
| 2.7 | `POST /api/models` with README → 202 → processing with dedup | poll until `ready`; README stored; identical re-upload creates no new blob file; garbage `.onnx` → `failed` + `bad_protobuf`, no files left |
| 2.8 | `GET /models/:id`, `/graph` (gzip, ETag, `not_ready`, lazy re-parse), `/readme` GET/PUT with conflict check | 304 on revalidation; PUT with stale `baseUpdatedAt` → 409; README > 256 KiB → 413 |
| 2.9 | File tickets + streaming download with `Range` | downloaded sha256 = original; `Range` → 206; expired ticket → 401 |
| 2.10 | Delete repository + PATCH metadata | blob shared with another repository survives; otherwise removed |
| 2.11 | `storage:gc` + nightly `storage-gc` job | planted orphan listed in dry-run, removed with `--apply` |

### M3 — Visualization
| # | Task | AC |
|---|---|---|
| 3.1 | Repository page shell: `RepoHeader`, strip, tabs, 개요 (README + summary), processing/failed states | Playwright: README renders; header shows params/nodes; failed upload shows its reason |
| 3.2 | `SafetensorsTreeView` | expected tree; keyboard expand/collapse |
| 3.3 | Op palette (`dataviz`) + `OnnxGraphView` + ELK worker | N `op-node`s; Conv has the conv category |
| 3.4 | `NodeInspector` | clicking Conv shows `kernel_shape`, IO shapes, params |
| 3.5 | Grouping/LOD, expand/collapse animation, chunking, search | 2,000-node graph → ≤ 300 visible; expand increases count; search focuses a match |
| 3.6 | Stats tab | aggregation unit tests; bar counts |
| 3.7 | Perf spike on the 10k-node fixture | report: first render, expand latency, memory; renderer go/no-go |
| 3.8 | Create-repository page (tus progress, pause/resume, README file or editor + template, visibility) + dashboard "내 모델" | Playwright: create with README → progress → lands on the repository when ready; dashboard lists it |
| 3.9 | Dark mode | screenshot baselines for light/dark repository page |

### M4 — Sharing and permissions
| # | Task | AC |
|---|---|---|
| 4.1 | `combineGrants` + `resolveModelAccess` | table test covering every §7.3 row incl. takedown and anonymous editor-link cap |
| 4.2 | `requireModelAccess` gate + boot route walk | non-shared user gets 404 on every repository route (parametrized); boot fails on an ungated test route |
| 4.3 | People shares by username (+ download), general access PATCH | viewer: graph 200, README PUT 403; `allow_download=0` → ticket 403; Private → 404; back to Specific people → restored |
| 4.4 | Share links (hash + ciphertext, viewer/editor, expiry, revoke) + resolve + `link_visits` | anonymous editor link → viewer; logged-in editor link → README PUT works; after visit, access without header; revoke → 404 |
| 4.5 | "공유받은 모델" + list/resolver matrix test | matrix passes |
| 4.6 | Web: `ShareDialog`, `PeoplePicker`, `/s/:token` | Playwright: share to @bob as viewer without download → Bob sees it without a download button; editor link logged out → viewer UI |

### M5 — Repository community: README editing, issues, stars
| # | Task | AC |
|---|---|---|
| 5.1 | README editor page with preview, template, conflict handling | Playwright: editor saves; a second tab saving afterwards gets the conflict notice; viewer sees no edit button |
| 5.2 | Issues API: create (number allocation), list/filter, get (marks read), patch (author vs editor rules), soft delete, lock | integration: concurrent creates get distinct numbers; viewer closes own issue but not others'; locked issue rejects viewer replies, accepts editor replies; counts stay consistent |
| 5.3 | Replies API | edit by author only; delete by author or editor; `reply_count` and `last_activity_at` update |
| 5.4 | `nodeRef` validation + graph badges + "이 노드에 이슈 열기" | unknown node → 422; Playwright: issue on Conv_23 shows a badge on that node; badge click filters the list |
| 5.5 | Activity feed + unread tracking + dashboard badge | integration: reply by Bob on Alice's issue → Alice unread; Alice opens it → read; own replies don't mark unread |
| 5.6 | Stars API + `star_count` + "내 스타" + profile stars | double PUT counts once; DELETE decrements; reconcile job fixes injected drift |
| 5.7 | Web: Issues tab, thread, composers, kind labels, star button | Playwright: open a 질문 issue, reply from a second account, close it, reopen as editor; star toggles and count updates |

### M6 — Discovery
| # | Task | AC |
|---|---|---|
| 6.1 | Public visibility + download choice + `published_at` + profiles | anonymous GET of public repository 200; view-only public → ticket 403 for strangers |
| 6.2 | View counting (`model_view_days`, daily salt, owner/editor excluded) + cleanup purge | same viewer twice a day → 1 row; owner views → 0 rows; rows older than 30 days purged |
| 6.3 | Trending job (§8.7) + qualification rule + fallback | fixture timeline: model A (stars yesterday from 3 users) outranks model B (more stars 6 days ago); single-user activity doesn't qualify; < 4 qualifying → fallback to most starred |
| 6.4 | `/api/explore` sections + 60 s cache + `/api/explore/search` (FULLTEXT incl. README, filters, sorts) | search `레즈넷` finds a repository whose README contains it; private never appears; `downloadable=true` excludes view-only |
| 6.5 | Web: Explore page, search, profile pages | Playwright: Explore shows trending section with the fixture's expected order; profile lists public repositories and stars |
| 6.6 | OG previews | public repository page has `og:title` = name; private returns generic tags |

### M7 — Moderation and safety
| # | Task | AC |
|---|---|---|
| 7.1 | Reports (repository or issue) + rate limit; admin role + `admin` CLI | report rows created; non-admin → 403 on admin routes |
| 7.2 | Takedown/restore + issue deletion by admin + resolver integration | taken-down: owner sees notice, others 404, Explore/trending/search exclude it |
| 7.3 | Admin UI | Playwright: admin dismisses one report, takes down a repository, deletes a spam issue |
| 7.4 | Security review pass (authz per route, upload limits, Markdown sanitization, headers, redaction, cookie flags, CSP) | checklist in the report, each item linked to a test |

### M-B — Brand (logo confirmed: `docs/brand/logo-final.jpg`)
| # | Task | AC |
|---|---|---|
| B.1 | Redraw the logo as SVG with real lettering (italic pastel-pink `mieru`, white inner line, `mieru-pink` outline, `lilac` offset shadow, four-point star as the i dot, glitter orbit swoosh, pastel sparkles, `ミエル`); compact mark (star + `m`) for favicon/app icons; final neutral tokens | SVGs in `docs/brand/` and `apps/web/public/`; contrast checks pass |
| B.2 | Apply to landing, Explore header, empty/loading/processing states, 404/takedown, profile header, OG frame, favicons | Playwright screenshots of each surface; `better-interface` findings resolved |
| B.3 | Release polish: `impeccable`, `kill-ai-slop` | findings addressed or waived in the report |

### M-R — Release
| # | Task | AC |
|---|---|---|
| R.1 | Dockerfile (multi-stage, non-root, healthcheck) | image built by Dokploy on freeride; build log in the report |
| R.2 | `docs/deploy.md`: Dokploy app + MySQL, env list, bind mount, limits, proxy chain/`TRUST_PROXY`, domain, Uptime Kuma monitor | `/api/health` healthy over `mieru.byeolki.me` (deploy with your approval) |
| R.3 | Backups + `docs/runbook.md` (restore, gc, takedown, secret rotation) | restore drill into a scratch DB succeeds |
| R.4 | `/api/health/deep` (disk, stuck jobs, backup age, trending age) | stubbed low disk → 503; liveness stays 200 |
| R.5 | Full e2e suite + production build | `npm run test:e2e` and `npm run build` pass |

### R2 (P1)
| # | Task | AC |
|---|---|---|
| M8 Versions | tus → `POST /versions` (same format), switcher, delete version, repository size meter; new version counts as a trending event | v2 increments; `?version=1` serves v1; push past 10 GiB → 413 at upload creation |
| M8.2 Diff | per-tensor hashes (parser v2), `GraphDiff`, diff coloring | changed-kernel fixture → exactly one `changed` node |
| M9 Workspaces | `002` migration, CRUD, members, move, resolver rows, sole-owner deletion guard | resolver table + list matrix still pass |
| M10 Demo | lazy `onnxruntime-web`, Range-chunked fetch via ticket, COOP/COEP `credentialless` on the demo route, WebGPU → WASM fallback; inputs by shape (`[1,3,H,W]` image, `[1,N]` numeric/CSV); outputs Top-5 with `labels.json` else raw values | Playwright (WASM, headless): MLP fixture output equals precomputed values; CNN + labels shows 5 bars |
| M11 Weights | `/tensors/stats` from recorded offsets (F32/F16/BF16, sidecar cache), histograms, download-gated filter grid | known-tensor histogram; filter tile count = out channels |

### R3 (P2)
| # | Task | AC |
|---|---|---|
| M12 Feature maps | server-side ONNX rewrite exposing intermediates (dtype from `value_info`), download-gated derived file, activation thumbnails during demo runs | rewritten fixture returns extra outputs in ORT-web; thumbnails on Conv nodes |
| M13 Design mode | `003` migration, block palette on React Flow, TS shape inference with inline errors, PyTorch `nn.Sequential` export, save and share through the same resolver | shape-inference table tests; exported code snapshot; Playwright flags then clears a bad `in_features` |

---

## 11. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest `unit` | parsers (valid, malformed, fuzz, limits, memory), grouping/LOD, palette, stats, `combineGrants`, tokens, username generation, Markdown sanitization, trending score, view hash, path builder, config |
| Integration | Vitest `integration` + `app.inject()` + MySQL 8.4 (`mieru_test`) + temp `STORAGE_DIR` | every route; tus flows; job runner recovery; scheduler locks; rate limits (injected clock); issues/stars counters under concurrency; trending fixtures; account deletion; list/resolver matrix |
| E2E | Playwright (chromium, headless) against Paseo `server` + `web` scripts | journeys from §10 ACs; second accounts and anonymous visitors via `browser.newContext()`; light/dark baselines |

Rules: injected clock for expiry/lockout/grace/trending; fixtures generated by script; `globalSetup` recreates the test schema; tables truncated per file; integration runs with `fileParallelism: false`. No watch modes, nothing headed.

---

## 12. Verification

### 12.1 One-time environment setup on m4pro (approved in round 1; heavy, run once)
```bash
brew install mysql@8.4
brew services start mysql@8.4          # background service bound to 127.0.0.1
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
npm run test:e2e
paseo script stop web
paseo script stop server

STORAGE_DIR=/tmp/mieru-verify npm run storage:gc -w @mieru/server -- --dry-run
npm run build                                      # moderate CPU, ~1 min
```

### 12.3 Needs manual check
- Deployment on freeride via Dokploy at `mieru.byeolki.me`, the Cloudflare → Traefik → app chain, a 1+ GiB upload over the public domain, and the Uptime Kuma monitor.
- WebGPU demo backend (headless runs WASM).
- Graph layout quality on real models (ResNet-50, BERT-base, a small LLM export).
- Trending feel with real traffic (weights in §8.7 are a starting point).
- Brand surfaces against the confirmed logo.

---

## 13. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Hand-written ONNX wire scanner bugs | Small surface; cross-checked against full `protobufjs` decodes of small fixtures; fuzzed |
| R2 | React Flow too slow on huge graphs | LOD caps visible nodes; M3.7 spike decides on the Model Explorer fallback |
| R3 | freeride RAM shared (15 GiB) | Concurrency 1, streaming everything, 2 GiB container limit, per-job RSS logged |
| R4 | Cloudflare limits (100 MB bodies, 100 s) and caching | tus chunks, async processing, `no-store` on `/api`, verify large downloads aren't buffered (R.2) |
| R5 | Disk fills (`/data` shared, no per-user total) | Free-space reserve, deep health alert, upload rate limit, dedup, gc, admin takedown |
| R6 | Abuse on public content: malware-laden files, spam issues, star/view manipulation | Files never executed server-side; downloads `attachment` + `nosniff`; Markdown without raw HTML; issue/star rate limits; trending needs ≥ 2 distinct users and ignores owner/editor activity; reports + takedown |
| R7 | Forgotten passwords are unrecoverable | Accepted (rounds 2 and 4); stated at signup |
| R8 | Signup reveals taken emails | Rate limit; emails never public |
| R9 | No notifications outside the app; owners may miss issues | Activity feed with unread badge on the dashboard; header badge on every page |
| R10 | Trending with little traffic looks empty or noisy | Fallback to most starred; weights tunable without migrations |
| R11 | Username squatting/impersonation | Reserved list, 30-day hold after rename/deletion, takedown covers abusive profiles |
| R12 | In-memory rate limits and Explore cache reset on deploy | Single instance; acceptable |
| R13 | ORT-web threading needs COOP/COEP (P1) | `credentialless` COEP on the demo route only |

---

## 14. Open questions for the user

None. Round 4 decisions are applied throughout. Earlier logo drafts in `docs/brand/drafts/` stay as reference only.
