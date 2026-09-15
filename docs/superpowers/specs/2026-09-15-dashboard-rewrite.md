# Dashboard Rewrite — Frozen Spec

**Status**: frozen (2026-09-15). Implementation agent: `toasted-waffle`.
**Worktree**: `/Volumes/DataSSD/Code/github/azyu/bitbucket-codex-code-review/.claude/worktrees/new-dashboard`, branch `worktree-new-dashboard`, based on `5d03634` (= `main`).

This document is the contract. Anything it does not constrain is the implementing
agent's call — in particular **all visual design, layout, information hierarchy,
component decomposition, and theming are delegated**, not specified here.

---

## Goal

Replace the current `/dashboard` with a real operations tool. The existing one is a
demo: the entire page — HTML, CSS, and the Alpine application — lives inside three
template-literal constants in `src/app.service.ts` (1932 lines), which means no
editor syntax support, no component boundaries, no frontend tests beyond string
assertions, and no build step.

The rewrite discards that page entirely. It does not preserve its markup, its CSS,
its section layout, or its Alpine code.

## Non-Goals

- No change to the review pipeline (webhook, queue, workspace, codex, Bitbucket).
- No change to the authentication model (see Invariants).
- No new auth provider, session cookie, or user store.
- No change to `/health` or the `/api/webhooks/*` routes.
- No SSR, no server-side templating, no new HTTP server.

---

## Decisions (fixed by the user on 2026-09-15)

| Decision | Value |
|---|---|
| Stack | Vite + a component framework, TypeScript, as a separate package |
| Framework | React or Svelte — implementing agent chooses |
| Backend | **Extensible.** New endpoints and queries in `src/internal/` and `src/review/` are in scope |
| Old dashboard | Discarded, not migrated |
| Tracking | [#100](https://github.com/azyu/bitbucket-codex-code-review/issues/100); PR body carries `Closes #100` |

---

## Invariants — must survive the rewrite

These are security properties, currently enforced by `src/internal/dashboard-auth.guard.ts`
and by the ten dashboard tests in `src/app.controller.spec.ts`. They came from the
hardening commit `bb674dd` (issue #99). Deleting the old tests is expected;
dropping the behavior is not.

1. **Bearer key, memory only.** Every `/api/internal/*` request carries
   `Authorization: Bearer <DASHBOARD_SECRET_KEY>`. The key is never written to
   `localStorage`, `sessionStorage`, a cookie, the URL, or the DOM. A reload
   returns to the lock screen.
2. **Comparison is constant-time** and length-checked — server side, unchanged.
3. **401 ⇒ full lock.** Any 401 clears *all* client state: the key, every loaded
   document, and every in-progress draft — including secret inputs and the custom
   prompt textarea. Not just the failing view.
4. **Stale-session guard.** A response for a request issued before a lock or
   re-unlock must not mutate state belonging to the session after it. The current
   implementation does this with a monotonic `dashboardSession` counter plus a
   sentinel error; the mechanism may change, the property may not.
5. **Secrets are never returned.** The API exposes only
   `ISecretStatus = { configured, source }`. The UI renders status, never a value,
   and never a masked-but-real value.
6. **CAS on every settings write.** `expectedRevision` is sent; a `409` reloads the
   document and tells the user the write did not apply. A 409 is never retried
   silently.
7. **CSP may tighten, never loosen.** Current dashboard policy in `src/main.ts:33`:
   `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `style-src` allowing
   jsdelivr + fonts.googleapis, `font-src` fonts.gstatic, `connect-src 'self'`,
   `img-src 'self' data:`. `'unsafe-eval'` exists only for Alpine's expression
   evaluator — **with Alpine gone it must be removed**. Self-hosting fonts and CSS
   (dropping the two external origins) is preferred; if kept, say why in the PR.
8. **The lock screen is the public shell.** The unauthenticated document must not
   contain settings values, repository names, or review content.

---

## Backend contract

`src/internal/internal.controller.ts` is the source of truth, not the README table
(which omits `/reviews/recent`). All routes sit behind `DashboardAuthGuard` and
return `Cache-Control: no-store`.

### Existing routes — these keep working

| Method | Path | Response type |
|---|---|---|
| GET | `/api/internal/settings` | `ISettingsDocument` |
| PATCH | `/api/internal/settings/global` | `ISettingsScopeDocument` |
| PATCH | `/api/internal/settings/repositories/:workspaceSlug/:repositorySlug` | `ISettingsScopeDocument` |
| GET | `/api/internal/reviews/recent?limit=` | `IRecentReview[]` — limit clamped to 1..50, default 10 |
| GET | `/api/internal/reviews/:workspaceSlug/:repoSlug/:prId/latest` | `ReviewRunEntity \| null` |
| GET | `/api/internal/reviews/:id` | `ReviewRunEntity \| null` |
| GET | `/api/internal/stats/repos` | `IRepoStatsOverview[]` |
| GET | `/api/internal/stats/repos/:workspaceSlug/:repoSlug` | `IRepoStatsOverview` |

Response types are defined in `src/review/review.service.ts` and
`src/settings/runtime-settings.types.ts`. Read them there; do not re-declare them
by hand in the frontend if a shared type import is possible.

Route-ordering trap: `reviews/:workspaceSlug/:repoSlug/:prId/latest` is declared
**before** `reviews/:id`. Preserve that order if these are touched.

### Extending the backend

Permitted, and expected if the UI needs data the current API cannot express.
Known gaps: no time series, no status/date/repo filtering, no cursor pagination,
no per-repository review list.

Constraints on any new query:

- `review_runs` has exactly two indexes today —
  `(repositorySlug, pullRequestId, createdAt)` and `UNIQUE(idempotencyKey)`
  (`src/entities/review-run.entity.ts:22-24`). A new access pattern that does not
  hit one of them needs a migration adding an index, in the same PR.
- `DB_SYNCHRONIZE` is `false`. Schema changes ship as TypeORM migrations under
  `src/database/migrations/` and must run through `pnpm database:prepare`.
- `sanitizeErrorMessage()` (`src/review/review.service.ts:78`) strips emails,
  UUIDs, git SHAs, and absolute paths. Any new route returning an error string
  passes through it.
- New routes go behind `DashboardAuthGuard` and return whitelisted fields, per the
  warning comment at the top of `internal.controller.ts`.
- Note `/api/internal/reviews/:id` is currently unbounded — issue #84 tracks rate
  limiting it. Do not solve #84 here; do not make it worse (no unbounded fan-out
  of detail requests from a list view).

### Settings contract

Value whitelists, from `src/settings/runtime-settings.service.ts:40-64`:

- **Global values**: `model`, `reasoningEffort`, `timeoutMs`, `customPrompt`,
  `openaiBaseUrl`, `triggerMode`, `retryAttempts`, `retryDelay`,
  `workerConcurrency`, `cloneTimeoutMs`
- **Repository values**: `model`, `reasoningEffort`, `timeoutMs`, `customPrompt`
- **Global secrets**: `openaiApiKey`, `bitbucketApiToken`, `webhookSecret`
- **Repository secrets**: `bitbucketApiToken`, `webhookSecret`

Validation (`validateValue`, same file, line 352):

- `model` — string, ≤ 64 chars, `/^[A-Za-z0-9][\w.-]*$/`
- `reasoningEffort` — `"" | none | low | medium | high | xhigh | max`
- `triggerMode` — `mention | auto | both`
- `openaiBaseUrl` — `""` or an **HTTPS** URL, ≤ `MAX_OPENAI_BASE_URL_BYTES`
- `customPrompt` — ≤ 100 000 chars
- integers — `retryAttempts` ≤ `MAX_QUEUE_RETRY_ATTEMPTS`, `workerConcurrency` ≤
  `MAX_WORKER_CONCURRENCY`, everything else ≤ `MAX_TIMER_MS`; minimum 1 except
  `retryDelay`, whose minimum is 0

**Import the limit constants from `src/config/configuration.ts`. Do not hardcode
them in the UI** — the current dashboard already interpolates them, and that
property must not regress.

Semantics:

- Repository scope: `null` means *inherit from global*. `""` is a value, not an
  inherit.
- `basicCredential` is global-only; sending it to the repository route is a 400.
- Secret mutations are `{ operation: "replace", value }` or `{ operation: "clear" }`.
- Changing the repository identity fields invalidates a loaded repository draft —
  the user must re-load before saving. The current UI enforces this with a
  `repositoryLoadedIdentity` comparison; keep the property.

---

## Serving and build

### Package layout

The repo has no pnpm workspace today. Add `pnpm-workspace.yaml` covering the root
and the new dashboard package. Keep the dashboard's dependencies out of the
runtime image's production dependency set — it ships as built static assets, not
as a runtime dependency.

### Routes and prefix

`/dashboard` stays as the entry URL. It is in the README, and it is what operators
have bookmarked.

Two places in `src/main.ts` must agree with whatever asset paths are chosen:

1. `setGlobalPrefix("api", { exclude: [...] })` at line 22
2. the `dashboardPaths` Set at line 26, which selects the relaxed CSP

Both currently hold a hardcoded three-entry list. Vite emits content-hashed
filenames, so an exact-match Set will not work — serve the assets under a single
prefix (e.g. `/dashboard/assets/...`) and match by prefix in both places. A new
asset path that is added to only one of the two produces either a 404 or the wrong
CSP, with no error.

### Container

`Dockerfile` today has `deps` → `build` (runs `nest build`) → `runtime`, and the
runtime stage copies only `/app/dist` plus production `node_modules`. The
dashboard build output must reach the image — either built in the `build` stage
and copied, or emitted into `dist/`. Confirm by running the built image, not by
reading the Dockerfile.

`nest-cli.json` has no `assets` entry, so non-TS files under `src/` are **not**
copied to `dist`. This is the trap that makes a locally-working static file 404 in
the container.

### CI

`.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile`, `pnpm build`,
`pnpm test`. Root `pnpm build` and `pnpm test` must cover the dashboard package
after the rewrite — either by delegating to it or by adding steps. A dashboard
that builds only via a package-local command is not covered by CI.

---

## Demolition list

Remove in the same PR, once nothing references them:

- `src/app.service.ts` — `DASHBOARD_HTML`, `DASHBOARD_SCRIPT`, `ALPINE_SCRIPT`,
  every `ICON_*` constant, the `alpineRequire` / `createRequire` shim, and the
  three methods `getDashboardPage`, `getDashboardScript`,
  `getDashboardAlpineScript`. `getHealth()` stays.
- `src/app.controller.ts` — the three `@Get("dashboard*")` handlers, replaced by
  whatever serves the new page.
- `src/app.controller.spec.ts` — ten of its eleven tests exercise the old Alpine
  app by evaluating the script string. They go with it. The **eleventh**
  (`"should return health text"`) stays. The invariants those ten covered move to
  the new frontend's tests — see Invariants 3, 4, 5.
- `alpinejs` in `package.json` dependencies, once nothing imports it.
- `src/main.ts` — `'unsafe-eval'` from the dashboard CSP (Invariant 7).

Leave `scripts/seed-review-stats.sql` in place; it is how the dashboard gets demo
data locally and the README now documents it.

---

## Definition of Done

Per `AGENTS.md`, plus the parts this rewrite changes:

- [ ] `pnpm build` succeeds — including the dashboard package
- [ ] `pnpm lint` clean
- [ ] `pnpm test` passes — including dashboard tests
- [ ] Coverage: the existing 80% bar applies to `src/` (backend). **The dashboard
      package needs its own stated bar** — propose one in the PR with the reasoning,
      since `jest.config.ts` enforces no threshold today and the number has been a
      checklist item, not a gate.
- [ ] Invariants 1–8 each have a test or a stated reason why they cannot
- [ ] Security checklist: no hardcoded secrets, input validated at the boundary,
      no error leakage
- [ ] Verified against a running instance with real data, not only unit tests:
      `docker compose up -d mysql redis`, `pnpm database:prepare`, seed SQL,
      `pnpm start:dev` — the README's Local Development section has the full
      sequence
- [ ] Verified in the built container image, since the asset-path traps above only
      appear there
- [ ] Issue #100 updated with verification results; `in-progress` → `awaiting-review`
- [ ] Commit approval requested before committing (AGENTS.md)

---

## Handoff

- Work in the worktree above, on `worktree-new-dashboard`. It is clean and current.
- Claim issue #100 first, per AGENTS.md: add `in-progress` + assignee, comment
  `Claimed by toasted-waffle: <one-line plan>`, re-read comments, yield to any
  earlier active claim.
- PR targets `main`, body contains `Closes #100`.
- Cross-link issue #76 (review input prompt in the dashboard) — it is adjacent
  work, not part of this spec.
- Open questions go back on issue #100, not into an assumption.
