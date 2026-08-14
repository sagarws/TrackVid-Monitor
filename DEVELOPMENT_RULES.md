# TrackVid-Monitor — Development Rules

Standard rules every contributor (human or AI) MUST follow while working in this project.
This project is built on the **Vuexy MUI Next.js Admin Template (v5.0.1)**. The template's structure, conventions, and building blocks are **the source of truth**. Do not reshape them.

---

## 1. Golden Rule

> **Reuse first. Create only when nothing existing fits.**

Before writing any new code:

1. Search the codebase for an existing component, hook, util, view, layout, or pattern that already does (or nearly does) what you need.
2. If found → **use it as-is** or extend it in place.
3. If not found → create a **new** file, in the **correct existing folder**, following the same conventions as its neighbours.

Never fork, duplicate, or rewrite an existing template file to "customize" it. Extend, wrap, or compose instead.

---

## 2. Folder Structure — Do NOT Change

The `src/` layout is fixed. New code MUST land in the matching folder below. Do not invent new top-level folders.

```
src/
├── @core/       # Template core primitives — DO NOT MODIFY. Read-only.
├── @layouts/    # Template layout primitives — DO NOT MODIFY. Read-only.
├── @menu/       # Template menu primitives    — DO NOT MODIFY. Read-only.
├── app/         # Next.js App Router (routes, api, server actions)
├── assets/      # Static assets, iconify bundles
├── components/  # Shared app-level components (composed on top of @core)
├── configs/     # App config (theme, i18n, constants)
├── contexts/    # React contexts
├── data/        # Static data / seed data
├── fake-db/     # Mock database for demos
├── hocs/        # Higher-order components
├── hooks/       # Custom React hooks
├── libs/        # Third-party wrappers, styled overrides
├── prisma/      # Prisma schema & client
├── redux-store/ # Redux Toolkit slices & store
├── types/       # Shared TypeScript types
├── utils/       # Pure utility functions
└── views/       # Page-level view compositions (feature UIs)
```

### Where does new code go?

| You are building…                          | Put it in…                                          |
| ------------------------------------------ | --------------------------------------------------- |
| A new route / page                         | `src/app/[lang]/...` (App Router)                   |
| A page's UI composition                    | `src/views/<feature>/`                              |
| A reusable UI component (app-wide)         | `src/components/<group>/`                           |
| A styled/wrapped MUI component             | `src/libs/styles/` or `src/@core/components/mui/` reuse |
| A React hook                               | `src/hooks/`                                        |
| A pure helper / formatter                  | `src/utils/`                                        |
| A TypeScript type shared across features   | `src/types/`                                        |
| Redux slice                                | `src/redux-store/slices/`                           |
| Prisma model change                        | `src/prisma/schema.prisma` + `pnpm migrate`         |
| API route / server action                  | `src/app/api/` or `src/app/server/`                 |
| Menu items                                 | Follow existing `verticalMenuData` / `horizontalMenuData` pattern |

---

## 3. Template Code (`@core`, `@layouts`, `@menu`) — READ-ONLY

These three folders ship with the Vuexy template and receive upstream updates.

- **DO NOT** edit files inside `src/@core/`, `src/@layouts/`, or `src/@menu/`.
- **DO NOT** rename, move, or delete files inside them.
- If you need different behaviour: **wrap** the primitive in `src/components/` or `src/libs/` and consume the wrapper.
- If a change to `@core` seems unavoidable, stop and raise it for review — it almost always isn't.

---

## 4. When to Reuse vs. When to Create New

### Reuse existing code when:

- A component, hook, util, or view **already covers** the requirement (even 80% — extend via props).
- MUI already ships the primitive (`Button`, `Card`, `Dialog`, `TextField`, …) — always prefer MUI over hand-rolling.
- `@core/components/mui/*` provides a themed variant — use it.
- A view under `src/views/<feature>/` matches the page you're building — compose from it.

### Create new code when:

- No existing component/hook/util fits, **and** wrapping an existing one would distort its contract.
- The functionality is a genuinely new feature (new domain, new page, new business rule).
- A new UI component is needed that isn't in MUI or `@core`.

When you create new code, it MUST:

- Live in the correct folder (see table above).
- Match neighbouring files' naming, casing, and file layout.
- Use the same tech choices as the rest of the project (see §5).

---

## 5. Tech Stack — Fixed Choices

Use ONLY what the project already uses. Do not introduce parallel libraries.

| Concern            | Use                                           | Do NOT use               |
| ------------------ | --------------------------------------------- | ------------------------ |
| Framework          | Next.js 16 App Router                         | Pages Router             |
| UI kit             | MUI 7 (`@mui/material`, `@mui/lab`)           | Chakra, Ant, Bootstrap UI |
| Styling            | MUI `sx` / Emotion, Tailwind 4 utilities      | styled-components, CSS Modules for new work |
| Icons              | Iconify (via `src/assets/iconify-icons/`)     | Lucide, react-icons, raw SVG imports |
| Forms              | `react-hook-form` + `valibot` resolvers       | Formik, Yup              |
| State (client)     | Redux Toolkit (`src/redux-store/`)            | Zustand, Jotai, MobX     |
| Data fetching      | Server Components / Server Actions / `fetch`  | axios, swr (unless already used) |
| DB                 | Prisma (`src/prisma/`)                        | Raw SQL, other ORMs      |
| Auth               | `next-auth` v4                                | Custom JWT flows         |
| Tables             | `@tanstack/react-table`                       | MUI DataGrid, ag-grid    |
| Charts             | `apexcharts` + `recharts` (as already used)   | Chart.js, D3 direct      |
| Rich text          | Tiptap 3                                      | Draft.js, Quill, Lexical |
| Calendar           | FullCalendar                                  | react-big-calendar       |
| Notifications      | `react-toastify`                              | Sonner, react-hot-toast  |
| Dates              | `date-fns`                                    | moment, dayjs, luxon     |
| Package manager    | `pnpm` (per `pnpm-lock.yaml`)                 | npm, yarn                |

Adding a new dependency requires justification — check `package.json` first.

---

## 5a. Internationalization — English Only

- The app is **English-only**. Locale is locked to `en` in `src/configs/i18n.ts`.
- **Do NOT maintain `src/data/dictionaries/en.json`** (or `fr.json` / `ar.json`). Do not add new keys, do not import from `src/data/dictionaries/*` in new code.
- New UI copy: hardcode English strings directly in the component/view.
- The `[lang]` route segment stays for structural reasons — treat `lang` as effectively fixed to `en`.
- Do not re-add French, Arabic, or any other locale, and do not restore the `<LanguageDropdown />` in navbars.

## 6. Coding Conventions

- **Language:** TypeScript strict — no `any` unless unavoidable and commented.
- **File naming:** Follow the neighbours in the folder (PascalCase for components, camelCase for utils/hooks).
- **Imports:** Use the project's path aliases (`@core/*`, `@layouts/*`, `@menu/*`, `@/*`) from `tsconfig.json`. No deep relative chains (`../../../..`).
- **Client vs server:** Add `'use client'` only when the component actually needs it (hooks, events, browser APIs). Default to Server Components.
- **i18n:** Routes live under `src/app/[lang]/`. Respect the lang param — do not hardcode strings meant for translation.
- **Theme:** Use theme tokens (`theme.palette.*`, `theme.spacing()`) — never hardcode colors or pixel spacing.
- **Lint / format before commit:** `pnpm lint:fix && pnpm format`.

---

## 7. Adding a New Feature — Checklist

1. **Search first.** Grep `src/views/`, `src/components/`, `src/hooks/`, `src/utils/` for anything similar.
2. **Route:** Add under `src/app/[lang]/<segment>/page.tsx`. Keep the page file thin — it should import from `src/views/`.
3. **View:** Compose the UI in `src/views/<feature>/` using MUI + `@core` primitives.
4. **Shared pieces:** Only promote to `src/components/`, `src/hooks/`, or `src/utils/` if used in ≥2 places.
5. **Types:** Colocate feature types with the view; promote to `src/types/` only when shared.
6. **Menu:** Register in the existing menu data files — do not build a parallel menu.
7. **Test manually** in dev (`pnpm dev`, port `4001`) before opening a PR.

---

## 8. What NOT to Do

- Do NOT edit `@core/`, `@layouts/`, `@menu/`.
- Do NOT introduce a second UI kit, a second state library, a second form library, a second icon set.
- Do NOT duplicate an existing component to tweak it — extend via props or wrap it.
- Do NOT create new top-level folders in `src/`.
- Do NOT hardcode colors, spacing, or strings that should come from theme / i18n.
- Do NOT bypass ESLint / Prettier / TS errors — fix them.
- Do NOT commit `.env`, secrets, or generated files.

---

## 9. Definition of Done

A change is ready to merge when:

- [ ] Reuses existing template code wherever possible.
- [ ] New files land in the correct existing folder.
- [ ] No modifications inside `@core/`, `@layouts/`, `@menu/`.
- [ ] No new dependency added without justification.
- [ ] `pnpm lint` passes.
- [ ] `pnpm build` succeeds.
- [ ] Feature verified in the browser at `http://localhost:4001`.

---

_Keep this file up to date. If a rule here blocks legitimate work, propose an edit to this file in the same PR — don't silently break the rule._
