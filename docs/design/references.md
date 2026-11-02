# UI references (Dribbble, collected 2026-11-02)

Patterns adopted for mieru. Structure is borrowed; palette always comes from our tokens.

| Shot | Designer | What we take |
|---|---|---|
| [Resend dashboard redesign](https://dribbble.com/shots/27517776) | Saasfactor | Light sidebar with grey pill for the active item; page title + pill tabs; plain stat row (no cards); 44px table rows with tinted status chips; list and card views share one toolbar |
| [CodeNest](https://dribbble.com/shots/27749540) | Keitoto | `owner / project` top bar; icon + label tabs with 2px underline (repository tabs); outlined filter pills; two-line rows; empty states that explain why and show copyable values |
| [Sakani developer gateway](https://dribbble.com/shots/27753190) | Sam | Version pill beside the title; status chips with icons (not color alone); big number + lighter unit + thin quota bar (repository size meter) |
| [Connected repository settings](https://dribbble.com/shots/25245062) | usrnk1 | Narrow settings column; rows = title + badge + description + control on the right, hairline separators; danger zone set apart |
| [AI model catalog card](https://dribbble.com/shots/27195657) | Dmitry Sergushkin | Meta row with hairline separators; chips tinted by kind (format, task, size); copyable "load this model" snippet |
| [Repository network card](https://dribbble.com/shots/21265476) | Moty Weiss (Cycode) | Closest graph + inspector reference: dot-grid canvas, white node cards with icon tile + two lines, selected node with 1.5px accent border, docked right inspector with tabs and a key/value grid |
| [Integrations flowchart](https://dribbble.com/shots/24871564) | Moty Weiss (Cycode) | Floating bottom-center pill toolbar (zoom, fit, layout, minimap); search box with shortcut hint |
| [Workflow creation](https://dribbble.com/shots/26917236) | Nane Kharatyan | Node card anatomy; one-color 1.5px edges with rounded elbows on a sparse dot grid |
| [Foundry node editor](https://dribbble.com/shots/27382163) | Hunter Yip | (dark, structure only) Palette grouped by category color; inspector sections with key/value rows |
| [UX research metrics](https://dribbble.com/shots/26451233) | Dmitry Sergushkin | One totals strip with deltas instead of a KPI card grid |
| [Quarren research repository](https://dribbble.com/shots/27852058) | Radiyyan Rava Ghifari | Threads that link back to their source (issue node chips that open the graph at that node) |
| [Glow Up Y2K landing](https://dribbble.com/shots/27686678) | Allan Rosales | Y2K chrome/sparkle only for hero, 404, empty states — never app chrome |

## Rules derived from them

1. **Repository pages use a top bar + tabs, not the sidebar.** 개요 / 그래프 / 통계 / 이슈 (+ 정보), icon + label, active = ink text + 2px `primary` underline, counts in grey pills. The sidebar stays for dashboard, Explore and settings.
2. **Repository header:** `owner / name`, visibility badge, split "스타 | 128" button, 공유 button; meta row with hairline separators; chips tinted by kind.
3. **개요 tab:** README column ≤ 720px; 280px 정보 column with a monospace key/value grid, graph thumbnail, copyable load snippet.
4. **Graph canvas:** full-bleed, `paper` background, dot grid every 16–20px; white node cards (1px border, 8px radius) with a family icon tile, 13px semibold op name, 11px mono shape; at most **six muted op families** (compute, attention, normalization, activation, shape & pooling, other); selection = 1.5px `primary` border + soft ring; hover highlights upstream/downstream edges and dims the rest to 40%; floating bottom-center pill toolbar; search top-left; minimap bottom-right.
5. **Inspector is docked** (≈320px, collapsible), never floating: header with copy-ID, 속성 grid, 입출력 with shape/dtype chips, 파라미터, 관련 이슈 + "이 노드로 이슈 열기". Empty state shows the whole-model summary.
6. **Explore = rows, not cards** (64–72px): avatar, `owner/name`, one-line description, 2–3 chips, stars and time on the right; outlined filter pills; 오늘 / 이번 주 / 이번 달 segmented control.
7. **Issues:** GitHub-style list with status icon, kind chip, node chip (`⌖ Conv_12`); thread in one 760px column, bordered comment boxes with a header band, grey timeline events between; node chips preview on hover and open the graph.
8. **Dashboard:** one totals strip (stars this week, views, open issues), recent activity, compact model list; first visit = one empty-state card with a small Y2K sticker.
9. **Upload:** 파일 → 확인 → 정보 on one page; dashed `lilac` drop zone; show parse results (node count, ops, warnings, graph preview) before naming; visibility as radio cards; inline errors with copyable details.
10. **Settings:** narrow column, row layout with hairlines, danger zone set apart; typed confirmation.

## Color rules
- `primary` (#BC3D86) is the only accent for text, links, tab underlines, selection (4.7:1 on paper).
- `mieru-pink` and `lilac` are fills/borders only; text on them is `sumi`.
- **Tinted chips use `sumi` text**, never `primary` on a pale pink (fails 4.5:1).
- Errors and destructive actions use `danger` red with an icon, never brand pink.
- No dark/neon canvases, no iridescent chrome in app UI, no KPI donut grids, no letter-spaced all-caps labels (meaningless in Korean).
