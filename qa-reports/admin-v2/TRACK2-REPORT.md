# Track 2 — Solid app shell and navigation (apps/admin-v2)

## What was built

`apps/admin-v2/` — a new Solid + Vite SPA mirroring the current React admin's
stack (vite-plugin-pwa, tRPC batch link with superjson + session boundary) and
the storev2 Solid conventions (Kobalte, TanStack Solid Query/Router, solar
icons, Tailwind v4, Onest).

### Shell (variant B — triage agenda)

- `src/app/app-shell.tsx` — cream canvas, no header on mobile; content capped
  at 760px; skip link first focusable element.
- `src/app/bottom-nav.tsx` — mobile bottom nav, 4 labeled items in order:
  Нүүр, Бараа, Захиалга, Шинжилгээ. Active item = ink glyph + butter icon
  (prototype). Safe-area padding, 56px targets, aria-current="page".
- `src/app/top-nav.tsx` — desktop expansion (≥md): brand mark + the SAME four
  sections in the SAME order + session chip + Гарах (logout). Mobile
  information order unchanged.
- `src/app/top-progress.tsx` — thin butter route-transition bar.
- App-level states: `app-loading.tsx` (pending), `app-error.tsx` (error
  boundary with Дахин оролдох retry), `app-not-found.tsx` (404 with back-home
  action).

### Auth (reuses the existing admin session)

- `src/lib/trpc.ts` — `createTRPCClient<AdminRouter>` with
  httpBatchLink + split httpLink, superjson, credentials, and the 401 →
  /login redirect (mirrors `apps/admin/src/utils/trpc.ts`).
- `src/lib/auth.ts` — `auth.me` query options + `ensureAdminSession` guard
  (cache-first, 15min stale, no retry), `auth.logout` mutation options.
- `src/routes/_app/route.tsx` — layout guard: no session → redirect /login.
- `src/routes/login.tsx` — Google login button (server OAuth URL from
  VITE_SERVER_URL), typed search param `message`, session check redirect.

### Routes + features

- File-based TanStack Solid Router (`src/routes/`), generated
  `src/routeTree.gen.ts` committed. Route ids mirror the current admin:
  `/_app` (+ index), `/_app/products/`, `/_app/products/$productId`,
  `/_app/orders/`, `/_app/orders/$orderId`, `/_app/analytics/`.
- `src/features/{home,products,orders,analytics}/` placeholder pages, each with
  one heading + one EmptyState (owned by Tracks 3–6 later).
- Per-route document titles via route `head`.

### Tokens + PWA

- `src/styles/app.css` — exact prototype palette (cream #faf6ee, surface,
  ink #2b2419, butter #f2be22, lavender/apricot/coral/lemon/gray status —
  no blue/green), Onest font, radius/elevation/motion tokens.
- `src/tmp-ui/` — Button, Badge, EmptyState, InlineAlert stubs, each marked
  `TODO: SWAP TO @vit/ui`; single import surface `src/tmp-ui/index.ts`.
- `vite.config.ts` — VitePWA with cream theme-color, generated icons in
  `public/pwa/`, manifest (mn, standalone).
- `alchemy.run.ts` — mirrors the current admin's alchemy entry (domains left
  for the integrator at cutover).

## Verification (all in this worktree)

- `bunx tsgo --noEmit` — clean.
- `bunx vite build` — passes (PWA SW + manifest generated).
- `bunx biome check apps/admin-v2` — clean.
- Browser smoke (agent-browser against `vite preview` + a throwaway stub API
  on :4175 mimicking `auth.me` / `auth.logout`):
  - Login guard: no session → / redirects to /login; session → shell renders.
  - Mobile 393×852: bottom nav only (4 items), content OK.
  - Desktop 1440×900: top nav with session chip + logout.
  - All 6 routes render with per-route titles (e.g. "Захиалга · vit-admin").
  - 404 page works ("Хуудас олдсонгүй" + Нүүр рүү буцах).
  - Logout: mutation → session cleared → /login (verified end-to-end).
  - Error boundary renders with retry when the API is unreachable.
  - Screenshots in `qa-reports/admin-v2/` (mobile-home, mobile-orders,
    desktop-home, desktop-products, smoke-error-state).

Note: the stub and vendored `@tanstack/solid-router@1.133.15` under
`apps/admin-v2/node_modules/` are gitignored / throwaway; the patch file tells
the integrator to `bun install` the real dependency (pinned to match the
locked router-core@1.133.15).

## Open questions / risks

- Logout lives only in the desktop top bar (variant B has no mobile header).
  Mobile logout needs a home for a future track or a small overflow menu in
  the shell.
- `@tanstack/solid-router` must be installed at 1.133.15 exactly (matching the
  lockfile's router-core); a `^` range would pull 1.17x and newer router-core.
- PWA icons are pre-generated PNGs (pwaAssets disabled); `bun run
  generate-pwa-assets` regenerates from `public/logo.svg` if the integrator
  wants the generator pipeline.
- The 760px content cap and top-nav 1080px width are shell-level; feature
  tracks may widen the content column for card workspaces.
