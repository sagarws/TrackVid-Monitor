# TrackVid-Monitor — Claude Instructions

> **Orientation.** Read this header, then the rules below. Both are binding.

|  |  |
|---|---|
| **Tier** | **1 — control plane.** Writes the settings two runners obey at runtime. |
| **Stack** | Next.js App Router + MUI 7 + Prisma + next-auth v4 + Redux Toolkit + react-hook-form/valibot + Tiptap + Iconify |
| **Package manager** | **`pnpm`** — not npm, not yarn |
| **Dev** | `pnpm dev` → http://localhost:4001 |
| **Verify** | `pnpm lint` · verify UI changes in the browser before declaring done |

## Layout

```
src/app/[lang]/…     App Router pages — thin, delegate to views/
src/app/api/*        proxy routes to TrackVid-BE, attach SystemAdmin token server-side
src/views/<feature>/ the real page implementations
src/components/      your components
src/@core/ @layouts/ @menu/     READ-ONLY template code — never edit
src/libs/ src/hooks/ src/utils/
```

## Cross-repo

| | |
|---|---|
| **Calls** | TrackVid-BE only — Monitor holds no DB credentials and calls no runner directly |
| **Affects** | Automated-Scripts and Trackvid-CMS, at runtime, with no code change — via the settings it writes |


## Do not

- **Do not edit `src/@core/`, `src/@layouts/` or `src/@menu/`.** They are read-only template code. Wrap them in `src/components/` or `src/libs/` instead.
- **Do not use npm or yarn.** `pnpm` only.
- **Do not invent a new top-level folder under `src/`.**
- **Do not hard-code a platform list or `switch` on a platform name.** Render what `GET /system-admin/setting/companies/automation-routing` returns — a list typed into a `.tsx` silently omits every platform added later.
- **Do not invent a platform key.** Match `PLATFORM_AUTOMATIONS` exactly, casing included, or you write a setting nothing reads.
- **Do not send a whole settings map.** The endpoints take partial maps and write dotted paths; sending everything overwrites what another operator just changed.
- **Do not call a runner or the database directly.** Everything goes through TrackVid-BE, with the SystemAdmin token attached server-side so it never reaches the browser.
- **Do not add a parallel library** to the fixed stack (MUI 7, react-hook-form + valibot, RTK, Prisma, Tiptap, Iconify, date-fns, @tanstack/react-table, apexcharts/recharts, react-toastify, next-auth v4).
- **Do not maintain locale files.** English-only; do not import from `src/data/dictionaries/*`.

## You are the control plane

This app writes the settings that decide how automations behave in two other
repos. A toggle changed here takes effect on the next automation run, on a
machine nobody is watching.

```
Trackvid-Monitor ──┐                                   ┌── Automated-Scripts ──┐
  (control plane)  │                                   │   (server runner)     │
                   ├──→  TrackVid-BE  ──────────────→  │                       ├─→ @trackvid/
Trackvid-CMS ──────┘   (API + Mongo + sockets)      ↑  └── Trackvid-CMS ───────┘   automation-core
  (desktop runner)                                  │      (desktop runner)          (shared code,
                                                    │                                 submodule)
                              *_SCRIPT_URL ─────────┘
                        BE forwards work to Automated-Scripts
```

| Repo | Role | What it can break |
|---|---|---|
| **TrackVid-BE** | API, Mongo schema, sockets, forwards work to the runner | everything |
| **TrackVid-Automation-Core** | shared automation code, pinned separately by each runner | both runners |
| **Automated-Scripts** | runs automations on the server; also the target of BE's `*_SCRIPT_URL` calls | BE flows that forward to it |
| **Trackvid-CMS** | runs automations on an operator's machine | itself |
| **Trackvid-Monitor** | writes the settings that decide how the runners behave | both runners, at runtime |

**What a change here reaches:**

- **`settings.desktopExecution`** decides whether a claim runs on the server or is
  pushed to an operator's desktop app. Turning it on for a platform with no
  desktop client connected leaves those claims queued and unworked — and a queued
  claim looks exactly like one that has not run yet.
- **`settings.apiBasedAutomation`** picks the direct-API flow over the
  browser-driven one, per platform, per automation. Automated-Scripts reads it
  through the core's `automationRouting` helper and falls back to the legacy
  `*_APIBASE_AUTOMATION` env vars when unset.
- **`settings.masterImportSyncTime`** is when the desktop app starts its master
  import, as `"HH:mm"` in IST.
- **`settings.isAutoLoginOnActiveSession`** decides whether re-capturing a
  platform session signs in by script instead of asking the operator to type
  the password. Flat `{ <platform>: boolean }` — one flag per platform, not per
  automation, because one sign-in serves every automation on that platform.
  **This one is a security control, not a preference:** the backend gates
  `POST /cms/credential-secret` — the only endpoint that emits a stored
  marketplace password — on the same flag, so turning it off here genuinely
  stops the password being reachable by the desktop app.
- **`settings.integrationAccess`** decides which integrations the web FE renders.

**Rules:**

1. **Everything goes through TrackVid-BE.** Monitor holds no database credentials
   and calls no runner directly; every `src/app/api/*` route is a proxy that
   attaches the SystemAdmin token server-side so it never reaches the browser.
   Keep it that way — the one exception is the local agent
   (`LOCAL_AGENT_URL`, port 7788), which is developer tooling, not production.

2. **A settings UI must render from what the server declares**, never from a
   hardcoded list. `automation-routing` returns `platformAutomations`; use it, so
   a switch can never appear for a platform/automation pair that does not exist.

3. **Write only what changed.** The settings endpoints take partial maps and write
   dotted paths. Sending a whole map would overwrite pairs another operator just
   changed.

4. **Before changing a payload you send to BE**, check the endpoint's other
   callers — several are shared with the desktop app.

The automation core's contract is in
`Automated-Scripts/packages/TrackVid-Automation-Core/CLAUDE.md`; the backend's is
in `TrackVid-BE/CLAUDE.md`.


**Read [`DEVELOPMENT_RULES.md`](./DEVELOPMENT_RULES.md) at the start of every session and follow it for ALL work in this repo.** It is the source of truth for how code is added, organized, and reviewed in this project. The points below are the non-negotiable summary — the full rationale, tables, and checklists are in that file.

## Non-negotiable rules

1. **Reuse first, create second.** Before writing anything new, search `src/views/`, `src/components/`, `src/hooks/`, `src/utils/`, `src/@core/components/`, and MUI. Only add new files when nothing existing fits.
2. **Keep the folder structure as-is.** Never invent new top-level folders under `src/`. New code goes in the existing folder that matches its role (see the "Where does new code go?" table in `DEVELOPMENT_RULES.md`).
3. **`src/@core/`, `src/@layouts/`, `src/@menu/` are READ-ONLY.** Do not edit, rename, move, or delete anything inside them. Wrap them in `src/components/` or `src/libs/` if you need different behaviour.
4. **Fixed tech stack.** Use only libraries already in `package.json` (MUI 7, react-hook-form + valibot, Redux Toolkit, Prisma, Tiptap, Iconify, `date-fns`, `@tanstack/react-table`, apexcharts/recharts, react-toastify, next-auth v4). Do not introduce parallel libraries. Any new dependency requires justification.
5. **Package manager is `pnpm`.** Not npm, not yarn.
6. **App Router + `[lang]` i18n.** Pages live under `src/app/[lang]/…`; page files stay thin and delegate to `src/views/<feature>/`.
7. **Server Components by default.** Add `'use client'` only when hooks/events/browser APIs are actually needed.
8. **Theme + i18n over hardcoding.** Use theme tokens for colors/spacing; do not hardcode translatable strings.
9. **Path aliases.** Import via `@core/*`, `@layouts/*`, `@menu/*`, `@/*` (see `tsconfig.json`). Avoid deep relative paths.
10. **Dev server runs on port `4001`** (`pnpm dev`). Verify UI changes in the browser before declaring done.
11. **Cross-repo work follows the other repo's rules.** When a task needs changes in another TrackVid repo (`TrackVid-BE`, `TrackVid-FE`, `TrackVid-App`), read that repo's own `CLAUDE.md` first and let it govern the code added there — its checklist (auth tier per route, index/sargability of new queries, batch-size caps, migration and deploy order) wins over anything in this file. Report the change sets per repo and state the deploy order: BE ships before Monitor whenever the API contract changes.
12. **English-only.** Do not maintain `src/data/dictionaries/en.json` (or any locale file). Do not import from `src/data/dictionaries/*` in new code. Hardcode English UI strings. `[lang]` stays in routes but is effectively fixed to `en`.

## Definition of done (Claude checklist)

Before reporting a task complete:

- [ ] Reused existing template code wherever possible.
- [ ] New files landed in the correct existing folder.
- [ ] Zero modifications inside `@core/`, `@layouts/`, `@menu/`.
- [ ] No new dependency added without justification.
- [ ] `pnpm lint` passes (or explain the failure).
- [ ] For UI changes, feature verified at `http://localhost:4001`.
- [ ] Any change made in another repo followed that repo's `CLAUDE.md`, and the deploy order is stated.

If any rule here blocks legitimate work, **flag it to the user and propose an edit to `DEVELOPMENT_RULES.md`** — do not silently break the rule.
---

## Platform-wise structure (mandatory)

The three code repos this control plane drives organise every automation file by
platform: `platforms/<platform>/<automation-type>/<flow>/`, with `common/` at
each level for shared code. You write the settings those trees obey, so the
same discipline binds the settings UI:

- **Never hard-code a platform list in a component.** The platforms and their
  automation types come from the backend's `PLATFORM_AUTOMATIONS`
  (`GET /system-admin/setting/companies/automation-routing`). A list typed into
  a `.tsx` file silently omits every platform added later, and the operator can
  then never route it.
- **Never `switch` on a platform name.** Render the platforms the API returned.
- Platform-specific UI, if it is ever genuinely needed, goes in a
  platform-named directory — not a platform name inside a shared filename.
- Shared behaviour goes in one shared file, never pasted per platform.

A toggle written here changes runtime behaviour in both runners with no code
change at all, so a platform key you invent that the runners do not know is a
setting nothing reads. Match `PLATFORM_AUTOMATIONS` exactly, including casing.

<!-- BEGIN trackvid-review-rules v1 — identical in every TrackVid repo under D:\Sagar. Edit all copies together. -->
## Review rules — applied WHILE developing, not after

These rules bind every change made in this repo, from the first line written.
The goal is that a finished feature needs no separate review pass.

**While writing code:** apply LAYERS 1–10 below as you go. When a choice would
violate one (unguarded route, unindexed query, listener without teardown,
renamed contract field…), make the compliant choice instead and say why in one
line. Do not leave a known Blocker or High in code you hand back.

**Before saying a feature is done** — every time, without being asked:

1. Diff the whole branch, not just the last edit:
   `git fetch origin && git diff origin/main...HEAD` plus `git status` for
   uncommitted work. Commits already on `main` are not part of the review.
2. Run every LAYER below against that diff. Layers marked (BE) apply to
   TrackVid-BE; in other repos, apply their intent to whatever plays that role
   (IPC handlers, local DB, socket handlers) or mark them N/A.
3. Fix every Blocker and High in place. Leave Medium/nits listed, not fixed,
   unless trivial.
4. Run this repo's verify command (build + tests). Report real results.
5. Check sibling repos for any contract you touched (LAYER 7). They sit next
   to this one under `D:\Sagar\` — TrackVid-BE, TrackVid-FE, Trackvid-CMS,
   Trackvid-Monitor, TrackVid-app, Argos-Watch-TrackVid-App,
   TrackVid-Mobile-app, TrackVid-Print-Agent, Automated-Scripts,
   TrackVid-Automation-Core. Grep them; don't assume.
6. Report in the OUTPUT FORMAT below.

For each LAYER, state what you actively verified, what you skipped and why,
and what you couldn't verify without runtime access.

### OUTPUT FORMAT
- Verdict: MERGE / MERGE WITH FIXES / DO NOT MERGE
- Blockers (critical): each with file:line + failure scenario + 1-line fix
- High: same shape
- Medium / nits: brief
- What looks good: table of key design decisions worth preserving
- Deploy checklist: pre-deploy blockers, post-deploy monitoring, deploy order

### LAYER 1 — CODE QUALITY (FE + BE)
- Silent breakage: trace every changed function through every caller.
  No unrelated behavior change without callout.
- CPU/RAM: no new loops over large arrays in render, no cloning of big
  objects per keystroke, no unbounded state/collection growth.
- Memory leaks: every addEventListener, setInterval, setTimeout,
  URL.createObjectURL, AbortController, subscription has matching teardown.
- Race conditions: unmount guard, AbortController, seqRef for out-of-order
  network responses, effect keys for stale closures.
- Error handling: undefined/null/empty/network-fail/stale-token/perm-denied
  all have defined behavior. No silent `catch {}` without comment explaining
  why swallowing is correct.
- Security: no `dangerouslySetInnerHTML` with untrusted input, no `eval`,
  no shell string building, no `javascript:` URL reaches `<a href>`/`<img src>`.
- Duplication: grep for existing helper before adding new one.

### LAYER 2 — AUTH & ROUTES (BE)
For every new/modified route:
- Middleware present? Which tier?
  - `authMiddleware` = any logged-in user (weakest)
  - `adminAuth(["permission"])` = admin with permission
  - `systemAdminAuth, adminOnly` = system admin (strongest, use for
    destructive/cross-company writes)
- Destructive endpoint (delete, bulk update, cross-company mutate) MUST
  be sysadmin-gated.
- Every read/write scoped by `companyId` from `req.user`?
- Blast radius: single-tenant / multi-tenant / global? Match to auth tier.

### LAYER 3 — DB QUERIES (BE)
For every new find/findOne/updateMany/aggregate:
- Which index serves it? Explicit — name the index.
- `$regex` — indexable only if anchored `^` AND no `i` flag. Otherwise
  collscan. Case-insensitive → use `collation({strength:2})` + collation
  index, not regex.
- `$or` — each branch needs its own compound index.
- `$expr` with `$toLower`/`$toUpper` → collscan, not sargable.
- Compound index prefix: equality fields first, then range/sort.
- `.lean()` on read-only queries.
- `.select()` on large docs (avoid full-doc reads).
- `bulkWrite({ordered:false})` — check per-op errors, don't just report
  queued count as success.

### LAYER 4 — MODELS / MIGRATIONS (BE)
- New schema field: existing rows still validate? Default value sensible?
- Enum expansion: grep every `switch` consumer for missing case handling.
- Field rename: migration script included OR legacy shape preserved via
  fallback lookup?
- Snapshot vs live-lookup: if you snapshot at create time, changes to
  source data after don't propagate. Confirm intent.
- Legacy row shapes on hydration — reconstruct don't overwrite.
  Common bug: `typeof x[0] !== 'string'` check on array → treats legacy
  string[] as unseeded → wipes data on next save.

### LAYER 5 — BULK / BATCH OPS
- Batch size cap declared as constant.
- Per-row error accumulation, not silent drop.
- Atomicity guarantee stated (all-or-nothing, best-effort, transactional).
- Mock Response objects (if invoking a handler in-process) stub the
  FULL Response surface, not just status/json — future handler edits
  reaching for setHeader/write/pipe must not throw TypeError.

### LAYER 6 — BUSINESS INVARIANTS
- Status transition gates preserved (e.g. don't demote RESOLVED → PENDING).
- Silent overwrites: does new code stomp operator-set fields
  (remark, status, notes) that user typed manually?
- Bulk paths respect the same gates single-row paths enforce.

### LAYER 7 — CROSS-FILE WIRING
- Hook consumers destructure every prop they need.
  Regression pattern: hook adds new field, half the callers pick it up.
- Duplicate lookups: same BE endpoint called from two places for same
  keystroke? Consolidate.
- BE contract change: verify App/scripts/other repos still match.
- Route ordering: `/foo/:id` before `/foo/bulk` catches "bulk" as id.
- Duplicate route registrations (dead code but confusing).

### LAYER 8 — PR DISCIPLINE
- Own CLAUDE.md rules — does THIS change violate them? (Common: PR that
  adds "no regex" rule uses regex 3 places.)
- Deleted UX affordances (Cancel button, banner, exit path) — was
  the deletion intentional? Left user stuck?
- Prior-review findings — did the developer actually fix them or
  just add optional chaining and call it fixed?
- Constants / slug tables: dead OR-arms (`x === "a" || x === "a"`),
  typos (`naykaa` vs `nykaa`), duplicate map entries.

### LAYER 9 — DEPLOY RISK
- Blast radius per blocker: single user / single company / all companies.
- Deploy order: BE before FE if contract change; App last (or
  simultaneously via version-gate) if App relies on new BE fields.
- What breaks between "merge now" and "fix tomorrow"? If any
  overnight-damage scenario exists (unauth destructive endpoint,
  silent data corruption, silent data loss), block the merge.
- Feature flag / dark launch option for risky features.

### LAYER 10 — REPORTING
For each blocker: state exact fix, not vague direction.
Bad: "Add auth to this endpoint."
Good: "Line 1064: replace `router.post("/sync-spf-tat-to-companies", handler)`
       with `router.post("/sync-spf-tat-to-companies", systemAdminAuth,
       adminOnly, handler)`."

For each fix: state 1 concrete failure scenario ("bot scans public URL,
finds /sync-spf-tat-to-companies, POSTs empty body, TAT wiped on 500
companies").

Never say "looks good overall" without listing what specifically you
verified. If you didn't check indexes, say so.
<!-- END trackvid-review-rules -->
