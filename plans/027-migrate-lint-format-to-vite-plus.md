# Plan 027: Full Vite+ migration (store-kit parity)

Status: Phase 1 in progress — prerequisite [028](./028-vite-8-foundation.md) merged

## Executive summary

Migrate vit-store to **full Vite+** like [store-kit](https://github.com/darjss/store-kit): root `vite.config.ts`, `vp check` / `vp fmt` / `vp lint`, `vp run` tasks, optional `vp pack` replacing tsdown, Biome removed.

**Prerequisite:** Plan 028 (Vite 8 + catalog overrides) must land first.

---

## store-kit pattern (reference)

store-kit is the template. Key pieces:

| Piece       | store-kit                                                                          | vit-store today                 |
| ----------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| Root config | `vite.config.ts` → `defineConfig` from `vite-plus`                                 | none                            |
| Lint/fmt    | `oxlint.config.ts` + `oxfmt.config.ts`; `@nkzw/oxlint-config` + vendored anti-slop | Biome + `.oxlintrc.json`        |
| Vite alias  | `vite: npm:@voidzero-dev/vite-plus-core@^0.2.5`                                    | admin Vite 6 (→ 028 fixes)      |
| Scripts     | `"build": "vp run -r build"`, `"prepare": "vp config"`                             | Turbo + per-package scripts     |
| Tasks       | `run.tasks` for db, deploy, astro dev                                              | Turbo `deploy` dependsOn chain  |
| Staged      | `staged: { '*': 'vp check --fix' }`                                                | none                            |
| Type lint   | `typeAware: true`, `typeCheck: true`                                               | oxlint warn-only; tsgo separate |
| Astro app   | `vp exec astro dev` in `run.tasks`                                                 | Alchemy dev                     |
| PM          | pnpm + catalog                                                                     | Bun workspaces + catalog        |

vit-store won't copy store-kit 1:1 — **Alchemy deploy** and **agent (flue)** stay — but lint/fmt/run surface should match.

**Lint stack decision (locked):** use [`@nkzw/oxlint-config`](https://github.com/nkzw-tech/oxlint-config) as the base (not store-kit's `@letstri/oxlint-config`), vendored [`anti-slop`](https://github.com/dmmulroy/anti-slop), and Oxlint's [`complexity`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity) rule. See [Lint stack](#lint-stack) below.

---

## Lint stack

Three layers composed in `oxlint.config.ts`, imported into root `vite.config.ts` `lint` block.

### Layer 1 — `@nkzw/oxlint-config` (base)

Opinionated defaults: **errors not warns**, unicorn/import/react/oxc/perfectionist, `@nkzw/eslint-plugin` rules (`no-instanceof`, etc.).

```bash
bun add -D @nkzw/oxlint-config @oxlint/plugins
```

Pin `@oxlint/plugins` to the **exact** Oxlint version Vite+ resolves (`bun pm ls oxlint` after install). nkzw peer: `oxlint >= 1.79`.

**Note:** nkzw ships upstream-specific overrides (e.g. `server/**/*.tsx`) that don't match vit-store paths — harmless if unmatched; replace with vit-store overrides below.

**Solid vs React:** nkzw enables the React plugin globally. storev2 is Solid — add overrides to disable `react/*` rules under `apps/storev2/**` (and non-UI packages). Admin keeps full React rules.

### Layer 2 — anti-slop (vendored plugin)

[anti-slop](https://github.com/dmmulroy/anti-slop) is **vendored**, not an npm dep (same as store-kit at `tools/oxlint/anti-slop/`).

**Install:**

```bash
# Option A: agent skill
npx skills add dmmulroy/anti-slop --skill install-anti-slop

# Option B: manual copy (store-kit pattern)
# Copy anti-slop src/ → tools/oxlint/anti-slop/
```

**Register in `oxlint.config.ts`:**

```ts
jsPlugins: [
  { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
  { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' },
],
rules: {
  'anti-slop/no-chained-type-assertions': 'error',
  'anti-slop/no-conditional-empty-object-spread': 'error',
  'anti-slop/no-known-value-widening': 'error',
  'anti-slop/no-module-mocking': 'error',
  'anti-slop/no-object-parameters': 'error',
  'anti-slop/no-reflect-apply': 'error',
  'anti-slop/no-reflect-get': 'error',
  'anti-slop/no-runtime-typeof': 'error',
  'anti-slop/no-shape-in-symbol-names': 'error',
  'anti-slop/no-unknown-parameters': 'error',
  'anti-slop/no-unknown-returns': 'error',
  'anti-slop/no-unknown-type-aliases': 'error',
  'anti-slop/no-unsafe-dictionary-type': 'error',
  'anti-slop/no-widen-then-assert': 'error',
  'anti-slop/require-safety-comment-for-type-assertion': 'error',
  'vite-plus/prefer-vite-plus-imports': 'error',
},
```

**No Effect rules** — vit-store doesn't use Effect; skip `anti-slop-effect/*`.

**Extra ignores** (anti-slop + fmt): agent tool dirs + vendored plugin:

```ts
ignorePatterns: [
  'tools/oxlint/anti-slop/**',
  '.cursor/**',
  '.agents/**',
  // ... other agent dirs per anti-slop README
],
```

**Baseline cost:** existing code may violate anti-slop (type assertions, `Record<string, unknown>`, etc.). Budget a **fix-or-suppress pass** in Phase 2; `amazon-html.ts` already has a Biome complexity ignore — may need `// oxlint-disable complexity` or refactor.

### Layer 3 — `complexity` (cyclomatic)

Replaces Biome `noExcessiveCognitiveComplexity` (max 15). Oxlint rule is **McCabe cyclomatic**, not Sonar cognitive — different metric, same ceiling:

```ts
rules: {
  complexity: ['error', { max: 15 }],
},
```

Ref: [oxc.rs/docs/.../eslint/complexity](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity) (added oxlint v1.37+).

**Overrides** (mirror Biome):

```ts
overrides: [
  {
    files: ['**/*.astro', '**/*.vue', '**/*.svelte'],
    rules: { complexity: 'off' },
  },
  {
    files: ['**/src/components/ui/**', 'apps/storev2/src/components/starwind/**'],
    rules: { complexity: 'off' },
  },
  {
    files: ['apps/storev2/**'],
    rules: {
      // Solid storefront — nkzw react rules don't apply
      'react/rules-of-hooks': 'off',
      'react/exhaustive-deps': 'off',
      'react/jsx-key': 'off',
      // ... other react/* that fire on .tsx islands only if needed
    },
  },
  {
    files: ['apps/admin/**'],
    plugins: ['react'], // explicit; inherits from base
  },
  {
    files: ['apps/server/**', 'apps/agent/**', 'packages/**'],
    env: { node: true },
    rules: { 'no-console': 'off' }, // adjust per package; server may allow structured logging
  },
],
```

**fallow alignment:** `.fallowrc.json` has `maxCyclomatic: 20`, `maxCognitive: 15`. After lint cutover, consider lowering fallow `maxCyclomatic` to **15** so health and oxlint agree.

### Composed config sketch

```
vit-store/
├── vite.config.ts
├── oxlint.config.ts    # extends nkzw + anti-slop + complexity + vit-store overrides
├── oxfmt.config.ts     # tabs, double quotes, tailwind sort
└── tools/oxlint/anti-slop/   # vendored from dmmulroy/anti-slop
```

```ts
// oxlint.config.ts
import nkzw from "@nkzw/oxlint-config";
import { defineConfig } from "oxlint";

import { vitStoreOverrides } from "./tooling/lint/vit-store-overrides";

export default defineConfig({
	extends: [nkzw],
	ignorePatterns: [
		"**/dist/**",
		"**/.alchemy/**",
		"**/routeTree.gen.ts",
		"**/components/ui/**",
		"apps/storev2/src/components/starwind/**",
		"tools/oxlint/anti-slop/**",
		".cursor/**",
	],
	jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
	rules: {
		complexity: ["error", { max: 15 }],
		// anti-slop rules (see Layer 2)
		// vite-plus rule added in vite.config.ts lint merge
	},
	overrides: vitStoreOverrides,
});
```

```ts
// vite.config.ts (lint block excerpt)
import lintConfig from "./oxlint.config";

export default defineConfig({
	lint: {
		...lintConfig,
		jsPlugins: [
			...(lintConfig.jsPlugins ?? []),
			{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
		],
		rules: {
			...lintConfig.rules,
			"vite-plus/prefer-vite-plus-imports": "error",
		},
		options: { typeAware: true, typeCheck: true },
	},
	// fmt, staged, run ...
});
```

### Lint dependencies (Phase 2)

| Package                   | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `@nkzw/oxlint-config`     | Base strict rules                                   |
| `@oxlint/plugins`         | anti-slop plugin host; **exact version = oxlint**   |
| `vite-plus`               | `vp lint`, vite-plus oxlint plugin, type-aware lint |
| `tools/oxlint/anti-slop/` | Vendored; no npm package                            |

**Remove:** `@biomejs/biome`, `biome.json`, `.oxlintrc.json`, admin biome scripts.

### Lint rollout strategy

1. **Land config with `--max-warnings` or rule-level `warn` temporarily?** No — nkzw philosophy is error-only. Instead:
   - Run `vp lint` on subset (`packages/shared`) first.
   - Fix or narrowly suppress violations before repo-wide enable.
2. **Expected hotspots:** type assertions in api/integrations, `Record<string, unknown>` metadata, complex parsers (`amazon-html.ts`), Solid store components.
3. **CI gate:** `vp lint` must pass with zero warnings before Phase 2 PR merges.

---

## Migration phases (after 028)

### Phase 1 — `vp migrate` at workspace root

```bash
bun add -D vite-plus@catalog:
bunx vp migrate --no-interactive --editor vscode
```

From [viteplus.dev/guide/migrate](https://viteplus.dev/guide/migrate):

- Target must be **workspace root** (Bun monorepo).
- Rewrites `vite` imports → `vite-plus` where applicable.
- Merges lint/format config into `vite.config.ts`.
- Updates scripts; may add hooks.

**Manual follow-ups:**

1. **Admin app config** — keep `apps/admin/vite.config.ts` for React plugins (TanStack router, PWA, Tailwind). Root config owns lint/fmt/run/staged; per-app config owns `plugins`/`server`/`resolve` (Vite+ monorepo docs allow both).

2. **Merge admin plugins into root OR re-export** — store-kit is single-app-at-root; vit-store admin config is ~45 lines. Likely:
   - Root: lint, fmt, staged, run, check
   - `apps/admin/vite.config.ts`: build/dev only, `defineConfig` from `vite-plus`

3. **Preserve Biome ignores** until Phase 2 cutover — migrate may not port all Biome overrides.

**Verify:** `vp install && vp check && vp -C apps/admin build`

### Phase 2 — Lint stack + Oxfmt (Biome removal)

Implement the [Lint stack](#lint-stack) section:

1. Vendor anti-slop → `tools/oxlint/anti-slop/`
2. Add `@nkzw/oxlint-config`, `@oxlint/plugins` (pinned)
3. Create `oxlint.config.ts` + `oxfmt.config.ts`
4. Wire into root `vite.config.ts` `lint` / `fmt` blocks
5. Spike `vp lint` on `packages/shared`, then `packages/api`, fix violations
6. Repo-wide `vp fmt` + `vp lint` — expect large diff + assertion comment pass
7. Remove Biome

**Biome → Oxfmt mapping:**

| Biome                                                              | Oxfmt                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| tabs                                                               | `useTabs: true`                                       |
| double quotes                                                      | `singleQuote: false`                                  |
| `useSortedClasses` on cn/clsx/cva                                  | `sortTailwindcss: { functions: ['clsx','cva','cn'] }` |
| ignore `components/ui`, `starwind`, `.alchemy`, `routeTree.gen.ts` | `ignorePatterns`                                      |

**Biome rule replacements:**

| Biome                                 | Replacement                               |
| ------------------------------------- | ----------------------------------------- |
| `noExcessiveCognitiveComplexity` (15) | `complexity: ['error', { max: 15 }]`      |
| `useExhaustiveDependencies`           | nkzw `react/exhaustive-deps` (admin only) |
| recommended + style rules             | `@nkzw/oxlint-config` superset            |
| low-evidence TS patterns              | anti-slop rules                           |

Astro template lint → still `astro check`; Oxlint only frontmatter.

### Phase 3 — `vp run` tasks (replace Turbo gradually)

Map high-value Turbo tasks to `run.tasks` like store-kit's `plugged:dev`, `db:migrate:*`:

```ts
run: {
  tasks: {
    'admin:dev': {
      command: 'alchemy dev --app admin --stage dev',
      cwd: 'apps/admin',
      cache: false,
    },
    'storev2:dev': {
      command: 'alchemy dev --app storev2 --stage dev',
      cwd: 'apps/storev2',
      cache: false,
    },
    'server:dev': {
      command: 'alchemy dev --app server --stage dev',
      cwd: 'apps/server',
      cache: false,
    },
    'db:generate': {
      command: 'vp exec drizzle-kit generate',
      cwd: 'packages/api',
      cache: false,
    },
    'db:migrate:local': {
      command: 'vp exec drizzle-kit migrate --config=../../packages/api/drizzle.local.config.ts',
      cwd: 'apps/server',
      cache: false,
    },
    // deploy chain — keep ordering explicit
    'deploy:prod': {
      command: 'alchemy deploy --app server --stage prod --env-file ../../.env.prod && ...',
      cache: false,
    },
  },
},
```

**Strategy:**

1. Add `vp run` tasks **alongside** Turbo — don't delete `turbo.json` on day one.
2. Root scripts: `"dev": "vp run --parallel admin:dev server:dev storev2:dev"` (or keep `turbo dev` until stable).
3. Deploy ordering (`server` before admin/storev2/agent) — either one orchestrated task or sequential `vp run` with shell `&&` (store-kit uses node tooling scripts for Cloudflare deploy).

**Agent app:** stays on `flue build` — add `agent:build` task, not `vp build`.

### Phase 4 — tsdown → `vp pack`

Four tsdown configs today:

| Package              | Entry                                      | Notes         |
| -------------------- | ------------------------------------------ | ------------- |
| `apps/server`        | `./src/index.ts`, ESM, noExternal `@vit/*` | worker bundle |
| `packages/api`       | `src/**/*.ts`, dts                         | library       |
| `packages/shared`    | (tsdown.config)                            | library       |
| `packages/assistant` | (tsdown.config)                            | library       |

Per [viteplus pack migration](https://viteplus.dev/guide/migrate#tsdown):

- Move options into `pack` block — **per-package** `vite.config.ts` or root overrides with `vp -C packages/api pack`.
- Delete `tsdown.config.ts` after parity.
- Update `build` scripts: `"build": "vp pack"` or root `vp run -r build`.

**Risk:** server `noExternal: [/@vit\/.*/]` — verify `vp pack` equivalent. Spike on server first before packages.

**Keep tsdown in catalog** until all four pack; then remove.

### Phase 5 — CI and quality gate

Replace / extend `.github/workflows/ci.yml`:

```yaml
quality:
  steps:
    - bun install --frozen-lockfile
    - bunx vp fmt --check
    - bunx vp lint
    - bun run check-types # tsgo + astro check via turbo until vp typeCheck trusted
    - bun run --filter storev2 build
    - bun run --filter admin build
```

**Decision point:** once `typeCheck: true` in lint options is stable, consider dropping redundant tsgo from CI for packages vp covers — **not on day one**.

store-kit runs `typeCheck: true` in lint; vit-store also has `astro check` for storefront — keep both initially.

### Phase 6 — Editor, hooks, AGENTS.md

```json
// .vscode/settings.json
{
	"oxc.enable": true,
	"oxc.fmt.disableNestedConfig": true,
	"typescript.experimental.useTsgo": true
}
```

Root `package.json`:

```json
"prepare": "vp config",
"check": "vp check",
"fmt:fix": "vp fmt",
"lint": "vp lint",
"lint:fix": "vp lint --fix"
```

`vp migrate --hooks` if no existing hook tool (vit-store has none).

Update `AGENTS.md`: agents run `vp check` before PR; document `vp -C apps/admin dev`.

---

## What stays non-Vite+

| Component                        | Reason                                            |
| -------------------------------- | ------------------------------------------------- |
| Alchemy deploy/dev orchestration | Production infra; wrap in `vp run`, don't replace |
| Agent `flue build`               | Not a Vite app                                    |
| `astro check`                    | Astro semantics beyond tsgolint                   |
| fallow / knip                    | Separate quality tools                            |
| Patched `alchemy@0.93.12`        | Keep until upstream fix                           |

---

## Risk register

| Risk                                     | Mit                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Vite 8 plugin break (admin)              | 028 gate                                                                |
| Astro + forced vite alias                | Explicit vite catalog dep on storev2; build CI                          |
| Alchemy `Vite()` + vite-plus import      | Keep `dev:vite` script; test alchemy dev post-migrate                   |
| tsdown → pack parity (server noExternal) | Spike server in isolation                                               |
| Turbo vs vp run duplication              | Run parallel until vp run proven; then deprecate turbo tasks one by one |
| Huge fmt PR                              | Dedicated PR, no logic changes                                          |
| Bun vs pnpm migrate assumptions          | Use Bun overrides not pnpm-workspace; test `vp install`                 |
| anti-slop baseline violations            | Subset spike + fix/suppress pass before repo-wide enable                |
| nkzw react rules on Solid storev2        | Override `react/*` off for `apps/storev2/**`                            |
| cyclomatic vs cognitive complexity       | Document delta; fallow cognitive 15 stays as second check               |
| Type assertion churn (anti-slop)         | `require-safety-comment-for-type-assertion` — budget comment pass       |

---

## Sequencing summary

```
028 Vite 8 foundation (PR 1)
    ↓
027 Phase 1 vp migrate + admin config split (PR 2)
    ↓
027 Phase 2 Biome removal + oxfmt (PR 3, big diff)
    ↓
027 Phase 3 vp run tasks (PR 4, incremental)
    ↓
027 Phase 4 tsdown → vp pack (PR 5+, per package)
    ↓
027 Phase 5–6 CI + docs (can merge with Phase 2–3)
```

---

## Open questions

1. ~~Lint base config?~~ → **`@nkzw/oxlint-config` + anti-slop + complexity** (locked)
2. Replace Turbo entirely or keep for deploy graph only?
3. When to enable `typeCheck: true` in CI vs keep tsgo?
4. Vitest: pin only (028) or add tests later via `vp test`?
5. Single `defaultPackage` for admin dev convenience?
6. anti-slop `no-runtime-typeof`: strict default or `{ allowInTypeGuards: true }` for boundary parsers?
7. Align fallow `maxCyclomatic` 20 → 15 when oxlint complexity lands?

---

## Success criteria (full 027 done)

- [ ] Root `vite.config.ts` with lint, fmt, staged, run
- [ ] `@nkzw/oxlint-config` + vendored anti-slop + `complexity` max 15 active
- [ ] Zero Biome
- [ ] `vp check` passes locally and in CI
- [ ] Admin + storev2 build and Alchemy dev work
- [ ] Deploy path unchanged (`alchemy deploy` or wrapped in vp run)
- [ ] tsdown removed; packages build via `vp pack`
- [ ] AGENTS.md documents vp workflow

---

## Reference paths

- store-kit anti-slop vendor: `/home/darjs/dev/store-kit/tools/oxlint/anti-slop/`
- store-kit oxlint (reference only; vit-store uses nkzw): `/home/darjs/dev/store-kit/oxlint.config.ts`
- vit-store admin vite: `apps/admin/vite.config.ts`
- [@nkzw/oxlint-config](https://github.com/nkzw-tech/oxlint-config)
- [anti-slop](https://github.com/dmmulroy/anti-slop)
- [Oxlint complexity rule](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity)
- Vite+ migrate: https://viteplus.dev/guide/migrate
- Vite+ monorepo: https://viteplus.dev/guide/monorepo
