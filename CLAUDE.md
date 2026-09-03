# TrackVid-Monitor — Claude Instructions

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
