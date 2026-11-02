# mieru — implementation report (Release 1)

## Status

**Release 1 is code-complete locally** (M0–M7, M-R code, dark mode, favicon). Steps that need
freeride, the domain, or a human eye are still open; see "Needs manual check". Nothing has been
pushed. P1/P2 milestones (M8–M13) have not been started.

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
  processing, trending freshness and backup age. Multi-stage non-root Dockerfile, backup script,
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

## Needs manual check

- **Deploy (R.1/R.2):** building the image on freeride and the first Dokploy deploy at
  `mieru.byeolki.me`. Docker was not run locally; the compiled layout was checked without it.
  Also needs: the host directories with `sudo` (`docs/deploy.md` §2), `TRUST_PROXY=2`
  verification via the Settings session IP, and the Uptime Kuma monitor on
  `/api/health/deep`. All of this needs a push and work on freeride, which I didn't do without
  your go-ahead.
- **Backups (R.3):** scheduling `scripts/backup.sh` in Dokploy and the restore drill into a scratch
  DB. The script has only been syntax-checked (`bash -n`).
- **A 1+ GiB upload over the public domain** through Cloudflare.
- **Brand (B.1/B.3):** the logo is still the keyed PNG from `docs/brand/logo-final.jpg`; the
  SVG redraw with real lettering isn't done. The `impeccable` / `kill-ai-slop` polish passes were
  not run.
- **Graph quality and performance (3.7)** on real models (ResNet-50, BERT-base, a small LLM). The
  synthetic large graph was reviewed visually only; no first-render or memory numbers were
  measured.
- **Dark mode (3.9):** checked by headless screenshots and a computed-style e2e test instead of
  pixel baselines, because timestamps and usernames in the data make baselines flaky.
- **Admin UI (7.3):** the Playwright test covers report → takedown → restore. Dismissing a report
  and deleting an issue are covered by integration tests only.
- **Trending feel** with real traffic (weights in §8.7 are a starting point).

## Open questions

- Should `docs/brand/` (the Grok logo drafts and `logo-final.jpg`) be committed? It is still
  untracked.
- Go-ahead to push `main` and do the first Dokploy deploy on freeride (deploy guide, host
  directories, backup schedule)?
