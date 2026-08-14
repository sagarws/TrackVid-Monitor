# TrackVid-Monitor — Claude Instructions

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

## Definition of done (Claude checklist)

Before reporting a task complete:

- [ ] Reused existing template code wherever possible.
- [ ] New files landed in the correct existing folder.
- [ ] Zero modifications inside `@core/`, `@layouts/`, `@menu/`.
- [ ] No new dependency added without justification.
- [ ] `pnpm lint` passes (or explain the failure).
- [ ] For UI changes, feature verified at `http://localhost:4001`.

If any rule here blocks legitimate work, **flag it to the user and propose an edit to `DEVELOPMENT_RULES.md`** — do not silently break the rule.
