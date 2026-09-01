# Lint worker brief (Phase 6–7+)

Every subagent fixing lint debt must follow this. The coordinator rejects diffs that violate it. Repo-wide policy: `AGENTS.md` § Lint & check.

## Hard rejects

- `oxlint-disable` / eslint-disable (any form)
- New rule overrides in `oxlint.config.ts`
- `as any`
- Chained assertions (`as unknown as T`)
- Generic or vacuous `// SAFETY:` comments ("ok", "trust me", "schema covers it" without naming the invariant)
- `v.any()` or schemas that accept everything to go green
- Moving `typeof` one function deeper instead of parsing at the I/O boundary
- Renaming `unknown` to `any` or hiding it behind type aliases (`no-unknown-type-aliases`)

## Fix order (per file / package)

1. **Boundaries first** — `no-runtime-typeof`, `no-unknown-parameters`, `no-unknown-returns`, `no-unknown-type-aliases`
   - Put valibot (or an existing shared schema) at the wire/HTTP/JSON/env/form edge.
   - Export `v.InferOutput<typeof schema>` as the domain type.
   - Internal functions take parsed types, not `unknown`.

2. **Contracts** — `no-unsafe-dictionary-type`, `no-known-value-widening`
   - Named metadata types or `satisfies Record<...>`, not `Record<string, unknown>`.
   - Prefer inference + `satisfies` over explicit widening annotations.

3. **Assertions last** — `require-safety-comment-for-type-assertion`, `no-chained-type-assertions`
   - If you are adding many SAFETY comments, you skipped step 1.
   - A SAFETY comment must state the **concrete invariant** that makes the assertion sound (e.g. "parsed by `fooSchema` on the prior line", "Drizzle row from `orders` table", "Hono FormData entry validated as File via `instanceof`").

4. **Renames** — `no-shape-in-symbol-names`, empty conditional spreads, etc.

## Canon pattern (copy this shape)

```typescript
export const widgetSchema = v.object({ id: v.number(), name: v.string() });
export type Widget = v.InferOutput<typeof widgetSchema>;

// At I/O boundary only:
const widget = v.parse(widgetSchema, await res.json());

// Downstream:
function useWidget(widget: Widget) { ... }
```

See `packages/assistant/src/products.ts` and the golden fixes on `packages/shared/src/trpc-error.ts`.

## Verification (required before PASS)

```bash
bunx vp lint <your path>   # 0 anti-slop in scope
bunx vp fmt --check
# affected package check-types if you touched exports
bun scripts/lint-anti-slop-bucket.ts <your path>
```

Report: PASS | ISSUES | BLOCKED, anti-slop count before/after, files touched.

## Phase 6c workers (after #322 merges)

| Worker | Path                                     | ~anti-slop        |
| ------ | ---------------------------------------- | ----------------- |
| W3     | `packages/api/src/lib/integrations/`     | parsers, webhooks |
| W4     | `packages/api/src/queries/` + `routers/` | boundary types    |
| W5     | `packages/api/src/` remainder            | sweep             |
| W6     | `apps/admin/`                            | anti-slop only    |
| W7     | `apps/storev2/`                          | Solid + worker    |
| W8     | `apps/agent/`                            | agent lib         |
| W9     | `packages/assistant/`                    | assistant         |

Branch from stack tip: `feat/027-phase6-anti-slop-shared-server` → then `feat/027-phase6b-anti-slop-api` → `feat/027-phase6c-anti-slop-apps`.

Worktree per worker: `~/dev/scratchpad/vit-store/phase6-w<N>/`.
