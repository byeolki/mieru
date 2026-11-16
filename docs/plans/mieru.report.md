# mieru — implementation report (Release 1)

## Status

**Release 1 is live at https://mieru.dokploy.byeolki.me** (M0–M7, M-R, dark mode, favicon).
It runs on freeride as the `mieru` compose stack (`deploy/compose.yml`) next to Dokploy. Traefik
routes the host through Docker labels and the existing `*.dokploy.byeolki.me` tunnel route, so
Cloudflare and `cloudflared` needed no change. The repository has no git remote, so nothing has
been pushed. P1/P2 milestones (M8–M13) have not been started.

## Summary

- **Accounts:** email + password signup with generated usernames. argon2id hashing. Access JWT
  plus a rotating refresh cookie with reuse detection. Login backoff and lockout. Sessions list.
  Profile, username, email and password changes. Account deletion.
- **Repositories:** resumable tus uploads (ONNX up to 2 GiB, safetensors up to 10 GiB). Blobs are
  deduplicated by SHA-256. Parsing runs in a time-limited worker thread: a streaming ONNX scanner,
  plus a header-only safetensors parser. Gzipped graph sidecars are re-parsed on demand. READMEs
  are edited with conflict detection. Downloads use 60 s tickets and support `Range`.
- **Visualization:** React Flow + ELK graph with grouping/LOD, search, inspector and minimap.
  safetensors files get a virtualized module tree. There is a stats tab and an architecture strip
  on every list row.
- **Sharing:** one resolver (`resolveModelAccess` + `combineGrants`), with a boot-time check that
  every `/api/models/:id` route is gated. People shares can each allow or deny downloads. Share
  links (viewer/editor, expiry, revoke) are stored as hash plus ciphertext. Public visibility
  supports a view-only option.
- **Community:** issues tied to graph nodes, replies, lock, soft delete, an unread activity feed,
  and stars.
- **Discovery:** view counting with a daily salt, and trending (15-min job, half-life decay, at
  least 2 distinct actors, most-starred fallback). The Explore page has search (ngram FULLTEXT
  incl. README), filters, sort and pagination. There are public profile pages and OG preview
  images.
- **Moderation:** anonymous or signed-in reports on a repository or an issue, rate-limited. Admin
  role with an `admin` CLI, plus an admin queue at `/admin/reports` where an admin can dismiss,
  delete an issue, or take a repository down. The owner sees a takedown notice; admins can
  restore. Admin role is checked against the DB on every request.
- **Ops:** `/api/health` (liveness) and `/api/health/deep`, which checks disk reserve, stuck
  processing, trending freshness and backup age. Multi-stage non-root Dockerfile. Compose stack
  with app, MySQL 8.4 and a daily backup sidecar (dump + blob mirror, 14-day retention).
  `docs/deploy.md` and `docs/runbook.md`.
- **Web polish:** Korean UI. Dark mode follows the system setting. Heavy routes are lazy-loaded
  (main chunk 1.57 MB → 509 kB). Favicon and touch icon.

## Tests

All run on m4pro, headless, against the Paseo `mysql`/`server`/`web` scripts.

| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 1 warning (React Compiler skips `useVirtualizer`, a known TanStack Virtual limitation) |
| `npm run format:check` | pass |
| `npm run typecheck` | pass |
| `npm run test:unit` | 22 files, 101 tests passed |
| `npm run test:integration` | 16 files, 99 tests passed (real MySQL 8.4 `mieru_test`) |
| `E2E_BASE_URL=http://127.0.0.1:61283 npx playwright test -c apps/web/playwright.config.ts` | 13 passed (smoke, auth, repository, sharing, community, explore, moderation, theme) |
| `npm run build` | pass |
| `DATABASE_URL=$TEST_DATABASE_URL node apps/server/dist/scripts/migrate.js` | "no pending migrations" (compiled paths resolve) |

### Production checks

| Check | Result |
|---|---|
| `docker compose --env-file /data/projects/mieru/mieru.env up -d --build` | image built; `001_init` applied; app and db healthy |
| `GET /api/health/deep` | 200, every check `ok` (incl. backups after the sidecar's first run) |
| Smoke test (via Traefik on the host): signup → tus upload → create public model → poll → `/graph` | `ready`, graph 200 (argon2 and the parser worker run in the image) |
| `/og/m/<id>.png` and `og:title` on `/m/<id>` | PNG 200 (72 KB); `og:title` = `smoke-cnn · @smoke-4327 \| mieru` |
| Delete the smoke account | 204; users, models and blobs back to 0 |
| Restore drill: dump → `mieru_drill` → compare → drop | 20 tables and 1 migration row in both |
| `GET https://mieru.dokploy.byeolki.me/api/health/deep` from m4pro | 200, all `ok`; CSP and HSTS headers present |
| `TRUST_PROXY=2`: session IP of a throwaway signup vs `/cdn-cgi/trace` | both `211.177.97.183` (account deleted afterwards) |

### Security review checklist (M7.4)

| Item | Evidence |
|---|---|
| Every repository route is gated; ungated routes fail at boot | `features/sharing/sharing.int.test.ts` (boot walk + 404 matrix), `features/sharing/grants.test.ts` |
| Admin routes: 401 anonymous, 403 non-admin, revocation is immediate | `features/moderation/moderation.int.test.ts` |
| Takedown hides content from everyone but the owner and admins | `grants.test.ts`, `moderation.int.test.ts`, `e2e/moderation.spec.ts` |
| Upload limits (declared size → 413, per-repo cap, free-space reserve) | `features/models/models.int.test.ts` |
| Markdown: no raw HTML, no `javascript:` links, https-only images | `apps/web/src/design/Markdown.test.tsx` |
| Security headers, CSP, `nosniff`, referrer policy | `src/app.int.test.ts` |
| Logs redact bearer tokens, cookies, share links, ticket query strings | `test/log-redaction.int.test.ts` |
| Refresh cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`; reuse kills the family | `features/auth/auth.int.test.ts` |
| CSRF on cookie routes (Origin + JSON content type) | `features/auth/auth.int.test.ts` |
| Login lockout with backoff; rate limits; spoofed `X-Forwarded-For` ignored at hops = 0 | `features/auth/auth.int.test.ts`, `features/auth/rate-limit.int.test.ts` |
| Storage paths are UUID-only, under `STORAGE_DIR` | `storage/paths.test.ts` |
| Downloads are `attachment` + `nosniff`; tickets expire and are bound to the principal | `features/models/files.test.ts`, `features/models/models.int.test.ts` |

## Redesign (2026-11-03)

Reworked the UI after Hugging Face, GitHub, Replicate and a few Dribbble shots (model catalog
card, Coherence, Agently, settings pages). The logo is unchanged.

- **Shell:** global top header (logo, `/` search, 둘러보기 · 내 모델 · 스타, 새 모델, activity, avatar
  menu). It replaces the left sidebar.
- **Repository:** `owner / name` heading with copy button, fact chips, split star button,
  underlined tabs with counts, and the architecture strip as the header's bottom edge. The
  overview is a README box plus a sidebar with model info, a precision bar, the op-family mix and
  inputs/outputs. Issue threads get a sidebar too.
- **Lists:** HF-style rows (mono `owner/name`, a meta line with icons, a thin strip). Explore has a
  left filter panel and "featured" cards that use the strip as a cover.
- **Other pages:** dashboard with a side rail, GitHub-style profile, settings with section
  navigation, and a light landing with live trending models.
- **Landing hero:** the preview window unfolds once on load (strip, then nodes, edges, inspector).
  After that its nodes are selectable by mouse or keyboard and fill the inspector with real
  shapes, attributes and parameter counts. Reduced-motion users get the final state immediately.
- **Fixes found along the way:**
  - A refresh replayed inside the grace window now rotates the family's current token. Before,
    navigating mid-refresh signed users out.
  - The app now restores the session before its first render. Before, owners briefly lost the
    Share and edit controls.
- **Review fixes:** applied a `better-interface` / `kill-ai-slop` review (run read-only by a
  subagent): shared loading, error-with-retry, empty and confirm states; contrast; focus rings;
  copy.

Tests after the redesign: lint 0 errors; unit 101; integration 100; e2e 13 (headless).

Screens: `.tmp/screens/*.png` (local, not committed).

## R2/R3 features (2026-11-09)

Built M8 (versions + diff), M10 + M12 (in-browser demo with feature maps), M11 (weights) and
M13 (design mode). M9 (workspaces) was not in scope this round.

- **Demo (M10, M12):** an "실행" tab runs the ONNX file in the browser with onnxruntime-web,
  on WebGPU when available and WASM otherwise. It handles image inputs (resize, optional
  ImageNet normalization) and numeric inputs, shows Top-5 with editable class labels
  (`PUT /api/models/:id/labels`), and draws per-layer feature maps. After a run, graph nodes
  show their activation preview and runtime shape.
- **Versions (M8):** `POST/GET/DELETE /api/models/:id/versions`. Uploads carry
  `targetModelId`, and editor rights plus the 10 GiB repository limit are checked at tus
  creation. The versions tab has a size meter. `GET /diff` matches nodes by name and compares
  tensors by hashing their byte ranges. The compare page marks added and changed nodes on
  the graph.
- **Weights (M11):** a "가중치" tab with per-tensor histograms and statistics; very large
  tensors are summarized from 64 evenly spaced windows. Convolution filter grids show RGB for
  3-channel kernels and a diverging map otherwise; they are gated on download permission.
  Inspector parameter names link here.
- **Design mode (M13):** at `/designs`. Drag layers onto an `nn.Sequential` chain with live
  shape inference, mismatches in red with a one-click fix, and PyTorch export. Designs are
  saved per owner and can be shared publicly as read-only (with "내 설계로 복사").
- **Fixes found along the way:**
  - Terminating an upload that a model already consumed is now refused (409). It could delete
    a file while it was being processed.
  - The tiny CNN fixture now has a positive BatchNorm variance, so it actually runs.

### Deviations from the plan
- **M12:** instead of a server-side ONNX rewrite and a derived file, the browser appends a
  second `graph { output { name } }` message to the downloaded bytes. Protobuf merges it into
  the original graph, so the model is never re-encoded and nothing extra is stored. The
  download gate is unchanged, because the demo needs the file anyway.
- **M10:** no COOP/COEP isolation, so WASM runs single-threaded. WebGPU does not need it.
- **M8:** diff results are cached in memory (LRU of 32), not as `parsed/diff-*` sidecars.
  Storage keys are UUID-only, and diffs of immutable blobs are cheap to recompute after a
  restart. A new version is not yet counted as a trending event.
- **M13:** the migration is `002_designs.sql` (M9 was skipped). Designs have their own
  owner/public access instead of going through the model resolver, since they are a
  different object with no files to protect.

Tests after this round: unit 144; integration 121; e2e 18 (headless), including demo,
versions, weights and design. Verified on production after deploy: the demo returned the
same 43.9% top-1 as the Node reference, plus the weights histogram and design export. The
test account was deleted afterwards.

## Kirakira Orbit redesign (2026-11-09)

Mockup B ("Kirakira Orbit") applied to the app, with one change requested after review: the
collapsed sidebar is a 64px icon rail instead of the mockup's ~100px.

- Tokens: lilac paper, white content sheet with a 28px top-left radius, plum ink, deep pink
  actions; Unbounded for Latin titles and numbers, Orbit for Korean headings, JetBrains Mono for
  code. A `sticker` outline marks only the main action, the active tab and the selected node.
- Shell: a left sidebar (236px, or the 64px rail) replaces the top header on desktop, with search,
  navigation, recently opened models (localStorage, last 5) and the upload button. The graph and
  the design editor start collapsed; other pages remember the user's choice. Phones keep the top
  header.
- Repository: a hero header on the overview (title, fact pills, actions and an orbit ring of the
  op mix with the parameter count) and a one-row header on the other tabs; pill tabs.
- Graph: pill nodes with a family ring, selected node in blush with the sticker outline, canvas
  and inspector as rounded panels.
- Landing (mockup L1 v2): the hero is 見える with the op-mix ring orbiting through it and graph
  nodes on the outer orbit; trending cards with small rings; four features shown as product
  fragments. The interactive product window was removed, and the smoke test now checks the hero
  caption instead. Headings switched from Orbit to Jua. 見える uses a 948-byte subset of Dela
  Gothic One (OFL, license next to the font file) instead of the 944 KB Japanese file.
- Tests: unit 144 passed; e2e 18 passed (headless). `theme.spec.ts` now expects the new paper
  colors. Integration tests were not rerun because the server did not change.

## Demo content in production (2026-11-09)

Requested in chat: production holds seeded demo content so the site looks lived in.

- **Accounts:** five demo accounts (`mio`, `kai`, `hana`, `sora`, `jun`).
- **Models:** eight public models re-uploaded from Hugging Face. Each README credits its source and license; Gemma's notes its terms of use.
- **Activity:** stars and four issues, three of them linked to graph nodes.
- **Credentials:** emails use the reserved `seed.mieru.invalid` domain. Accounts and generated passwords are only on freeride, in `/data/projects/mieru/seed/accounts.json` (mode 600).
- **Removal:** run `seed-remove.mjs`, which sits next to `accounts.json`, in a `node:22-alpine` container on the `mieru_internal` network, with `BASE=http://mieru-app-1:3000` and `ORIGIN` set to the public origin. Deleting the accounts deletes their models, stars and issues.

## Readable URLs, overview and profile photos (2026-11-13)

**Readable URLs**
- Repositories live at `/{username}/{slug}`. Migration 004 backfills `models.slug`; the slug follows the name and is unique per owner.
- `/m/{id}` redirects to the readable path. `GET /api/models/resolve` answers 404 to anyone who can't see the repository.
- New reserved usernames: `designs`, `stars`, `activity`, `og`, `brand`, `assets`.
- The production database was dumped before migration 004 to `/data/projects/mieru/backups/predeploy-004-*.sql.gz`.

**Overview**
- Under the README: "구조 한눈에" (top-level blocks with their parameters) and an input/output table. The sidebar keeps only facts, precision and the op mix.

**Profile photos**
- Settings crops a picked image to a 256×256 PNG in the browser.
- The server accepts PNG only (512 KB, 1024 px) under a fresh key per upload, served with immutable caching.
- `avatarKey` is on user references; deleting an account deletes its photo.

**Other**
- The sign-up password notice was removed.

**Tests**
- Unit 250, integration 135 and e2e 22 pass (headless).

## Larger demo seed (2026-11-13)

Requested in chat: more demo data, made the same way as the first seed.

- **Accounts:** 15 more fictional accounts, 20 in total. Their usernames were checked to be unused on Hugging Face.
- **Models:** 30 more public models, 38 in total: 24 ONNX and 6 safetensors re-uploaded from Hugging Face. Only models whose original license is clearly Apache-2.0, MIT or BSD-3-Clause were taken. Each README names its source repository and license.
- **Activity:** 285 stars and 39 issues with replies, from the seed accounts only.
- **Timestamps:** `spread.sql` spreads creation, star and issue times over the last weeks and adds anonymous daily views (5,022 rows). It touches only rows of `@seed.mieru.invalid` accounts.
- **Rate limits:** the seed acts from the server's internal network with one made-up `X-Forwarded-For` per account, so the public per-IP limits for sign-up, stars and issues don't block it. The app trusts one proxy hop.
- **Backup:** the production database was dumped before the seed to `/data/projects/mieru/backups/preseed2-*.sql.gz`.
- **Removal:** run `seed-remove.mjs` in `/data/projects/mieru/seed2` (accounts in `accounts2.json`), the same way as for the first seed.

## Repository settings and delete (2026-11-16)

Requested in chat: delete repositories from the web, and check that repositories, issues and replies have full CRUD in the web.

- **Settings tab:** `/{username}/{slug}/settings`, shown to owners and editors. It edits the name, description and license. A new name moves the address and the page follows it.
- **Delete:** a danger section only the owner sees. The confirm button stays disabled until the repository name is typed. After deleting, the app opens `/dashboard`, drops the repository's cached pages and refreshes the lists, the explore sections, stars and activity. It uses the existing `DELETE /api/models/:id`; the server was not changed.
- **CRUD check:**
  - Before this change the web could create, read, edit the README and change visibility, but not edit the name, description or license, and not delete.
  - Issues and replies already had create, read, edit and delete in the web, plus close and lock.
- **Shared pieces:**
  - The license list moved to `models/labels.ts`.
  - The settings section layout moved to `design/ui/SettingsPanel.tsx`.
  - `ConfirmDialog` takes an optional input and `isConfirmDisabled`.
- **Tests:** `e2e/repo-settings.spec.ts` covers rename, delete after typing the name, and no settings for a signed-in visitor. `npm run lint` (1 existing warning), `npm run typecheck`, `prettier --check .`, unit 250, integration 135 and e2e 26 all pass locally. Not deployed.

## Needs manual check

- **First admin:** `docker exec mieru-app-1 node dist/scripts/admin.js grant <username>` after
  you sign up.
- **First backup was empty:** the sidecar's first dump ran a second before migrations, so it has
  no tables. The next run at 04:15 KST will have data.
- **A 1+ GiB upload over the public domain** through Cloudflare.
- **Brand (B.1/B.3):** the logo is still the keyed PNG from `docs/brand/logo-final.jpg` (kept on
  purpose). `kill-ai-slop` ran as part of the redesign review; `impeccable` was not run.
- **Graph quality and performance (3.7)** on real models (ResNet-50, BERT-base, a small LLM). The
  synthetic large graph was reviewed visually only; no first-render or memory numbers were
  measured.
- **Dark mode (3.9):** checked by headless screenshots and a computed-style e2e test instead of
  pixel baselines, because timestamps and usernames in the data make baselines flaky.
- **Admin UI (7.3):** the Playwright test covers report → takedown → restore. Dismissing a report
  and deleting an issue are covered by integration tests only.
- **WebGPU on real hardware:** headless tests run on WASM. Large models in the demo (hundreds of
  MB) and diffs of multi-GB versions have not been timed.
- **Trending feel** with real traffic (weights in §8.7 are a starting point).

## Open questions

- Should a GitHub remote be set up for `main`? There is none yet, so the deploy ships a
  `git archive` snapshot over SSH.
