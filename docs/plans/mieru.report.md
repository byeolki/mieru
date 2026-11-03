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
- **Trending feel** with real traffic (weights in §8.7 are a starting point).

## Open questions

- Should a GitHub remote be set up for `main`? There is none yet, so the deploy ships a
  `git archive` snapshot over SSH.
