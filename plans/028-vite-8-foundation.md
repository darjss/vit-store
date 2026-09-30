# Plan 028: Vite 8 foundation (prerequisite for full Vite+)

Status: **done** (merged PR #314) — unblocks Plan 027

Depends on: nothing  
Blocks: [027-migrate-lint-format-to-vite-plus.md](./027-migrate-lint-format-to-vite-plus.md) full `vp migrate`

## Goal

Get vit-store onto **Vite 8** via the Vite+ core alias (`@voidzero-dev/vite-plus-core`) and **TypeScript 7 everywhere** without running `vp migrate` yet. Prove admin + storev2 + Alchemy + `turbo check-types` still work.

```yaml
# store-kit pnpm-workspace.yaml
catalog:
  vite: npm:@voidzero-dev/vite-plus-core@^0.2.5
  vite-plus: ^0.2.5
overrides:
  vite: "catalog:"
```

vit-store uses **Bun workspaces** — same idea in root `package.json` `catalog` + `overrides`.

## Why first

Vite+ docs explicitly require **Vite 8+ and Vitest 4.1+** before `vp migrate`. vit-store admin is on **Vite 6.2**. Jumping straight to `vp migrate` on Vite 6 risks broken plugin resolution, failed rewrites, and a noisy rollback.

This phase is intentionally narrow: **dependency audit + Vite 8 + TS 7 + smoke tests**. No Biome removal, no root `vite.config.ts`, no Turbo replacement.

**TS 7 is in scope for 028**, not deferred to Plan 027. One compiler version across catalog, apps, and packages before Vite+ lint/type-aware rules land.

---

## Step 0 — Dependency audit with taze

Run [taze](https://github.com/antfu-collective/taze) **before** touching Vite catalog pins. Baseline what's stale, then upgrade only what 028 needs — not everything taze flags.

### Commands

```bash
# Human-readable checklist (recommended)
bunx taze -r major --group

# JSON for PR notes / diff tracking
bunx taze -r major --json > .quality/taze-major.json

# Minor/patch only (safe catalog bumps)
bunx taze -r minor --group

# CI gate (optional later)
bunx taze -r major --fail-on-outdated
```

Flags: `-r` recursive workspaces, `--group` by package, `major` shows all semver jumps (includes minor/patch in output).

Optional root script (add during 028 PR):

```json
"deps:check": "taze -r major --group",
"deps:check:minor": "taze -r minor --group"
```

### Upgrade tiers (snapshot 2026-09-01)

#### Tier A — upgrade in 028 (Vite 8 + TS 7 blockers)

These must move together or builds/typecheck break.

**Vite stack**

| Package                   | Current      | Target                                            | Where                          |
| ------------------------- | ------------ | ------------------------------------------------- | ------------------------------ |
| `vite`                    | ^6.2.2       | `@voidzero-dev/vite-plus-core@^0.2.5` via catalog | admin, storev2, root overrides |
| `@vitejs/plugin-react`    | ^4.3.4       | ^6.1.1                                            | admin                          |
| `vite-tsconfig-paths`     | ^5.1.4       | ^6.1.1                                            | admin                          |
| `@tailwindcss/vite`       | ^4.0.15 / ^4 | ^4.3.3                                            | admin, storev2 (store-kit pin) |
| `tailwindcss`             | ^4.0.15 / ^4 | ^4.3.3                                            | admin, storev2                 |
| `@tanstack/router-plugin` | ^1.114.27    | ^1.168.x                                          | admin — peer `>=20.19`         |
| `@tanstack/react-router`  | ^1.114.25    | ^1.170.x                                          | admin (match plugin)           |
| `astro`                   | ^7.0.6       | ^7.2.10                                           | storev2                        |
| `@astrojs/cloudflare`     | ^14.1.1      | ^14.2.6                                           | storev2                        |
| `@astrojs/solid-js`       | ^7.0.1       | ^7.0.2                                            | storev2                        |
| `vite-plugin-pwa`         | ^1.0.1       | ^1.3.0                                            | admin — peer `>=16`            |

**TypeScript 7 stack**

| Package                    | Current              | Target     | Where                                                  |
| -------------------------- | -------------------- | ---------- | ------------------------------------------------------ |
| `typescript`               | ^5.8–5.9             | ^7.0.2     | **catalog** — single source of truth                   |
| `typescript` (direct pins) | ^5.8.3, ^5.9.3, `^5` | `catalog:` | root devDep, admin, storev2, api, shared, assistant    |
| `@types/node`              | ^22.x                | ^26.4.0    | root, admin, server — align with TS 7 / Node 22+ peers |

**Drop `@typescript/native-preview`.** TS 7.0 GA ships the Go native compiler as the normal `typescript` package — same install, `tsc` binary (not a separate `tsgo`). The preview package was for beta/nightly only.

| Before                                      | After                                 |
| ------------------------------------------- | ------------------------------------- |
| `"check-types": "tsgo --noEmit"`            | `"check-types": "tsc --noEmit"`       |
| root devDep `@typescript/native-preview`    | remove                                |
| `.vscode` `typescript.experimental.useTsgo` | remove — use workspace `typescript@7` |

**Astro caveat:** `astro check` on storev2 may still rely on TS 6 programmatic APIs until Astro/Volar fully adopts TS 7.1's stable compiler API. Spike during 028:

- If `astro check` passes on catalog TS 7 → done.
- If not → add `@typescript/typescript6` for storev2 only, or split `check-types` (packages `tsc`, storev2 `astro check` on 6 until 7.1).

Do **not** keep native-preview alongside TS 7 — redundant and confusing.

**Catalog + tooling minors** (same PR):

| Catalog / package              | Current  | Target   |
| ------------------------------ | -------- | -------- |
| `@trpc/server`, `@trpc/client` | ^11.4.3  | ^11.18.0 |
| `hono`                         | ^4.8.12  | ^4.13.5  |
| `valibot`                      | ^1.1.0   | ^1.4.2   |
| `dotenv`                       | ^17.2.1  | ^17.4.2  |
| `wrangler` (all workspaces)    | ^4.101.0 | ^4.127.1 |

**Root `overrides`** — dedupe compiler + vite tree:

```json
"overrides": {
  "typescript": "catalog:",
  "vite": "npm:@voidzero-dev/vite-plus-core@^0.2.5",
  "vitest": "4.1.11"
}
```

#### Tier B — upgrade in 028 if time (safe minors, no major)

| Package                            | Target             | Notes                         |
| ---------------------------------- | ------------------ | ----------------------------- |
| `react`, `react-dom`               | ^19.2.8            | admin                         |
| `@tanstack/react-query` + devtools | ^5.102.8           | admin                         |
| `miniflare`                        | ^4.20260730.0      | root, storev2 — skip v5 alpha |
| `drizzle-orm` / `drizzle-kit`      | ^0.45.2 / ^0.31.10 | catalog                       |
| `turbo`                            | ^2.10.12           | root                          |
| `superjson`                        | ^2.2.6             | several packages              |

#### Tier C — defer (separate PRs, not 028)

| Package                             | Why defer                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `@cloudflare/workers-types` ^5      | Major across all apps — test wrangler compat first; can follow TS 7 PR if types break |
| `lucide-react` ^1                   | Icon API break — admin only                                                           |
| `nanoid` ^6                         | Major in admin, server, api                                                           |
| `react-day-picker` ^10              | Admin UI break                                                                        |
| `@ai-sdk/google` ^4, `ai` ^7        | API package — agent/AI path                                                           |
| `ky` ^2                             | **Breaking** — see [ky v2 note](#ky-v2-defer) below                                   |
| `@flue/*` ^2                        | Agent + assistant — Flue beta migration                                               |
| `agents` ^0.22                      | Agent Cloudflare SDK                                                                  |
| `astro-seo` ^1, `motion` ^13        | Storefront — unrelated to Vite 8                                                      |
| `tsdown` ^0.22                      | Plan 027 `vp pack` replaces this                                                      |
| `@biomejs/biome`                    | Removed in Plan 027                                                                   |
| `oxlint` ^1.80                      | Plan 027 with `@nkzw/oxlint-config` — pin with vite-plus oxlint version then          |
| GitHub Actions checkout/cache v7/v6 | CI hygiene PR                                                                         |

#### Tier D — do not upgrade (hold)

| Package                            | Reason                                    |
| ---------------------------------- | ----------------------------------------- |
| `alchemy@0.93.12`                  | Patched (`patches/alchemy@0.93.12.patch`) |
| `@solid-primitives/storage@4.3.3`  | Patched                                   |
| `@solar-icons/solid@2.0.0-beta.3`  | Patched                                   |
| `@solid-primitives/event-listener` | Root override pinned 2.4.6                |
| `zod@4`                            | Intentional v4 pin at root                |
| `khaan-client`                     | GitHub SHA pin                            |

### 028 upgrade workflow

1. `bunx taze -r major --group` — save output in PR description.
2. Apply **Tier A** (Vite 8 + TS 7 + catalog minors) — optional Tier B — `bun install`.
3. Re-run taze — Tier A rows should show current (incl. `typescript` ^7).
4. Run `bun run check-types` — fix TS 7 breakages repo-wide.
5. Smoke builds (steps below).
6. Leave Tier C/D untouched — note in PR what's deferred.

**Do not** `taze -w` blind across the monorepo — majors in Tier C will land and blow scope.

### ky v2 — defer

Yes, **ky 2 is a breaking major** ([release notes](https://github.com/sindresorhus/ky/releases/tag/v2.0.0)). Not in 028 scope — separate small PR after Vite/TS land.

| Breaking change                                       | vit-store impact                                               |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `prefixUrl` → `prefix` (or `baseUrl`)                 | `qpay.ts`, `delivery/index.ts`                                 |
| Hooks get `{request, options, ...}` not separate args | both clients — `beforeRequest`, `afterResponse`, `beforeError` |
| `HTTPError`: body pre-consumed → use `error.data`     | `qpay.ts` reads `error.response.text()` in 3 places            |
| `beforeError` receives all error types                | narrow with `isHTTPError` from ky                              |
| Node `>=22`                                           | fine (Bun 1.4, Workers)                                        |
| `.json()` throws on empty / 204                       | audit call sites                                               |

**Files:** `packages/api/src/lib/payments/qpay.ts`, `packages/api/src/lib/integrations/delivery/index.ts` (heavy); `sms/client.ts` (minimal `ky.create` — easy).

~1–2 hours mechanical migration; keep on `ky@^1.14` until dedicated PR.

---

## Current Vite touchpoints

| Location                        | Vite role                                                                                                        | Version today                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `apps/admin/vite.config.ts`     | React SPA build; Alchemy `dev:vite`                                                                              | `^6.2.2` direct dep                  |
| `apps/admin/alchemy.run.ts`     | `Vite()` resource → `bun run dev:vite`                                                                           | indirect                             |
| `apps/storev2/astro.config.mjs` | `vite: { plugins: [tailwindcss()] }`                                                                             | Astro-bundled (no explicit vite dep) |
| Plugins                         | `@tailwindcss/vite`, `@vitejs/plugin-react`, `@tanstack/router-plugin`, `vite-plugin-pwa`, `vite-tsconfig-paths` | must resolve against Vite 8          |

**Not on Vite:** server (tsdown), agent (flue), packages (tsdown).

Only one `from "vite"` import in the repo: `apps/admin/vite.config.ts`.

---

## Target state (end of 028)

```json
// root package.json workspaces.catalog
"typescript": "^7.0.2",
"vite": "npm:@voidzero-dev/vite-plus-core@^0.2.5",
"vite-plus": "^0.2.5",
"vitest": "4.1.11"
```

```json
// root package.json overrides (add alongside existing patches)
"typescript": "catalog:",
"vite": "npm:@voidzero-dev/vite-plus-core@^0.2.5",
"vitest": "4.1.11"
```

Every workspace **`typescript` devDependency → `"catalog:"`** (no stray `^5` pins):

| Package                               | Today        | Target                       |
| ------------------------------------- | ------------ | ---------------------------- |
| root                                  | ^5.8.3       | catalog:                     |
| admin                                 | ^5.8.3       | catalog:                     |
| storev2                               | ^5.9.3       | catalog:                     |
| server, agent                         | catalog:     | catalog: (bump catalog to 7) |
| @vit/api, @vit/shared, @vit/assistant | ^5 / catalog | catalog:                     |

```json
// apps/admin/package.json devDependencies
"vite": "catalog:",
"typescript": "catalog:",
"@types/node": "^26.4.0"
```

```json
// apps/storev2/package.json devDependencies (mirror store-kit plugged)
"vite": "catalog:"
```

Admin `vite.config.ts` stays on `import { defineConfig } from "vite"` for this phase — the alias makes that resolve to vite-plus-core. Rewrite to `vite-plus` happens in Plan 027 during `vp migrate`.

---

## Steps

### 0. taze audit

See [Step 0 — Dependency audit with taze](#step-0--dependency-audit-with-taze). Run before any version changes.

### 1. Pin versions at workspace root

1. Run `bunx vp --version` — record bundled vitest pin (docs say 4.1.11; verify).
2. Add to `workspaces.catalog`:
   - `typescript`: `^7.0.2`
   - `vite`: `npm:@voidzero-dev/vite-plus-core@^0.2.5`
   - `vite-plus`: `^0.2.5` (install at root only for now; used in 027)
   - `vitest`: matching bundled version
3. Add `overrides` for `typescript`, `vite`, and `vitest`.
4. Remove `@typescript/native-preview`; change all `tsgo --noEmit` → `tsc --noEmit`.
5. `bun install` — confirm lockfile dedupes to **one** `typescript` and **one** Vite tree (`bun pm ls typescript vite`).

**store-kit reference:** `/home/darjs/dev/store-kit/pnpm-workspace.yaml`

### 1b. TypeScript 7 everywhere

After catalog pin:

1. Replace every direct `typescript` range with `"catalog:"` (see [Target state](#target-state-end-of-028) table).
2. Bump `@types/node` → `^26.4.0` where declared (root, admin, server).
3. Run `bun run check-types` — fix breakages before Vite smoke:
   - stricter `isolatedDeclarations` / decorator edges if enabled
   - `@vit/api` `^5` peer loosening in package.json
   - any `// @ts-expect-error` that TS 7 resolves differently
4. Run `cd apps/storev2 && bun run check-types` (`astro check`) — Astro 7.2 + TS 7 combo; fall back to `@typescript/typescript6` for storev2 only if this fails (see [TS 7 stack](#tier-a--upgrade-in-028-vite-8--ts-7-blockers)).
5. Use **`tsc --noEmit`** everywhere else — no tsgo, no native-preview.

**Do not** mix TS 5 and TS 7 in the lockfile — override enforces catalog.

### 2. Wire admin to catalog vite

Apply **Tier A** plugin bumps from taze (`@vitejs/plugin-react`, `vite-tsconfig-paths`, `@tailwindcss/vite`, TanStack router packages) in the same PR as the vite catalog pin.

1. Change `apps/admin/package.json`: `"vite": "catalog:"` instead of `^6.2.2`.
2. Bump Vite-ecosystem deps per [Tier A](#tier-a--upgrade-in-028-vite-8-blockers).
3. `cd apps/admin && bun run build` — fix breakages.

Known Vite 8 deltas (covered by Tier A taze targets):

- `@vitejs/plugin-react` ^6.x required for Vite 8
- `@tanstack/router-plugin` — large minor jump; peer `>=20.19`
- `vite-plugin-pwa` ^1.3 — check PWA dev still works
- `vite-tsconfig-paths` ^6.x

### 3. Pin storev2 vite explicitly

Apply **Tier A** astro/cloudflare/tailwind bumps from taze.

1. Add `"vite": "catalog:"` to `apps/storev2/devDependencies` (store-kit `plugged` pattern).
2. Bump `astro`, `@astrojs/cloudflare`, `@astrojs/solid-js`, `@tailwindcss/vite`, `tailwindcss` per Tier A.
3. `cd apps/storev2 && bun run build` — `astro check && astro build`.

### 4. Alchemy dev smoke

Alchemy admin dev runs `bun run dev:vite` (see `apps/admin/alchemy.run.ts`).

1. From repo root: `bun run dev:alchemy` or `cd apps/admin && bun run dev` — confirm HMR, TanStack router, Tailwind 4.
2. storev2: `cd apps/storev2 && bun run dev` — confirm Solid islands + Cloudflare adapter dev.

Do **not** change Alchemy scripts in this phase.

### 5. Plugin compatibility matrix (fill during spike)

Run taze Tier A first; mark OK after smoke build.

| Package                           | taze target       | Vite 8 OK? | Action if not           |
| --------------------------------- | ----------------- | ---------- | ----------------------- |
| `@tailwindcss/vite`               | ^4.3.3            | TBD        | —                       |
| `@vitejs/plugin-react`            | ^6.1.1            | TBD        | —                       |
| `@tanstack/router-plugin`         | ^1.168.x          | TBD        | check routeTree.gen     |
| `vite-plugin-pwa`                 | ^1.3.0            | TBD        | defer PWA dev if broken |
| `vite-tsconfig-paths`             | ^6.1.1            | TBD        | —                       |
| `@astrojs/cloudflare` + Astro 7.2 | ^14.2.6 / ^7.2.10 | TBD        | —                       |

Document results in PR description. Re-run `bunx taze -r major --group` post-merge to refresh deferred Tier C list.

### 6. CI sanity

Current CI only runs `astro check`. For this PR add a **build-only** job (optional but recommended):

```yaml
vite-8-smoke:
  steps:
    - bun install --frozen-lockfile
    - bun run check-types
    - bun run --filter admin build
    - bun run --filter storev2 build
```

Keeps 028 honest without requiring full vp yet.

---

## Out of scope (028)

- `vp migrate`
- Root `vite.config.ts`
- Biome / oxlint consolidation
- tsdown → `vp pack`
- Turbo → `vp run`
- Vitest adoption (pin vitest in overrides only, no tests yet)
- Rewriting `import from "vite"` → `vite-plus`

---

## Rollback

If admin or storev2 breaks on Vite 8:

1. Revert catalog + overrides + package.json changes.
2. File blockers (plugin name, error) before retrying.
3. Do **not** proceed to Plan 027 until green.

Partial rollback (admin only on 8, storev2 stays on Astro's vite) is worse — one Vite tree is the point of overrides.

---

## Success criteria

- [ ] `bunx taze -r major --group` run; Tier A upgrades applied; Tier C/D documented as deferred
- [ ] Single resolved `typescript@7` across workspace (`bun pm ls typescript`)
- [ ] Single resolved Vite version across workspace (`bun pm ls vite` or lockfile inspection)
- [ ] `bun run check-types` passes (`tsc` + astro check; no native-preview)
- [ ] `apps/admin` `vite build` succeeds
- [ ] `apps/storev2` `astro build` succeeds
- [ ] Alchemy dev for admin + storev2 starts without Vite plugin errors
- [ ] No production deploy required to merge 028 (build smoke sufficient)

---

## Estimated effort

**1–2 days** — taze audit + Tier A (Vite 8 + TS 7) + type fixes + plugin smoke + CI job. TS 7 repo-wide fixes are the long pole; Tier B minors optional same PR.

After 028 merges, start [Plan 027](./027-migrate-lint-format-to-vite-plus.md) Phase 1 (`vp migrate`). Re-run taze before 027 to pick up `oxlint`, `vite-plus`, `@nkzw/oxlint-config` targets.
