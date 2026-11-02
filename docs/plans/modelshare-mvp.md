# modelshare — MVP implementation plan

Status: draft, awaiting answers to [Open questions](#13-open-questions-for-the-user)
Date: 2026-11-02

modelshare is a web service for uploading neural-network model files, visualizing them, and sharing them with fine-grained access control. Auth and sharing are the core of the service; visualization is why users come.

---

## 0. Decision log (self-grill)

Decisions settled while writing this plan. "Given" = decided by the task brief. Anything the user still has to decide is in §13.

| # | Decision | Answer | Why | Confidence |
|---|---|---|---|---|
| D1 | Frontend build | Vite + React 19 + TypeScript (strict) SPA | Brief requires a React SPA; no SSR or SEO need (the app is behind auth, and share links don't need indexing). Vite gives the fastest dev loop and simple static output | high |
| D2 | Backend framework | **Fastify 5** + TypeScript | First-class TS types, schema-driven validation (zod type provider), `app.inject()` for integration tests without opening ports, official plugins for exactly what we need (`@fastify/multipart` streaming, `@fastify/rate-limit`, `@fastify/cookie`, `@fastify/helmet`), and proper async error handling. Express 5 would also work but needs more glue | high |
| D3 | Package manager / monorepo | pnpm workspaces (no Turborepo/Nx) | Strict dependency isolation and native workspace support; three packages don't need a task runner. See Q11 (your other projects use npm) | medium |
| D4 | Validation and shared types | `zod` schemas in `packages/shared`, used by both server (route schemas) and web (forms, response parsing) | One source of truth for API contracts | high |
| D5 | DB access | `mysql2/promise` pool, `pool.execute()` (prepared statements) only, small `db.query<T>()` / `withTransaction()` helpers, per-feature repository modules holding SQL strings | Given (raw SQL only) | high |
| D6 | Primary keys | `CHAR(36) CHARACTER SET ascii` UUIDv7 generated in the app | Non-enumerable IDs in URLs, readable in raw SQL sessions, time-ordered so InnoDB inserts stay roughly sequential. `BINARY(16)` saves space, but this service will have thousands of rows, not billions | medium |
| D7 | Token storage | Access token (JWT, 10 min) **in memory only**; refresh token (opaque, 256-bit) in an `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` cookie, stored as SHA-256 in MySQL | XSS cannot read either token; CSRF only matters for the cookie, which is only accepted on `/api/auth/refresh` and `/api/auth/logout`, and those are protected by SameSite=Strict + Origin check + JSON content type (§6.7) | high |
| D8 | Deployment topology | SPA and API served from **one origin** (reverse proxy: `/api/*` → Fastify, everything else → static `dist/`). Dev: Vite proxy `/api` → server | Makes SameSite=Strict cookies work and removes the need for CORS | high |
| D9 | Password hashing | argon2id via `argon2` (m=19 MiB, t=2, p=1, OWASP baseline) | Memory-hard; ships prebuilt binaries | high |
| D10 | OAuth client | Hand-rolled (≈150 LOC) with `fetch` + `jose` (Google id_token verification), not Passport | Two providers; PKCE + state + nonce are easier to audit than a strategy framework | medium |
| D11 | OAuth account linking | Never auto-link by email. If a provider email matches an existing local account, ask the user to log in and link from Settings | Auto-linking by email is a classic account-takeover vector | high |
| D12 | Email verification | Required before a user can **receive** direct shares or comment; uses a `Mailer` interface (SMTP in prod, file outbox in dev/test) | Shares are addressed by email; without verification, anyone could register `victim@corp.com` and receive models meant for the victim | high |
| D13 | Upload handling | `@fastify/multipart` streamed with `pipeline()` to `STORAGE_DIR/tmp/<uuid>.part` (the "multer diskStorage equivalent"), SHA-256 computed while streaming, validated + parsed, then `rename()` into `models/<uuid>` | Given (stream to disk) + atomic publish | high |
| D14 | Parsing location | Synchronous within the upload request, inside a `worker_threads` worker with a 30 s timeout and `resourceLimits` | Users get immediate success/failure; a malformed or hostile file can't block the event loop or exhaust heap; no job queue needed at MVP scale | medium |
| D15 | Parsed-result cache | Gzipped sidecar JSON on disk `STORAGE_DIR/parsed/<storage_key>.v<parserVersion>.json.gz`; small summary columns in MySQL | Large graphs are several MB of JSON, which strains `max_allowed_packet` and bloats the buffer pool; the dashboard only needs summaries. A version in the filename means a parser upgrade re-parses lazily | high |
| D16 | Graph renderer | React Flow (`@xyflow/react`) + **elkjs** (compound-node layout, run in a Web Worker) + prefix-based collapsing | elkjs supports nested groups, which is what collapsing needs; dagre doesn't. React Flow is reusable for comments anchored on nodes and P2 design mode. Model Explorer kept as a measured fallback (§8.6) | medium |
| D17 | UI kit | Tailwind CSS v4 + shadcn/ui (Radix), TanStack Query, React Router v7 (data mode), Recharts | Matches the stack of your other React project; accessible primitives. See Q12 | medium |
| D18 | Original-file download | `POST /api/models/:id/file-ticket` returns a 60 s signed URL → `GET /api/models/:id/file?ticket=…` streams the file | A plain `<a href>` can't send `Authorization`, and buffering 200 MB into a JS Blob is wasteful. The ticket is scoped to (principal, model, file) and checked against the same permission service | high |
| D19 | Share-link token storage | SHA-256 hash for lookup **+** AES-256-GCM ciphertext (key from env) so the owner can copy the link again later | Drive-like "copy link anytime" UX without exposing usable tokens if only the DB leaks | medium |
| D20 | Share-link role cap | Links grant `viewer` or `commenter` only, never `editor`. Anonymous link visitors are capped at `viewer` (commenting needs an identity) | Least privilege; editor rights should belong to named people. See Q8 | medium |
| D21 | No-access response | `404 Not Found` (not 403) when the principal has no role on the model; `403` only when they have a role that is too low (or no download right) | Doesn't leak whether a model ID exists to outsiders | high |
| D22 | Demo vs. download | The in-browser demo (P1) needs the model bytes, so it is available **only when `canDownload` is true** | Running ORT-web in the browser means handing over the file; pretending otherwise would be security theatre | high |
| D23 | Deletion order | Delete DB rows in a transaction first, then unlink files; failures are logged and swept by `storage:gc` | An orphan file is harmless; a DB row pointing at a missing file is a user-facing error | high |
| D24 | Migrations | Forward-only numbered `.sql` files, runner records `(version, name, sha256 checksum)` in `schema_migrations`, aborts on checksum drift | Given. MySQL DDL auto-commits, so files aren't transactional: one logical change per file | high |
| D25 | Test runner | Vitest (unit + integration projects), Playwright headless for e2e | One runner for server and web; Playwright is headless by default and matches your testing policy | high |

---

## 1. Goal and non-goals

### Goal (MVP = P0)
A deployable single-server web app where a user can:
1. Sign up / log in with email + password, GitHub, or Google, with secure session handling.
2. Upload an `.onnx` or `.safetensors` file (≤ 200 MB, configurable) and immediately see:
   - ONNX: an interactive computation graph (op-type colors, node inspector, collapsible blocks).
   - safetensors: a module hierarchy tree with shapes, dtypes, and parameter counts.
   - A summary header and a Stats tab.
3. Share the model as private / specific users / anyone with the link, with viewer / commenter / editor roles, expiring links, and a per-link "allow original download" toggle. All checks happen server-side in one service.
4. See "My models" and "Shared with me" on a dashboard.

### Non-goals (MVP)
- `.pt` / `.pth` / `.bin` / pickle / `.h5` / TFLite / GGUF support. `.pt` uploads get a clear rejection with a link to conversion guidance (`torch.onnx.export`, `safetensors.torch.save_file`).
- ONNX models with external data (`.onnx` + `.data`, used for > 2 GB models).
- Server-side shape inference (we show intermediate shapes only if the file carries `value_info`; the UI suggests running `onnx.shape_inference` before upload).
- Public discovery / gallery / search across users (see Q7).
- Object storage, multi-server, horizontal scaling, CDN.
- Server-side inference of any kind.
- Native mobile apps, i18n (English UI only at MVP), billing.
- Admin console (operators use SQL + scripts).

---

## 2. Architecture overview

```mermaid
flowchart LR
  subgraph Browser
    SPA["React SPA (Vite build)\nTanStack Query · React Router\nReact Flow + elkjs (worker)"]
    MEM[("access token\n(in memory)")]
    SPA --- MEM
  end

  subgraph Server["Single server"]
    RP["Reverse proxy (Caddy/nginx)\nTLS · static dist/ · /api → :3000"]
    API["Fastify API (Node 22 LTS)"]
    W["Parser worker\n(worker_threads, 30 s timeout)"]
    DB[("MySQL 8.0+")]
    FS[("STORAGE_DIR\n tmp/ · models/ · parsed/")]
  end

  GH["GitHub OAuth"]
  GO["Google OAuth/OIDC"]
  SMTP["SMTP (prod)"]

  SPA -- "HTTPS, Bearer access token\nrefresh cookie only on /api/auth/*" --> RP --> API
  API --> DB
  API -- "stream upload / download" --> FS
  API -- "parse(file path)" --> W --> FS
  API -- "code + PKCE verifier" --> GH & GO
  API --> SMTP
```

### Request flows

**Upload → parse → render**
1. SPA posts `multipart/form-data` (XHR for upload progress) to `POST /api/models`.
2. Fastify checks auth + rate limit + free disk space, streams the file part to `tmp/<uuid>.part` with a size cap, hashing as it goes.
3. Extension + magic-byte check (§8.1). Bad → delete tmp, `422`.
4. The worker parses the file into a `ParsedModel` DTO (§8.4) under a timeout. Malformed/timeout → delete tmp, `422`.
5. Writes `parsed/<key>.v<N>.json.gz`, renames tmp → `models/<key>`, inserts `models` + `model_versions` + `model_files` in one transaction. On DB failure, both files are deleted.
6. `201` with model metadata. The SPA navigates to `/m/:id`, fetches `GET /api/models/:id/graph` (gzipped JSON, `ETag` = storage key + parser version), and renders.

**Rendering**
- ONNX: DTO → grouping tree (by node name prefix) → visible set chosen by level of detail → elkjs layout in a Web Worker → React Flow canvas.
- safetensors: DTO already contains the module tree → virtualized tree view.
- Stats are computed client-side from the DTO.

**Permission check (every model route)**
`preHandler: requireModelAccess(minRole, { download? })` → `accessService.resolve(modelId, principal)` → `request.modelAccess = { role, canDownload, via }` or `404`.

---

## 3. Repo layout and tooling

```
modelshare/
├─ apps/
│  ├─ server/
│  │  ├─ migrations/              # 001_init.sql, 002_….sql (forward-only)
│  │  ├─ scripts/
│  │  │  ├─ migrate.ts            # migration runner
│  │  │  ├─ storage-gc.ts         # orphan-file cleanup (dry-run by default)
│  │  │  └─ make-fixtures.ts      # generates tiny ONNX/safetensors test files
│  │  ├─ src/
│  │  │  ├─ app.ts                # buildApp(config) → FastifyInstance (used by tests)
│  │  │  ├─ server.ts             # listen()
│  │  │  ├─ config.ts             # zod-validated env
│  │  │  ├─ db/                   # pool.ts, query.ts (query/withTransaction)
│  │  │  ├─ plugins/              # auth.ts, model-access.ts, rate-limits.ts, errors.ts
│  │  │  ├─ features/
│  │  │  │  ├─ auth/              # routes, service, tokens, oauth/{github,google}.ts, repo
│  │  │  │  ├─ users/
│  │  │  │  ├─ models/            # routes, service, repo, upload.ts, download.ts
│  │  │  │  ├─ sharing/           # access-service.ts (THE permission resolver), shares, links
│  │  │  │  ├─ comments/          # P1
│  │  │  │  └─ workspaces/        # P1
│  │  │  ├─ parsing/
│  │  │  │  ├─ worker.ts          # worker entry, dispatches by format
│  │  │  │  ├─ run-parser.ts      # spawn + timeout + resourceLimits
│  │  │  │  ├─ onnx/              # onnx.proto (vendored, pinned tag), generated onnx.js/.d.ts, parse-onnx.ts
│  │  │  │  └─ safetensors/       # parse-safetensors.ts, build-tree.ts
│  │  │  ├─ storage/              # paths.ts (UUID-only path builder), disk.ts
│  │  │  └─ mail/                 # mailer.ts (SMTP | file outbox)
│  │  └─ test/                    # integration tests, fixtures/
│  └─ web/
│     ├─ src/
│     │  ├─ main.tsx, router.tsx
│     │  ├─ lib/                  # api-client.ts, auth-store.ts, query-client.ts
│     │  ├─ features/
│     │  │  ├─ auth/  dashboard/  upload/  model-view/  sharing/  settings/
│     │  │  └─ model-view/graph/  # OnnxGraphView, layout.worker.ts, grouping.ts, op-categories.ts
│     │  └─ components/ui/        # shadcn components
│     ├─ e2e/                     # Playwright specs
│     └─ playwright.config.ts
├─ packages/
│  └─ shared/                     # zod schemas, API DTO types, ParsedModel types, role helpers
├─ docs/plans/
├─ paseo.json                     # workspace scripts: server, web (bind to $PASEO_PORT)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.js               # flat config, typescript-eslint strict-type-checked
├─ .prettierrc
├─ vitest.workspace.ts            # projects: unit, integration
└─ .env.example
```

**Tooling**
- Node 22 LTS (`.nvmrc`, `engines`), pnpm 9+ (`packageManager` field).
- TypeScript 5.x strict, `noUncheckedIndexedAccess`, ESM throughout. Server runs with `tsx` in dev and is compiled with `tsc` for prod.
- ESLint (flat config, `typescript-eslint` strict-type-checked, `eslint-plugin-react-hooks`), Prettier (default config + `prettier-plugin-tailwindcss`).
- Vitest (unit + integration), Playwright (chromium, headless).
- Root scripts: `lint`, `format:check`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `build`, `db:migrate`, `storage:gc`.
- Server libs: `fastify`, `@fastify/multipart`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/helmet`, `fastify-type-provider-zod`, `mysql2`, `argon2`, `jose`, `protobufjs` (+ `protobufjs-cli` dev), `nodemailer`, `pino` (Fastify's logger), `uuid` (v7).
- Web libs: `react`, `react-router`, `@tanstack/react-query`, `@tanstack/react-virtual`, `@xyflow/react`, `elkjs`, `recharts`, `tailwindcss`, shadcn/ui (Radix), `zod`. P1: `onnxruntime-web`.

---

## 4. MySQL schema

MySQL 8.0+ (CHECK constraints, `utf8mb4_0900_ai_ci`). All timestamps are `DATETIME(3)` in UTC (pool option `timezone: 'Z'`). The app pool uses `multipleStatements: false`; only the migration runner opens a separate connection with `multipleStatements: true`.

### `migrations/001_init.sql` (P0)

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
  email               VARCHAR(320) NOT NULL,
  email_normalized    VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,  -- trimmed + lowercased
  email_verified_at   DATETIME(3) NULL,
  password_hash       VARCHAR(255) NULL,                          -- NULL for OAuth-only accounts
  display_name        VARCHAR(100) NOT NULL,
  avatar_url          VARCHAR(2048) NULL,
  failed_login_count  INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME(3) NULL,
  password_changed_at DATETIME(3) NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email_normalized (email_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE oauth_accounts (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id           CHAR(36) CHARACTER SET ascii NOT NULL,
  provider          ENUM('github','google') NOT NULL,
  provider_user_id  VARCHAR(255) CHARACTER SET ascii NOT NULL,
  provider_email    VARCHAR(320) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_oauth_provider_subject (provider, provider_user_id),
  UNIQUE KEY uq_oauth_user_provider (user_id, provider),
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE refresh_tokens (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id           CHAR(36) CHARACTER SET ascii NOT NULL,
  family_id         CHAR(36) CHARACTER SET ascii NOT NULL,   -- one family per login session
  token_hash        BINARY(32) NOT NULL,                     -- SHA-256 of the opaque token
  replaced_by_id    CHAR(36) CHARACTER SET ascii NULL,       -- set when rotated
  rotated_at        DATETIME(3) NULL,
  revoked_at        DATETIME(3) NULL,
  revoke_reason     ENUM('logout','logout_all','reuse_detected','password_changed') NULL,
  expires_at        DATETIME(3) NOT NULL,                    -- per-token (30 d)
  family_expires_at DATETIME(3) NOT NULL,                    -- absolute session cap (90 d)
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

CREATE TABLE email_tokens (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  purpose     ENUM('verify_email','password_reset') NOT NULL,
  token_hash  BINARY(32) NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  used_at     DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_token_hash (token_hash),
  KEY ix_email_tokens_user_purpose (user_id, purpose),
  CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE models (
  id                  CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_id            CHAR(36) CHARACTER SET ascii NOT NULL,
  name                VARCHAR(200) NOT NULL,
  description         TEXT NULL,
  visibility          ENUM('private','users','link') NOT NULL DEFAULT 'private',
  current_version_id  CHAR(36) CHARACTER SET ascii NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_models_owner_updated (owner_id, updated_at),
  -- RESTRICT: deleting a user must go through the service so files get removed too
  CONSTRAINT fk_models_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Created in P0 so every upload is "version 1"; the versions UI is P1.
CREATE TABLE model_versions (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  version_number  INT UNSIGNED NOT NULL,
  note            VARCHAR(500) NULL,
  created_by      CHAR(36) CHARACTER SET ascii NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_versions_model_number (model_id, version_number),
  KEY ix_versions_created_by (created_by),
  CONSTRAINT fk_versions_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_versions_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE models
  ADD CONSTRAINT fk_models_current_version
  FOREIGN KEY (current_version_id) REFERENCES model_versions (id) ON DELETE SET NULL;

CREATE TABLE model_files (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  version_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  kind            ENUM('model','labels') NOT NULL,           -- 'labels' = labels.json (P1 demo)
  format          ENUM('onnx','safetensors','labels_json') NOT NULL,
  storage_key     CHAR(36) CHARACTER SET ascii NOT NULL,     -- UUID file name on disk
  original_name   VARCHAR(255) NOT NULL,                     -- display / Content-Disposition only
  size_bytes      BIGINT UNSIGNED NOT NULL,
  sha256          BINARY(32) NOT NULL,
  parser_version  SMALLINT UNSIGNED NULL,
  total_params    BIGINT UNSIGNED NULL,
  node_count      INT UNSIGNED NULL,                         -- ONNX nodes
  tensor_count    INT UNSIGNED NULL,                         -- initializers / safetensors tensors
  summary         JSON NULL,                                 -- ModelSummary (§8.4), small
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_model_files_storage_key (storage_key),
  UNIQUE KEY uq_model_files_version_kind (version_id, kind),
  CONSTRAINT fk_model_files_version FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE,
  CONSTRAINT chk_model_files_kind_format CHECK (
    (kind = 'model' AND format IN ('onnx','safetensors')) OR
    (kind = 'labels' AND format = 'labels_json')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE shares (
  model_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  role        ENUM('viewer','commenter','editor') NOT NULL,
  created_by  CHAR(36) CHARACTER SET ascii NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (model_id, user_id),
  KEY ix_shares_user (user_id, created_at),
  CONSTRAINT fk_shares_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE share_links (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  token_hash        BINARY(32) NOT NULL,                 -- SHA-256(token), used for lookup
  token_ciphertext  VARBINARY(128) NOT NULL,             -- AES-256-GCM(iv|tag|ct), so the owner can copy it again
  label             VARCHAR(100) NULL,
  role              ENUM('viewer','commenter') NOT NULL DEFAULT 'viewer',
  allow_download    TINYINT(1) NOT NULL DEFAULT 0,
  expires_at        DATETIME(3) NULL,                    -- NULL = no expiry
  revoked_at        DATETIME(3) NULL,
  last_used_at      DATETIME(3) NULL,
  created_by        CHAR(36) CHARACTER SET ascii NOT NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_share_links_token_hash (token_hash),
  KEY ix_share_links_model (model_id),
  CONSTRAINT fk_share_links_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_share_links_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### `migrations/002_comments.sql` (P1)

```sql
CREATE TABLE comments (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  version_id   CHAR(36) CHARACTER SET ascii NULL,       -- version the comment was written against
  node_ref     VARCHAR(512) NULL,                       -- ONNX node name or safetensors module path; NULL = model-level
  parent_id    CHAR(36) CHARACTER SET ascii NULL,       -- one level of replies
  author_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  body         TEXT NOT NULL,
  resolved_at  DATETIME(3) NULL,
  resolved_by  CHAR(36) CHARACTER SET ascii NULL,
  deleted_at   DATETIME(3) NULL,                        -- soft delete keeps reply threads intact
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_comments_model_node (model_id, node_ref(191), created_at),
  KEY ix_comments_parent (parent_id),
  CONSTRAINT fk_comments_model   FOREIGN KEY (model_id)   REFERENCES models (id)          ON DELETE CASCADE,
  CONSTRAINT fk_comments_version FOREIGN KEY (version_id) REFERENCES model_versions (id)  ON DELETE SET NULL,
  CONSTRAINT fk_comments_parent  FOREIGN KEY (parent_id)  REFERENCES comments (id)        ON DELETE CASCADE,
  CONSTRAINT fk_comments_author  FOREIGN KEY (author_id)  REFERENCES users (id)           ON DELETE CASCADE,
  CONSTRAINT fk_comments_resolver FOREIGN KEY (resolved_by) REFERENCES users (id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### `migrations/003_workspaces.sql` (P1)

```sql
CREATE TABLE workspaces (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  name        VARCHAR(100) NOT NULL,
  created_by  CHAR(36) CHARACTER SET ascii NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_workspaces_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
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

P1 versions, demo, and weight visualization need no new tables: versions use `model_versions`, `labels.json` uses `model_files.kind='labels'`, and tensor statistics are cached as sidecars (`parsed/<key>.stats.v<N>.json.gz`). P2 design mode adds `004_designs.sql` (`designs(id, owner_id, name, spec JSON, forked_from_id, visibility, …)`), to be specified when P2 starts.

**mysql2 gotcha:** with `execute()`, `LIMIT ?`/`OFFSET ?` parameters must be bound as strings on MySQL 8.0.22+ (`ER_WRONG_ARGUMENTS` otherwise). The `query()` helper converts validated integers for those positions; there is a unit test for it.

---

## 5. REST API

Conventions
- JSON bodies; errors are `{ "error": { "code": "string", "message": "string", "details"?: {} } }`.
- Auth column: **none** = public; **user** = valid `Authorization: Bearer <access>`; **cookie** = refresh cookie + Origin check; **principal** = user *or* a valid `X-Share-Link: <token>` header (anonymous allowed).
- Role column = minimum effective role on the model (§7). Missing role → `404`.
- Lists use cursor pagination: `?limit=20&cursor=<opaque>` → `{ items, nextCursor }`.

### Auth
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/api/auth/signup` | none (rate-limited) | `{ email, password, displayName }` | `201 { accessToken, user }` + sets refresh cookie; sends verification email |
| POST | `/api/auth/login` | none (rate-limited, lockout) | `{ email, password }` | `200 { accessToken, user }` + cookie · `401 invalid_credentials` · `429 locked { retryAfterSec }` |
| POST | `/api/auth/refresh` | cookie | — | `200 { accessToken, user }` + rotated cookie · `401` |
| POST | `/api/auth/logout` | cookie | — | `204`, revokes family, clears cookie |
| POST | `/api/auth/logout-all` | user | — | `204`, revokes all of the user's families |
| POST | `/api/auth/oauth/:provider/authorize` | none (`intent=login`) / user (`intent=link`) | `{ intent: 'login'\|'link', returnTo?: string }` | `200 { authorizeUrl }` + sets `ms_oauth` tx cookie |
| GET | `/api/auth/oauth/:provider/callback` | tx cookie | `?code&state` (from provider) | `302 /auth/callback?status=ok\|error&code=…` + refresh cookie on success |
| POST | `/api/auth/verify-email/request` | user | — | `204` (rate-limited) |
| POST | `/api/auth/verify-email/confirm` | none | `{ token }` | `204` |
| POST | `/api/auth/password-reset/request` | none (rate-limited) | `{ email }` | `204` always (no enumeration) |
| POST | `/api/auth/password-reset/confirm` | none | `{ token, newPassword }` | `204`, revokes all refresh families |

### Me / users
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/me` | user | — | `{ id, email, emailVerified, displayName, avatarUrl, hasPassword, oauthProviders: ['github'] }` |
| PATCH | `/api/me` | user | `{ displayName? }` | updated user |
| POST | `/api/me/password` | user | `{ currentPassword?, newPassword }` (current required if one is set) | `204`, revokes the other families |
| DELETE | `/api/me/oauth/:provider` | user | — | `204` · `409` if it's the last login method |
| GET | `/api/me/sessions` | user | — | `[{ familyId, userAgent, ip, createdAt, lastUsedAt, current }]` |
| DELETE | `/api/me/sessions/:familyId` | user | — | `204` |

### Models
| Method | Path | Auth | Role | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/models?scope=owned\|shared` | user | — | pagination | `{ items: ModelListItem[], nextCursor }` |
| POST | `/api/models` | user (rate-limited) | — | multipart: `file` (1), `name?`, `description?` | `201 ModelDetail` · `413` · `415 unsupported_format` (with `hint` for `.pt`) · `422 invalid_model { reason }` · `507 insufficient_storage` |
| GET | `/api/models/:id` | principal | viewer | — | `ModelDetail` (incl. `myAccess: { role, canDownload, via }`) |
| PATCH | `/api/models/:id` | user | editor (`visibility`: owner) | `{ name?, description?, visibility? }` | `ModelDetail` |
| DELETE | `/api/models/:id` | user | owner | — | `204` (rows deleted, then files) |
| GET | `/api/models/:id/graph?version=` | principal | viewer | — | `ParsedModel` (gzip, `ETag`, `Cache-Control: private, max-age=0, must-revalidate`) |
| POST | `/api/models/:id/file-ticket` | principal | viewer + canDownload | `{ fileKind?: 'model'\|'labels', version? }` | `{ url, expiresAt }` |
| GET | `/api/models/:id/file?ticket=` | ticket | (re-checked) | — | `200` stream, `Content-Disposition: attachment`, `application/octet-stream`, `nosniff` |

`ModelListItem = { id, name, format, ownerName, myRole, sizeBytes, totalParams, updatedAt, visibility }`
`ModelDetail = ModelListItem & { description, owner: {id, displayName, avatarUrl}, currentVersion: { id, number, createdAt, file: { originalName, sizeBytes, sha256, summary } }, myAccess }`

### Sharing (owner only in MVP, see Q6)
| Method | Path | Auth | Role | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/models/:id/shares` | user | owner | — | `[{ user: {id, email, displayName, avatarUrl}, role, createdAt }]` |
| PUT | `/api/models/:id/shares` | user | owner | `{ email, role }` (upsert) | `200 Share` · `404 user_not_found` · `409 email_not_verified` |
| DELETE | `/api/models/:id/shares/:userId` | user | owner | — | `204` |
| GET | `/api/models/:id/share-links` | user | owner | — | `[{ id, url, label, role, allowDownload, expiresAt, revokedAt, lastUsedAt }]` (url decrypted) |
| POST | `/api/models/:id/share-links` | user | owner | `{ role, allowDownload, expiresAt?: ISO \| null, label? }` | `201 ShareLink` (includes `url`) |
| PATCH | `/api/models/:id/share-links/:linkId` | user | owner | `{ role?, allowDownload?, expiresAt?, label? }` | `ShareLink` |
| DELETE | `/api/models/:id/share-links/:linkId` | user | owner | — | `204` (sets `revoked_at`) |
| GET | `/api/share-links/resolve` | `X-Share-Link` (rate-limited) | — | — | `{ modelId, role, canDownload }` · `404` for unknown/expired/revoked/model-not-`link` (one response for all) |

### P1
| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/api/models/:id/comments?nodeRef=` | principal | viewer | threads |
| POST | `/api/models/:id/comments` | user (verified) | commenter | `{ nodeRef?, parentId?, body }` |
| PATCH | `/api/comments/:commentId` | user | author (body) / editor (resolve) | `{ body?, resolved? }` |
| DELETE | `/api/comments/:commentId` | user | author or owner | soft delete |
| GET | `/api/models/:id/versions` | principal | viewer | list |
| POST | `/api/models/:id/versions` | user | editor | multipart, same validation as upload; format must match |
| GET | `/api/models/:id/diff?from=&to=` | principal | viewer | `GraphDiff` (§8.5) |
| PUT | `/api/models/:id/labels` | user | editor | upload `labels.json` (≤ 1 MB, JSON array of ≤ 100k strings) |
| GET | `/api/models/:id/tensors/stats?name=` | principal | viewer (see Q5) | histogram (64 bins), min/max/mean/std; conv filter grid data |
| CRUD | `/api/workspaces`, `/api/workspaces/:id/members` | user | ws owner for writes | |
| POST | `/api/models/:id/move` | user | owner + ws member | `{ workspaceId \| null }` |

---

## 6. Auth flows

### 6.1 Token model
- **Access token**: JWT HS256 (`jose`), `exp = 10 min`, claims `{ sub: userId, sid: familyId, iat, exp, iss, aud }`. Secret `JWT_SECRET` (≥ 32 random bytes). Held in a module-level variable in the SPA, never in storage.
- **Refresh token**: 32 random bytes, base64url. Cookie `ms_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=30d`. DB keeps `SHA-256(token)`.
- Per-token expiry 30 days (sliding via rotation), absolute family expiry 90 days.
- Access tokens are stateless, so logout takes effect for API calls within ≤ 10 min. Accepted trade-off.

### 6.2 Signup
1. Validate `{email, password (10–128 chars), displayName (1–100)}` with zod. Normalize email (trim + lowercase).
2. `409 email_taken` if `email_normalized` exists (accepted enumeration on signup; rate-limited; see risk R8).
3. `argon2id` hash → `INSERT users`.
4. Create `email_tokens(purpose='verify_email', 24 h)`, send the mail with `APP_ORIGIN/verify-email#token=…` (fragment keeps it out of logs and Referer).
5. Issue a session (§6.4 step "issue") → `201 { accessToken, user }` + cookie. Unverified users can upload and view; they can't receive shares or comment.

### 6.3 Login + brute-force protection
1. IP rate limit (10/min). Look up the user by `email_normalized`.
2. If `locked_until > now` → `429 { retryAfterSec }` (still runs a dummy argon2 verify so timing stays flat).
3. Unknown user → verify against a constant dummy hash → `401 invalid_credentials`.
4. Wrong password → `failed_login_count += 1`. When `count ≥ 5`: `locked_until = now + min(2^(count-5), 30) minutes`. → `401`.
5. Success → reset counter and `locked_until`, rehash if argon2 params changed, issue a session.
Lockout is per account and capped at 30 min, so an attacker can slow a victim down but not lock them out permanently. The per-IP limit throttles spraying.

### 6.4 Session issue / refresh rotation / reuse detection
**Issue**: `familyId = uuidv7()`, insert `refresh_tokens{ family_id, token_hash, expires_at=now+30d, family_expires_at=now+90d, ua, ip }`, set the cookie, sign an access token with `sid=familyId`.

**Refresh** (`POST /api/auth/refresh`), in one transaction:
1. CSRF checks (§6.7). Read the cookie → `hash`. `SELECT … FROM refresh_tokens WHERE token_hash = ? FOR UPDATE`.
2. Not found → `401`, clear cookie.
3. `revoked_at IS NOT NULL` → `401`, clear cookie.
4. `replaced_by_id IS NOT NULL` (already rotated):
   - **Grace window**: if `rotated_at > now - 10 s` → `401 stale_refresh` *without* revoking. This is a benign race (two tabs, flaky network); the browser already holds the newer cookie from the winning response, and the client retries once.
   - Otherwise → **reuse detected**: `UPDATE refresh_tokens SET revoked_at=now, revoke_reason='reuse_detected' WHERE family_id=? AND revoked_at IS NULL`, log a security event, `401`, clear cookie.
5. `expires_at < now` or `family_expires_at < now` → `401`.
6. Load the user; if `password_changed_at > token.created_at` → revoke family, `401`.
7. Insert the new token (same family, `family_expires_at` copied), set `replaced_by_id`/`rotated_at` on the old one, commit, set cookie, return `{ accessToken, user }`.

**Client side**: one in-flight refresh per tab (shared promise) plus cross-tab serialization with `navigator.locks.request('ms-refresh', …)`. The API client retries a request once after a 401 with a successful refresh. On app boot, the SPA calls `/refresh` to restore the session.

### 6.5 Logout
`POST /api/auth/logout`: CSRF checks, revoke the cookie's family (`revoke_reason='logout'`), clear the cookie, `204`. The SPA drops the in-memory access token and clears the TanStack Query cache. `logout-all` revokes every family of the user.

### 6.6 OAuth (GitHub, Google) — Authorization Code + PKCE
1. SPA → `POST /api/auth/oauth/:provider/authorize { intent, returnTo }`. `returnTo` must be a relative path matching `^/[A-Za-z0-9/_\-?=&#.]*$`, otherwise `/dashboard`.
2. Server generates `state` (32 B), `code_verifier` (32 B base64url), `code_challenge = BASE64URL(SHA256(verifier))`, and for Google a `nonce`. It stores `{ provider, state, verifier, nonce, intent, userId?, returnTo, exp: +10 min }` in a **signed** cookie `ms_oauth` (`HttpOnly; Secure; SameSite=Lax; Path=/api/auth/oauth; Max-Age=600`). Lax is required because the callback is a cross-site top-level redirect from the provider.
3. Returns `authorizeUrl` with `response_type=code, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method=S256` (+ `nonce` for Google). Scopes: GitHub `read:user user:email`; Google `openid email profile`. The SPA does `location.assign(authorizeUrl)`.
4. Callback `GET /api/auth/oauth/:provider/callback?code&state`: verify the cookie signature, expiry, provider, and `state` (constant-time compare). Clear the tx cookie no matter what.
5. Exchange the code at the token endpoint with `code_verifier` + client secret (server-side confidential client).
6. Identity:
   - Google: verify `id_token` with `jose` against Google JWKS (`iss`, `aud`, `exp`, `nonce`); use `sub`, `email`, `email_verified`.
   - GitHub: `GET /user` (id, login, avatar) + `GET /user/emails` → primary **verified** email.
7. Resolution:
   - `intent=link`: the tx cookie carries `userId`. If `(provider, subject)` already belongs to another user → `error=already_linked`; else insert `oauth_accounts`.
   - `oauth_accounts` row exists → log in as that user.
   - Else, if the provider email matches an existing user → `error=account_exists` (UI: "log in with your password, then link GitHub in Settings").
   - Else create the user (`password_hash NULL`, `email_verified_at = now` if the provider says it's verified) + `oauth_accounts`.
8. Issue a session (cookie only), `302 /auth/callback?status=ok&returnTo=…`. The SPA callback page calls `/api/auth/refresh` to get the access token. No token ever travels in a URL.

### 6.7 CSRF strategy
- Every non-auth API route authenticates **only** through the `Authorization` header, which browsers never attach automatically → CSRF-immune.
- Cookie-authenticated routes (`/api/auth/refresh`, `/api/auth/logout`):
  1. `SameSite=Strict` cookie scoped to `Path=/api/auth`.
  2. `Origin` header must equal `APP_ORIGIN` (reject if missing).
  3. Require `Content-Type: application/json` (forces a CORS preflight for cross-origin requests; there is no CORS policy, so preflight fails).
- Download tickets are bearer URLs valid for 60 s, scoped to one file and principal. A CSRF attacker can't mint one.
- No CORS headers are emitted at all (same-origin deploy).

### 6.8 Password reset (included in P0)
1. `request { email }`: always `204`. If the user exists, invalidate previous reset tokens and create a new one (30 min). Mail `APP_ORIGIN/reset-password#token=…`. Rate limits: 5/h per IP, 3/h per email.
2. `confirm { token, newPassword }`: look up by hash, unused and unexpired → set the hash, `password_changed_at=now`, mark the token used, revoke all refresh families, reset the lockout. OAuth-only users can use this to add a password.

### 6.9 Rate limits (`@fastify/rate-limit`, in-memory store, single server)
| Route | Key | Limit |
|---|---|---|
| global `/api/*` | IP | 300/min |
| `POST /auth/login` | IP | 10/min (+ per-account backoff §6.3) |
| `POST /auth/signup` | IP | 5/hour |
| `POST /auth/refresh` | IP | 30/min |
| `POST /auth/password-reset/request` | IP; email | 5/hour; 3/hour |
| `POST /auth/verify-email/request` | user | 3/hour |
| `GET /share-links/resolve` and any request with `X-Share-Link` | IP | 30/min for resolve; failed token lookups count double |
| `POST /models` | user | 20/hour |
| `PUT /models/:id/shares` | user | 60/hour (limits user enumeration by email) |

`trustProxy` is set from `TRUST_PROXY` so `request.ip` is the real client behind Caddy/nginx.

---

## 7. Permission model

### 7.1 Roles and capabilities
| Capability | viewer | commenter | editor | owner |
|---|:-:|:-:|:-:|:-:|
| View metadata, graph/tree, stats | ✓ | ✓ | ✓ | ✓ |
| Download original / run demo (P1) | if `canDownload` | if `canDownload` | ✓ | ✓ |
| Comment (P1, verified user) | | ✓ | ✓ | ✓ |
| Resolve any comment (P1) | | | ✓ | ✓ |
| Edit name/description, upload new version (P1), attach labels (P1) | | | ✓ | ✓ |
| Change visibility, manage shares and links | | | | ✓ |
| Delete model, move to workspace (P1) | | | | ✓ |

Ordering: `owner > editor > commenter > viewer`.

### 7.2 Resolution table
| Source | Condition | Grants role | Grants download |
|---|---|---|---|
| Owner | `models.owner_id = user` | owner | yes |
| Workspace owner (P1) | `models.workspace_id` set, user is ws `owner` | owner (except delete stays with `owner_id`; see R10) | yes |
| Workspace member (P1) | user is ws `member` | editor | yes |
| Direct share | `visibility IN ('users','link')` and `shares(model,user)` row | `shares.role` | yes (see Q5) |
| Share link | `visibility = 'link'`, `X-Share-Link` hash matches, `revoked_at IS NULL`, `expires_at IS NULL OR > now` | `link.role`, capped to `viewer` when anonymous | `link.allow_download` |
| Public | not in MVP (Q7) | — | — |
| none of the above | | → `404` | |

- Effective role = **max** over all applicable sources; `canDownload` = OR over sources (owner/editor imply true).
- `private` means owner (and P1 workspace) only. Existing shares and links are **kept but dormant**, so switching visibility back restores them. The share dialog shows them as "inactive while private".
- `users` = owner + direct shares. `link` = owner + direct shares + valid links.
- `via` is returned to the client for UI copy only (`'owner' | 'workspace' | 'share' | 'link'`).

### 7.3 Enforcement
- **One resolver**: `apps/server/src/features/sharing/access-service.ts` exports `resolveModelAccess(db, modelId, principal): Promise<ModelAccess | null>`. It's a single SQL query with `LEFT JOIN`s over `models`, `shares`, `share_links` (and `workspace_members` in P1), followed by a pure function `combineGrants(rows, principal) → ModelAccess`. The pure function gets a table-driven unit test covering every row of §7.2.
- **One gate**: Fastify plugin `model-access.ts` provides `requireModelAccess(minRole, { download?: boolean })` as a `preHandler`. Every `/api/models/:id/**` route declares it; a startup assertion walks the registered routes and **fails boot** if any `/api/models/:id` route lacks the gate.
- **Lists** ("shared with me", dashboard): written as dedicated SQL for performance. To keep them from drifting from the resolver, an integration test builds a fixture matrix (users × models × visibilities × shares × links) and asserts that `list(scope)` equals the set of models where `resolveModelAccess` returns a role.
- **Download tickets** carry `{ modelId, fileId, principal }` and are re-resolved on use, so revoking a link or share takes effect on the next download.
- The frontend only reads `myAccess` to hide controls. Hiding is cosmetic; the server enforces.

---

## 8. Parsing pipeline

### 8.1 Upload validation (before parsing)
1. `Content-Length` sanity check, `statfs(STORAGE_DIR)`: reject with `507` if free space < `2 × MAX_UPLOAD_BYTES`.
2. Multipart limits: `files: 1, fields: 5, fieldSize: 10 KB, fileSize: MAX_UPLOAD_BYTES`. If `file.truncated` → delete tmp, `413`.
3. Original name: strip control chars and path separators, NFC-normalize, cap at 255. Used only for display and `Content-Disposition`.
4. Extension allow-list: `.onnx`, `.safetensors`. `.pt|.pth|.bin|.pkl|.ckpt` → `415 unsupported_format` with `hint: 'convert_to_onnx'`, and the UI shows the conversion guide.
5. Header check (first bytes, read from the tmp file):
   - **safetensors**: `N = readBigUInt64LE(0)`; require `2 ≤ N ≤ 100 MiB`, `8 + N ≤ size`, and byte 8 is `{`.
   - **ONNX**: protobuf has no magic number. Require byte 0 = `0x08` (field 1 `ir_version`, varint), which every official serializer writes first, then rely on a full guarded decode. Documented as a heuristic.

### 8.2 Guarded execution
`runParser(format, filePath)` spawns `worker.ts` via `worker_threads` with `resourceLimits: { maxOldGenerationSizeMb: 1024 }`. Buffers live off-heap, so the ONNX file buffer doesn't count toward that limit. It enforces a `PARSE_TIMEOUT_MS` (default 30 s) with `worker.terminate()`. Concurrency is capped at 2 parses (simple semaphore); extra uploads wait up to 60 s, then get `503`. Errors map to `422 invalid_model { reason }` with stable reason codes (`truncated`, `bad_header`, `bad_protobuf`, `limits_exceeded`, `timeout`, `external_data_unsupported`, …).

Hard limits inside parsers (constants in `parsing/limits.ts`): ≤ 200k nodes, ≤ 500k tensors, ≤ 16 dims, names ≤ 1 KB, attribute lists summarized beyond 64 elements, raw tensor attributes never serialized (only dtype/shape), safetensors JSON nesting ≤ 4.

### 8.3 What is extracted

**ONNX** (`protobufjs` static module generated from `onnx.proto` vendored at a pinned ONNX release tag, Apache-2.0)
- Model: `ir_version`, `opset_import[]`, `producer_name/version`, `doc_string` (truncated to 4 KB), `metadata_props`.
- Graph inputs/outputs **excluding initializers** (older exporters list initializers as inputs), with dtype + shape (dims as number | symbolic string | null).
- `value_info` → shapes for intermediate edges where present.
- Initializers: name, dtype, dims, `numel` (product of dims), byte size. Never values. `data_location == EXTERNAL` → `external_data_unsupported`.
- Nodes: stable id (`n<index>`), `name` (or a synthesized `<opType>_<index>` when empty), `op_type`, `domain`, inputs/outputs (value names), attributes (INT/FLOAT/STRING/INTS/FLOATS/STRINGS rendered; TENSOR → `{dtype, shape}`; GRAPH (If/Loop/Scan bodies) → node count only in MVP).
- `Constant` nodes and initializer inputs fold into the consuming node as `params` (with per-node `paramCount`), so the graph isn't cluttered with weight nodes.
- Edges: for each value name, producer (node or graph input) → each consumer (node or graph output), with shape/dtype when known.
- Group paths: split node names on `/` and `.` boundaries as produced by the torch exporter (`/model/layers.3/self_attn/q_proj/MatMul` → `["model","layers.3","self_attn","q_proj"]`).

**safetensors**
- Header JSON: for each tensor `{ dtype, shape, data_offsets: [begin, end] }` + optional `__metadata__` (string→string, values truncated to 1 KB).
- Validate: allowed dtypes (`F64 F32 F16 BF16 I64 I32 I16 I8 U8 BOOL F8_E4M3 F8_E5M2`, …), `end - begin == numel × dtypeSize`, offsets sorted, non-overlapping, and `8 + N + max(end) == fileSize`.
- Module tree: split tensor names on `.`; numeric segments stay as their own level (`layers` → `0`, `1`, …) so repeated blocks collapse nicely; leaves = tensors; every module aggregates `paramCount`, `byteSize`, and dtype histogram.

### 8.4 JSON format sent to the frontend (`packages/shared/src/parsed-model.ts`)

```ts
export const PARSER_VERSION = 1;

type Dim = number | string | null;           // concrete, symbolic ("batch"), unknown
type DType = string;                          // ONNX: "float32" | "int64" | …; safetensors: "F32" | …

interface TensorInfo { name: string; dtype: DType | null; shape: Dim[] | null; }

interface ModelSummary {
  format: 'onnx' | 'safetensors';
  fileSizeBytes: number;
  totalParams: number;                        // safe up to 2^53
  tensorCount: number;
  nodeCount?: number;                         // ONNX only
  opsetVersion?: number;
  producer?: string;
  dtypeBreakdown: Record<DType, { params: number; bytes: number }>;
}

interface OnnxNode {
  id: string;                                  // "n42"
  name: string;
  opType: string;
  domain: string;                              // "" = ai.onnx
  groupPath: string[];                         // prefix hierarchy for collapsing
  inputs: string[];                            // value names (activations only)
  outputs: string[];
  params: TensorInfo[];                        // folded initializers / constants
  paramCount: number;
  attributes: Record<string, AttrValue>;
}
type AttrValue =
  | { kind: 'int' | 'float'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ints' | 'floats'; value: number[]; truncated: boolean }
  | { kind: 'strings'; value: string[]; truncated: boolean }
  | { kind: 'tensor'; dtype: DType; shape: number[] }
  | { kind: 'graph'; nodeCount: number };

interface OnnxEdge {
  id: string;                                  // "e<index>"
  source: string;                              // node id or "in:<name>"
  target: string;                              // node id or "out:<name>"
  tensor: TensorInfo;
}

interface OnnxGraphPayload {
  kind: 'onnx-graph';
  inputs: TensorInfo[];
  outputs: TensorInfo[];
  nodes: OnnxNode[];
  edges: OnnxEdge[];
  metadata: Record<string, string>;
}

interface ModuleNode {
  path: string;                                // "model.layers.0.self_attn"
  name: string;                                // "self_attn"
  children: ModuleNode[];
  tensors: { name: string; dtype: DType; shape: number[]; params: number; bytes: number }[];
  paramCount: number;                          // aggregated
  byteSize: number;
}

interface SafetensorsTreePayload {
  kind: 'safetensors-tree';
  root: ModuleNode;
  metadata: Record<string, string>;
}

export interface ParsedModel {
  parserVersion: number;
  summary: ModelSummary;
  payload: OnnxGraphPayload | SafetensorsTreePayload;
}
```
The zod schema mirrors these types so the SPA validates the payload at the boundary.

### 8.5 Caching
- On upload, the worker returns `ParsedModel`; the server writes `parsed/<storage_key>.v<PARSER_VERSION>.json.gz` (gzip level 6) and stores `summary` + `total_params/node_count/tensor_count` in `model_files`.
- `GET /graph` streams the `.json.gz` with `Content-Encoding: gzip` (no recompression) and `ETag: "<storage_key>.v<N>"`, honoring `If-None-Match`.
- If the sidecar for the current `PARSER_VERSION` is missing (parser upgraded, file deleted), it's re-parsed on demand through the same guarded worker. Old-version sidecars are swept by `storage:gc`.
- P1 diff results are cached as `parsed/diff-<fromKey>-<toKey>.v<N>.json.gz`.

**P1 `GraphDiff`**: match ONNX nodes by `name` (fallback: `opType` + topological index), safetensors by tensor name. Status per item: `added | removed | changed (opType/attrs/param shapes/dtypes) | unchanged`. The graph view colors nodes by status. Weight-value changes are out of scope until per-tensor hashing exists (open for P1).

### 8.6 Graph rendering details and large-graph strategy
- **Op categories → colors** (fixed palette with a legend, not hash colors): conv, matmul/gemm, normalization, activation, pooling, elementwise math, shape/reshape/transpose/gather, attention/fused (`com.microsoft`), control flow, other.
- **Grouping**: a trie over `groupPath`. Each group node shows a label, child count, op mix, and `paramCount`.
- **Level of detail**: start at the shallowest depth where visible items ≤ `MAX_VISIBLE` (300). Expanding a group lays out only the changed compound node (ELK `hierarchyHandling: INCLUDE_CHILDREN`) and keeps the rest fixed. Hard cap of 1,500 visible nodes, with a "too many nodes, expand a smaller block" message.
- **No-name fallback**: graphs without hierarchical names and > 300 nodes are chunked into topological blocks of ~50 nodes ("Block 1…N").
- **Layout off the main thread**: `elkjs` in a dedicated Web Worker; React Flow with `onlyRenderVisibleElements`, memoized custom nodes, edges simplified to `smoothstep`, minimap off above 1,000 nodes.
- **Search**: node name/op search pans and expands to the match.
- **Why not Google Model Explorer by default**: it's purpose-built for huge graphs (WebGL, hierarchical layers) and would beat React Flow above ~5k visible nodes. But it's an Angular-based web component with its own input adapters and styling, and we'd still need React Flow for node-anchored comments (P1) and design mode (P2), so we'd maintain two renderers. **M3 includes a measured spike**: render a ~10k-node exported transformer. If expand/collapse + pan stays under ~100 ms per interaction at the visible cap, keep React Flow. Otherwise, add the Model Explorer visualizer (Apache-2.0 standalone package, verify current packaging at spike time) as an alternative renderer for models above a node threshold, fed from the same `OnnxGraphPayload`.

---

## 9. Frontend pages and components

| Route | Page | Notes |
|---|---|---|
| `/` | Landing (logged out) / redirect to `/dashboard` | short pitch + supported formats |
| `/login`, `/signup` | Auth forms + GitHub/Google buttons | error codes from `/auth/callback` shown here |
| `/auth/callback` | OAuth landing | calls `/refresh`, then navigates to `returnTo` |
| `/verify-email`, `/forgot-password`, `/reset-password` | token flows | token read from `location.hash` |
| `/dashboard` | Tabs: **My models** · **Shared with me** | `ModelList`, empty states, upload CTA |
| `/upload` | `UploadDropzone` + name/description | XHR progress, server error reasons mapped to copy, `.pt` → conversion guide |
| `/m/:modelId` | Model view | tabs: **Graph** (ONNX) / **Tree** (safetensors) · **Stats** · **Details** (file, opset, metadata, download) · P1: **Demo**, **Versions**, **Comments** side panel |
| `/s/:token` | Share-link entry | stores the token in memory (`X-Share-Link`), resolves, renders the same model view in link mode; prompts login for commenter links |
| `/settings` | Profile, password, linked accounts, sessions | |
| `/help/convert` | `.pt` → ONNX / safetensors guide | static |
| `*` | 404 | also shown for no-access models (matches server 404) |

**Main components**
- `AuthProvider` / `auth-store.ts`: in-memory access token, boot refresh, single-flight + Web Locks refresh.
- `api-client.ts`: fetch wrapper (Bearer + optional `X-Share-Link`), 401→refresh→retry once, typed errors, zod-parsed responses.
- `AppShell`: header, nav, user menu.
- `ModelHeader`: name, owner, format badge, total params (human-formatted, e.g. "25.6M"), file size, node/tensor count, share button (owner), download button (if `canDownload`).
- `OnnxGraphView`: React Flow canvas with `OpNode`, `GroupNode`, `IoNode`, legend, search, zoom controls, `useGraphLayout` (worker client).
- `NodeInspector`: side panel showing name, op, domain, attributes table, input/output shapes, folded params with shapes, param count. P1: comment thread.
- `SafetensorsTreeView`: virtualized (`@tanstack/react-virtual`) expandable tree with columns for shape, dtype, params, % of total.
- `StatsTab`: `ParamsPerLayerChart` (horizontal bars, top 30 + "others", per group/module), `OpTypeDistribution` (bar of op counts by category; safetensors shows a dtype breakdown instead).
- `ShareDialog`: general-access select (Private / Specific people / Anyone with the link), people list with role selects, `ShareLinkManager` (create, role, expiry picker, download toggle, copy, revoke).
- `ModelList`, `UploadDropzone`, `ConvertGuide`, `EmptyState`, `ErrorState`.

---

## 10. Milestones and tasks

Each task should land as one focused commit (Conventional Commits) with tests. "AC" = acceptance criterion; it must be observable from a command, test, or UI.

### M0 — Foundations (P0)
| # | Task | AC |
|---|---|---|
| 0.1 | pnpm workspace, `tsconfig.base.json`, ESLint flat config, Prettier, `.nvmrc`, `.env.example`, root scripts | `pnpm lint && pnpm format:check && pnpm typecheck` pass on the empty skeleton |
| 0.2 | `packages/shared` with zod + a sample schema, consumed by both apps | `pnpm typecheck` resolves `@modelshare/shared` from both apps |
| 0.3 | Server skeleton: `buildApp(config)`, zod env config (fails fast), pino logger with redaction (`authorization`, `cookie`, `x-share-link`, `ticket`), error handler with the error shape, `GET /api/health` | Unit test: missing `JWT_SECRET` throws; `app.inject GET /api/health` → `200 {status:'ok', db:'ok'}` |
| 0.4 | DB pool + `query()`/`withTransaction()` helpers (`execute` only, LIMIT-as-string handling) | Integration test runs a prepared SELECT and a rollback against the test DB |
| 0.5 | Migration runner + `001_init.sql` | `pnpm --filter server db:migrate` on an empty DB creates all tables; a second run is a no-op; editing an applied file aborts with a checksum error (test) |
| 0.6 | Web skeleton: Vite + React + Router + Query + Tailwind + shadcn base, Vite proxy `/api` | `pnpm --filter web build` succeeds; Playwright smoke test loads `/` and sees the app title |
| 0.7 | Vitest workspace (unit/integration), Playwright config (headless chromium, `baseURL` from env), `paseo.json` scripts `server`/`web` bound to `$PASEO_PORT` | `pnpm test:unit` runs ≥ 1 test; `pnpm test:e2e` runs the smoke spec headless against Paseo-started servers |
| 0.8 | Security headers via `@fastify/helmet` (CSP for the SPA served by the proxy documented separately), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` | Integration test asserts the headers on `/api/health` |

### M1 — Auth (P0)
| # | Task | AC |
|---|---|---|
| 1.1 | Users repo, argon2id hashing, `POST /auth/signup` | Integration: signup → 201 with `accessToken` + `Set-Cookie ms_rt` (HttpOnly, Secure, SameSite=Strict, Path=/api/auth); duplicate → 409 |
| 1.2 | Token service (JWT sign/verify, refresh issue/hash), `auth` plugin (`request.user`) | Unit: expired/tampered JWT rejected; integration: `/api/me` 401 without token, 200 with |
| 1.3 | `POST /auth/login` + lockout/backoff | Integration: 5 wrong passwords → 6th returns 429 with `retryAfterSec`; success resets the counter |
| 1.4 | `POST /auth/refresh` rotation, grace window, reuse detection | Integration: refresh returns a new cookie; replaying the old one after 10 s (fake clock) → 401 and the family's new token is now also rejected; replay within 10 s → `401 stale_refresh`, family intact |
| 1.5 | CSRF guard for cookie routes | Integration: refresh with a wrong/missing `Origin` → 403; with `text/plain` → 415 |
| 1.6 | `logout`, `logout-all`, `/me/sessions` | Integration: after logout the cookie's token fails refresh; sessions list shows the current flag |
| 1.7 | Mailer interface (SMTP + file outbox), verify-email request/confirm | Integration: signup writes an outbox file containing a link; confirming sets `email_verified_at`; reused token → 400 |
| 1.8 | Password reset request/confirm | Integration: unknown email → 204 and no mail; confirm revokes all families (old refresh → 401) |
| 1.9 | Rate-limit plugin with the §6.9 table | Integration: 11th login within a minute from one IP → 429 |
| 1.10 | OAuth core (tx cookie, PKCE, state, callback skeleton) + GitHub provider | Integration with undici `MockAgent`: callback with a wrong `state` → redirect `status=error&code=state_mismatch`; happy path creates user + `oauth_accounts` and sets `ms_rt`; token request body contains `code_verifier` |
| 1.11 | Google provider (id_token via mocked JWKS, nonce) + linking rules (`account_exists`, `already_linked`, link intent, unlink last-method guard) | Integration tests for each rule |
| 1.12 | Web: `AuthProvider`, api-client refresh logic, login/signup/callback/verify/reset pages, Settings (password, linked accounts, sessions) | Playwright: sign up → reload page → still logged in (boot refresh) → logout → `/dashboard` redirects to `/login` |

### M2 — Storage, upload, parsing (P0)
| # | Task | AC |
|---|---|---|
| 2.1 | `storage/paths.ts`: `pathFor(area, key)` accepts only `/^[0-9a-f-]{36}$/` keys and fixed areas (`tmp`, `models`, `parsed`); boot creates dirs with `0700` | Unit: `pathFor('models','../etc/passwd')` throws; resolved path always starts with `STORAGE_DIR` |
| 2.2 | Fixture generator `make-fixtures.ts` (tiny CNN + tiny MLP ONNX via protobufjs encode; safetensors with nested names; malformed variants) | `pnpm --filter server fixtures` writes the files deterministically (same sha256 on re-run) |
| 2.3 | safetensors parser + tree builder | Unit: valid fixture → expected tree/param totals; overlapping offsets, header > file, bad dtype, `N=2^63` → specific reason codes |
| 2.4 | Vendored `onnx.proto` + generated static module; ONNX parser (initializer folding, edges, group paths, attribute summarization) | Unit: CNN fixture → expected node/edge counts, params folded, `totalParams` matches the hand-computed value; truncated file → `bad_protobuf`; external data → `external_data_unsupported` |
| 2.5 | Worker runner with timeout, resource limits, concurrency semaphore | Unit: a parser stub that loops forever is terminated at the timeout → `timeout`; the main thread stays responsive (heartbeat timer fires during the parse) |
| 2.6 | `POST /api/models` streaming upload (tmp → validate → parse → sidecar → rename → DB tx), `statfs` check | Integration: upload fixture → 201, file exists at `models/<key>`, sidecar exists, rows inserted; over-limit (limit set to 1 KB in test) → 413 and `tmp/` empty; `.pt` → 415 with hint; garbage `.onnx` → 422 and no files left |
| 2.7 | `GET /api/models/:id`, `GET /api/models/:id/graph` (gzip passthrough, ETag, lazy re-parse) | Integration: second request with `If-None-Match` → 304; deleting the sidecar → still 200 (re-parsed) |
| 2.8 | File tickets + `GET /file` streaming with `Content-Disposition` (RFC 5987 `filename*`) | Integration: download bytes' sha256 equals the upload's; expired ticket → 401; ticket for another model → 404 |
| 2.9 | `DELETE /api/models/:id` (rows then files) + `PATCH` metadata | Integration: after delete, rows gone, `models/<key>` and sidecar gone; a simulated unlink failure still returns 204 and logs |
| 2.10 | `storage:gc` script (dry-run default, `--apply`; unreferenced `models/*` and `parsed/*` older than 1 h, `tmp/*` older than 24 h, stale parser-version sidecars) | Integration: plant an orphan file with an old mtime → dry-run lists it and keeps it; `--apply` deletes it; referenced files untouched |

### M3 — Visualization (P0)
| # | Task | AC |
|---|---|---|
| 3.1 | Model page shell + `ModelHeader` + Details tab | Playwright: after uploading the CNN fixture, the header shows the expected param count and node count |
| 3.2 | `SafetensorsTreeView` (virtualized) | Playwright: the safetensors fixture shows `model > layers > 0 > attn` with correct shape/dtype; expanding/collapsing works by keyboard |
| 3.3 | Op categories + palette + legend; basic `OnnxGraphView` with ELK in a worker | Playwright: CNN fixture renders N op nodes (`data-testid="op-node"`), the Conv node has the conv category class |
| 3.4 | `NodeInspector` | Playwright: clicking the Conv node shows `kernel_shape`, input/output shapes, param count |
| 3.5 | Grouping trie + level of detail + expand/collapse + no-name chunking; graph search | Unit: grouping of a 2,000-node synthetic graph gives ≤ 300 visible items at the initial depth; Playwright: expanding a group increases the visible node count |
| 3.6 | Stats tab (params per layer, op-type distribution / dtype breakdown) | Unit: aggregation functions; Playwright: chart renders with the expected number of bars |
| 3.7 | **Perf spike** with a large ONNX (generated synthetic 10k-node graph with transformer-like names, no download needed) | Written result in the M3 report: initial render time, expand latency, memory; go/no-go on the Model Explorer fallback |
| 3.8 | Upload page + dashboard "My models" list | Playwright: upload via the dropzone shows progress and lands on `/m/:id`; the dashboard lists it |

### M4 — Sharing and permissions (P0)
| # | Task | AC |
|---|---|---|
| 4.1 | `combineGrants` pure function + `resolveModelAccess` SQL | Unit: table-driven test covering every row of §7.2 incl. private-dormant shares, expired/revoked links, anonymous commenter cap |
| 4.2 | `requireModelAccess` gate + boot-time route assertion; switch all M2 routes to it | Integration: a non-shared user gets 404 on every model route (parametrized over the route list); boot fails if a test route lacks the gate |
| 4.3 | Direct shares API (verified-email requirement) + visibility PATCH | Integration: share as viewer → viewer can GET the graph, PATCH → 403 (has a role, but too low); set private → viewer gets 404; set `users` again → access restored |
| 4.4 | Share links API (hash + encrypted token, expiry, revoke, download toggle) + `/share-links/resolve` + `X-Share-Link` principal | Integration: anonymous request with the link header → 200 on graph; `file-ticket` → 403 when `allow_download=0`; expired (fake clock) / revoked → 404; owner can list the link URL again |
| 4.5 | "Shared with me" list + list/resolver consistency matrix test | Integration: matrix test passes (list ≡ resolver) |
| 4.6 | Web `ShareDialog` + `/s/:token` link mode + dashboard tab | Playwright: owner creates a no-download link → in a fresh browser context the link opens the graph, no download button, `GET /file-ticket` fails; owner revokes → link shows not found |
| 4.7 | Rate limit + double-count on failed link lookups | Integration: 31 resolves/min from one IP → 429 |

### M5 — Hardening and release (P0)
| # | Task | AC |
|---|---|---|
| 5.1 | Full e2e happy-path suite (signup → verify via outbox → upload ONNX + safetensors → inspect → share to a second user → link share) | `pnpm test:e2e` green headless |
| 5.2 | Security review pass (`/security-review`-style checklist: authz on every route, upload limits, headers, log redaction, cookie flags) | Checklist committed in the report with each item linked to a test |
| 5.3 | Deployment doc: systemd unit, Caddy config (TLS, static SPA, `/api` proxy, `client_max_body_size`-equivalent), `STORAGE_DIR` perms, MySQL user with least privilege, backup notes (mysqldump + `rsync STORAGE_DIR`), gc cron | `docs/deploy.md` exists; config files lint (e.g. `caddy validate` noted as a manual check) |
| 5.4 | Production build | `pnpm build` produces `apps/web/dist` and `apps/server/dist`; `node apps/server/dist/server.js` boots against the test DB with prod config in an integration smoke test |

### P1 milestones
| # | Task | AC |
|---|---|---|
| M6 Comments | 002 migration; comments API with commenter gate and verified-email check; inspector thread; graph badge with comment counts | Integration: viewer POST → 404/403, commenter → 201; Playwright: comment on a node shows a badge after reload |
| M7.1 Versions | `POST /versions` (same format, same validation), version switcher, `current_version_id` update, delete-version (owner) removes files | Integration: v2 upload increments `version_number`; GET `?version=1` still returns the old graph |
| M7.2 Diff | `GraphDiff` builder + cache; diff mode coloring added/removed/changed | Unit: fixtures with one changed Conv kernel → exactly that node `changed`; Playwright shows the legend counts |
| M8 Workspaces | 003 migration; CRUD; members; move model; resolver rows for ws owner/member; dashboard "Workspace" section | Unit: resolver table extended; integration matrix (list ≡ resolver) still passes |
| M9.1 Demo infra | Lazy-loaded `onnxruntime-web` chunk; model bytes fetched via file ticket into an ArrayBuffer (only if `canDownload`); COOP/COEP (`credentialless`) on the demo route for WASM threads; WebGPU when available, WASM fallback | Playwright: the MLP fixture runs in the WASM backend headless, and the output tensor equals precomputed values |
| M9.2 Input UIs | Shape-based picker: `[1,3,H,W]` → image upload + resize + normalize (ImageNet mean/std presets + custom); `[1,N]` float → numeric form + CSV paste; anything else → "unsupported input" | Unit: picker mapping; Playwright: CSV paste runs inference |
| M9.3 Outputs | `labels.json` attach (editor), Top-5 bars (softmax if not already normalized), else raw values (first 1,000 + stats) | Playwright: the CNN fixture with labels shows 5 bars |
| M10 Weight viz | `/tensors/stats` endpoint reading tensor byte ranges (F32/F16/BF16; ONNX raw_data offsets recorded at parse time) with a sidecar cache; histogram UI; first-conv filter grid (`[out,in,kh,kw]`, per-filter min-max normalized, RGB when in=3) | Unit: histogram of a known tensor; Playwright: the filter grid shows `out` tiles |

### P2 milestones
| # | Task | AC |
|---|---|---|
| M11 Feature maps | Server rewrites ONNX to add selected intermediate values as graph outputs (needs dtype; values lacking `value_info` are skipped and listed), served as a derived file under the same download gate; demo shows per-node activation thumbnails next to graph nodes | Integration: the rewritten fixture has the extra outputs and ORT-web returns them; Playwright: activation thumbnails appear on Conv nodes after a run |
| M12 Design mode | 004 `designs` migration; block palette (Linear, Conv2d, ReLU, BatchNorm, MaxPool, Flatten, Dropout, Softmax) on React Flow; TS shape inference with inline errors; PyTorch `nn.Sequential` code export; save/share (reuse the resolver)/fork | Unit: shape inference table tests (incl. errors); snapshot of exported code; Playwright: build Conv→ReLU→Flatten→Linear, an invalid in_features is flagged, the fix clears it |

---

## 11. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest (`unit` project) | parsers (valid + malformed + limits), grouping/LOD, op categories, stats aggregation, `combineGrants`, token utils, path builder, config validation, demo input picker (P1), shape inference (P2) |
| Integration | Vitest (`integration` project) + `app.inject()` + real MySQL test DB + temp `STORAGE_DIR` | every route: auth, rate limits (fake clock), uploads, downloads, permissions matrix, gc script. OAuth providers mocked with undici `MockAgent`. Mail via file outbox |
| E2E | Playwright (chromium, headless) against Paseo-started `server` + `web` scripts | user journeys in §10 ACs; anonymous link journeys use a fresh `browser.newContext()` |

Rules
- Deterministic: injected clock (`now()` provider) for expiry/lockout/grace tests; fixtures generated by script (no network downloads); a fixed rate-limit store reset per test.
- Integration DB: `TEST_DATABASE_URL` points at a dedicated schema (default `modelshare_test`). `globalSetup` drops and recreates the schema and runs migrations; each test file truncates tables in `beforeEach`. The integration project runs with `fileParallelism: false` to keep isolation simple.
- Parsers get "hostile input" tests: random byte flips over fixtures (seeded), huge declared lengths, deep JSON nesting, and every one must end in a typed `422` reason and never a crash or hang.
- No test opens a visible window; no watch modes.

---

## 12. Verification

All commands are non-interactive and headless; none opens a window or uses watch mode. Run from the repo root. Plan approval covers these commands (per the global rules); the starred ones are heavier and happen once per environment.

```bash
# one-time setup (*heavy: network + disk)
pnpm install --frozen-lockfile                          # *
pnpm --filter web exec playwright install chromium      # * ~150 MB download, headless shell only

# static checks
pnpm lint
pnpm format:check
pnpm typecheck

# fixtures + unit tests
pnpm --filter server fixtures
pnpm test:unit                                          # vitest run --project unit

# integration tests (needs a reachable MySQL 8; see Q2)
TEST_DATABASE_URL='mysql://modelshare_test:***@127.0.0.1:3306/modelshare_test' \
  pnpm test:integration                                 # vitest run --project integration

# migrations against the test DB (idempotency check)
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter server db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter server db:migrate   # second run: "no pending migrations"

# e2e (servers started via Paseo workspace scripts so they bind to $PASEO_PORT and get cleaned up)
paseo script start server
paseo script start web
pnpm test:e2e                                           # playwright test (headless chromium), baseURL from env
paseo script stop web
paseo script stop server

# storage hygiene
STORAGE_DIR=/tmp/modelshare-verify pnpm --filter server storage:gc --dry-run

# production build (*moderate CPU, < 1 min expected)
pnpm build                                              # *
```

Needs manual check (not automatable without opening windows or real credentials):
- Real GitHub and Google OAuth round-trips with registered apps (mocked in tests).
- Real SMTP delivery.
- WebGPU backend in the demo (headless runs WASM only).
- Visual quality of the graph layout on real-world models (ResNet-50, BERT-base, a small LLM export).
- Caddy/nginx config on the target server.

---

## 13. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | ONNX decoding needs the whole file in memory (protobufjs can't stream); 200 MB × 2 concurrent parses ≈ 400 MB + overhead | Buffers are off-heap and protobufjs returns `bytes` as Buffer slices (no copy); concurrency cap of 2; if limits grow toward GBs, replace with a hand-written shallow protobuf scanner that skips `raw_data` |
| R2 | React Flow slows down on very large graphs | LOD/collapsing caps visible nodes; measured spike in M3.7 with a Model Explorer fallback decision |
| R3 | GitHub's PKCE support: GitHub added PKCE for OAuth apps recently; behavior must be verified at implementation time | We send `code_challenge` anyway; GitHub also requires the client secret, so state + secret keep the flow secure even if PKCE is ignored |
| R4 | Torch exporter naming differs across versions (dynamo vs. TorchScript exporter); grouping may look poor | Fallback topological chunking; group-path extraction is a pure function with tests per naming style |
| R5 | Share-link tokens in URLs can leak (screenshots, chat logs, history) | Expiry, revocation, `Referrer-Policy: no-referrer`, log redaction, the token moved into a header after landing on `/s/:token`, download off by default |
| R6 | Single-server disk fills up | `statfs` check before uploads, per-user quota (Q9), gc script, deployment doc includes disk alerts |
| R7 | In-memory rate limits reset on restart and don't work across processes | Acceptable for single-server; swap the store if ever scaled out |
| R8 | Signup reveals whether an email is registered | Rate limit; alternative "check your email" signup flow costs immediate login. Accepted unless you prefer otherwise |
| R9 | ORT-web multithreading needs cross-origin isolation (COOP/COEP), which breaks cross-origin images (GitHub/Google avatars) | COEP `credentialless` scoped to the demo route, or proxy avatars through the API; decide in M9.1 |
| R10 | Workspace semantics (P1) may clash with personal ownership (who can delete a workspace model?) | Defined conservatively in §7.2; revisit when M8 starts |
| R11 | Access tokens stay valid ≤ 10 min after logout or share revocation | Share revocation is checked per request (not in the token), so only session logout has this lag |
| R12 | A model's demo and weight stats reveal weights to viewers | Demo gated by `canDownload` (D22); weight-stats gating is Q5 |

---

## 14. Open questions for the user

Each question is worded so "yes" accepts the recommendation.

1. **Deployment target**: deploy to your home server `freeride` (behind its existing reverse proxy) as a plain Node process + MySQL, not a container? If you want Dokploy/Docker, the deployment doc changes (M5.3).
2. **Dev/test MySQL**: use a local Homebrew MySQL 8 on this Mac for dev and integration tests (`modelshare_test` schema)? Alternatives: a MySQL on freeride, or Docker (needs your per-run approval).
3. **Email provider**: use an SMTP provider (recommendation: Resend or Amazon SES; free tier is enough) for verification and reset mails? Without email, D12 (verified email before receiving shares) has to be dropped, which weakens sharing security.
4. **Product name/domain**: keep "modelshare" as the working name, with the domain decided before M5? (Needed for OAuth app redirect URIs and `APP_ORIGIN`.)
5. **Direct-share downloads and weight stats**: should directly shared viewers/commenters be able to download the original file (and run the demo), with weight histograms visible to every viewer? Recommendation: yes for MVP; add a per-share download toggle later if needed.
6. **Who manages sharing**: only the owner can change visibility, shares, and links in MVP (editors can't reshare)?
7. **Public visibility**: keep "public / discoverable" models out of MVP (only private / specific users / link)?
8. **Link role cap**: share links can grant at most `commenter`, and anonymous link visitors are always `viewer`?
9. **Quotas**: 200 MB per file and 2 GB total storage per user for MVP?
10. **Unregistered invitees**: sharing requires the invitee to already have a verified account (no pending email invites in MVP)?
11. **Package manager**: use pnpm workspaces (your other repos use npm; npm workspaces would also work at the cost of looser dependency isolation)?
12. **UI kit**: Tailwind v4 + shadcn/ui, matching your other React project?
13. **Account deletion**: defer self-service account deletion (with model/file cleanup) to P1?
