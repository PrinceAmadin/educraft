---
name: educraft-review
description: EduCraft HQ review checklist — TypeScript strictness, loading/error/empty states, mobile and theme coverage, auth scoping, project-specific bans, performance, security, and accessibility. Use when reviewing code, fixing bugs, checking quality, or before committing changes.
---

# EduCraft Code Review

Work through each section against the changed files. Report findings as `file:line` with the concrete failure, most severe first. Fix what is clearly wrong; flag what is a judgement call.

## 1. TypeScript

- No `any` — including implicit `any` on params, `catch (e: any)`, and `as any` escape hatches. Use `unknown` + narrowing.
- No `@ts-ignore` / `@ts-expect-error` without a comment explaining why.
- Null handling: optional chaining and explicit guards, not `!` non-null assertions on values that can genuinely be null (Prisma `findUnique`, `session.user`, array `.find()`).
- Props and API responses have declared interfaces/types; no inline untyped object shapes on exported components.
- Zod schemas are the source of truth for form and request types (`z.infer`), not duplicated hand-written interfaces.

## 2. UI states — the three that always go missing

- **Loading:** skeleton loaders matching the real layout. Never a blank region, never a bare "Loading..." string.
- **Error:** try/catch or error boundary, a visible message, and a retry action. Failures must not render as empty success.
- **Empty:** an `EmptyState` with icon, copy, and a primary action ("No projects yet" — not a blank table body or a header with nothing under it).

Every list, table, chart, and detail page needs all three.

## 3. Mobile

- Does this render correctly at **375px**? Check 414, 768, 1024 too.
- No horizontal overflow; long strings truncate or wrap.
- Tables have a card rendering below `md` — no horizontally scrolling table on a phone.
- Touch targets >=48px (`min-h-12`) on buttons, inputs, nav items, tappable rows.
- Bottom nav has at most 5 items and content clears it with bottom padding.

## 4. Theme

- Renders correctly in **both** dark and light. Class-based dark mode.
- Semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`), not hardcoded `text-white` / `bg-black` / raw hexes in JSX.
- Contrast holds in both themes, including badges, charts, and disabled states.
- Theme-dependent logo swaps to the correct asset.

## 5. Auth and access

- Every protected API route checks `getServerSession` **and** the role, before any query.
- WORKER and AMBASSADOR routes scope by the caller's own id resolved from the session — never an id taken from the body, query string, or params.
- OPS_MANAGER is blocked from deletes, pricing changes, and founder financials.
- No protected data leaking through a public route or an over-broad `include`/`select` (password hashes, tokens, other users' records).

## 6. EduCraft-specific bans

- No emojis as icons — `react-icons/lu` (Lucide) only.
- No `localStorage` / `sessionStorage`.
- No mock or hardcoded data — query the DB, show zeros/empty when there is nothing.
- No bare `prisma` commands — `npm run db:migrate`, `db:seed`, `db:generate`, `db:studio`.
- No secrets in code — `.env.local` locally, Vercel env vars in production.
- Status changes always write a `ProjectStatusLog`, in the same transaction.
- Document generation: no dotted tab leaders in TOC / List of Figures / List of Tables / List of Appendices; equation numbers as `3.1`, never `(3.1)`; tables must not break across pages.

## 7. Performance

- No unnecessary re-renders: stable `useCallback`/`useMemo` where they matter, no new object/array/function literals passed as props into memoised children on every render.
- `key` is a stable id, never the array index, on any list that can reorder, filter, or grow.
- `"use client"` only where interactivity actually requires it — keep data fetching in server components.
- No N+1 Prisma queries in a loop; use `include`, or a single `findMany` with `where: { id: { in: ids } }`.
- List endpoints paginate.

## 8. Security

- No API keys, tokens, or connection strings in client bundles or committed files. Anything a client component reads must be `NEXT_PUBLIC_` and safe to expose.
- All input validated server-side with Zod — client validation is not a control.
- Workers see only their own assignments and earnings; ambassadors only their own referrals and commissions; clients only their own projects.
- No raw SQL string interpolation; use Prisma or `$queryRaw` tagged templates.
- File uploads: type and size checked server-side.

## 9. Accessibility

- Every input has an associated label (`FormLabel` / `htmlFor`); placeholders are not labels.
- Icon-only buttons have `aria-label`; decorative icons have `aria-hidden`.
- Contrast meets AA in both themes.
- Interactive elements are real `<button>` / `<a>`, focusable, with a visible focus ring.
- Motion respects `prefers-reduced-motion`.

## 10. Before committing

```bash
npm run lint
npm run build
```

Fix every TypeScript error — do not commit with the build failing or with errors suppressed. Confirm migrations are in sync (`npm run db:generate`) when the Prisma schema changed. Commit only when the user asks.
