# Plan 027 lint baseline plan (Phases 6–8)

Finish Plan 027 after the tooling stack (#315–#321). Fix lint debt intentionally. No rule disables to fake green CI.

**Current tip:** `feat/027-phase5-fmt-autofix` (#321)  
**Lint:** ~1,178 errors (~842 anti-slop, ~336 nkzw/other) after fmt + `--fix`

## How to read this

One PR is one verifiable unit. Merge in order. Each phase ends with measured error count drop and `vp fmt --check` green.

Execution uses `playbooks/autopilot-stack.md`. Operator lands the Graphite stack after each phase is merge-ready.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

---

## Stack order (after #321)

| PR | Branch | Scope |
|----|--------|-------|
| **#321** | `feat/027-phase5-fmt-autofix` | fmt + lint `--fix` (done) |
| **#322** | `feat/027-phase6-anti-slop-shared-server` | anti-slop: `packages/shared` + `apps/server` |
| **#323** | `feat/027-phase6b-anti-slop-api` | anti-slop: `packages/api` |
| **#324** | `feat/027-phase6c-anti-slop-apps` | anti-slop: `apps/admin`, `apps/storev2`, `apps/agent`, `packages/assistant` |
| **#325** | `feat/027-phase7-nkzw-baseline` | nkzw: complexity, admin react, env.d.ts, worker.mjs, unused vars |
| **#326** | `feat/027-phase8-ci-lint-gate` | CI: `vp fmt --check` + `vp lint` in workflow |

---

## storev2 React override (keep)

**Verdict: correct.** `apps/storev2` uses **Solid** (`solid-js`) in `.tsx` islands and Astro. Zero `from "react"` imports in storev2.

nkzw enables the React plugin globally. Without the override, oxlint applies React rules to Solid TSX and fires false positives (`react/set-state-in-effect`, `react/rules-of-hooks`, etc.).

The override disables React rules for `apps/storev2/**` only. Admin keeps full React lint.

---

## Phase 6 — Anti-slop swarm (intentional fixes)

**Goal:** Drive anti-slop errors to **0** without disabling rules or broad ignores.

**Principles:** parse at I/O boundaries, name domain types, `SAFETY:` comments only where a type assertion remains after parsing, no `Record<string, unknown>` without owner contract.

### Error budget by area (anti-slop only, approximate)

| Area | anti-slop errors | Notes |
|------|----------------:|-------|
| `packages/api` | 176 | integrations, parsers, tRPC boundaries |
| `apps/agent` | 210 | flue tools, ship-paid-orders |
| `packages/assistant` | 202 | admin bot instructions glue |
| `apps/storev2` | 124 | Solid TSX + worker.mjs |
| `apps/admin` | 74 | some overlap with nkzw react later |
| `packages/shared` | 36 | smallest — ship first |
| `apps/server` | 20 | routes, auth, DO |

### Top rules to fix (repo-wide)

| Rule | ~count | Fix pattern |
|------|-------:|-------------|
| `require-safety-comment-for-type-assertion` | 321 | Parse first; if `as` remains, add `// SAFETY: <invariant>` on prior line |
| `no-unknown-parameters` | 141 | Rename `input`/`data`/`body` params to domain types; parse at caller |
| `no-runtime-typeof` | 131 | Replace `typeof x === "string"` with schema/validator at boundary |
| `no-unsafe-dictionary-type` | 74 | Replace `Record<string, unknown>` with named metadata types |
| `no-known-value-widening` | 63 | Use `satisfies` or named return types |
| `no-shape-in-symbol-names` | 53 | Rename `*shape*` symbols to domain names (careful with tRPC "shape") |
| `no-conditional-empty-object-spread` | 33 | Build object in steps (fix alchemy.run.ts properly, drop override) |

### Swarm layout (3 PRs, parallel workers per PR)

Use `subagent_type: "poteto-agent"`. One worker per package directory. Each worker:

1. `bunx vp lint <path> 2>&1 | rg anti-slop` — inventory
2. Fix files in dependency order (types → parsers → callers)
3. Re-run `bunx vp lint <path>` until anti-slop clean for that path
4. No new `oxlint-disable` except single-line with invariant comment
5. Commit on shared branch; coordinator merges worker diffs

**PR #322 workers (parallel):**

| Worker | Path | Target |
|--------|------|--------|
| W1 | `packages/shared/` | 0 anti-slop |
| W2 | `apps/server/` | 0 anti-slop; fix `worker.mjs:16` typeof |

**PR #323 workers:**

| Worker | Path | Target |
|--------|------|--------|
| W3 | `packages/api/src/lib/integrations/` | parsers, webhooks, amazon-html |
| W4 | `packages/api/src/queries/` + `routers/` | boundary types on inputs |
| W5 | `packages/api/src/` (remainder) | sweep |

**PR #324 workers:**

| Worker | Path | Target |
|--------|------|--------|
| W6 | `apps/admin/` | anti-slop only (react rules deferred to #325) |
| W7 | `apps/storev2/` | Solid components + worker |
| W8 | `apps/agent/` | agent lib |
| W9 | `packages/assistant/` | assistant package |

**Verify per PR:**

- [ ] `bunx vp lint <changed paths>` — 0 anti-slop in scope
- [ ] `bunx vp fmt --check`
- [ ] `turbo check-types` or affected package `check-types`
- [ ] Error count drop logged in PR body (e.g. 842 → 600 → 300 → 0)

**Review gate:** None. Tooling-only PRs.

---

## Phase 7 — nkzw baseline (non-anti-slop)

**Goal:** ~336 remaining errors → 0. **Do not** disable anti-slop to get here.

### Error budget by area (non-anti-slop)

| Area | ~errors | Top rules |
|------|--------:|-----------|
| `packages/api` | 200 | complexity, unused, import |
| `apps/admin` | 59 | react/set-state-in-effect, complexity, react-hooks |
| `apps/storev2` | 37 | complexity, no-console (warn) |
| `apps/agent` | 28 | complexity, unicorn |
| `packages/shared` | 3 | minor |
| `apps/server` | 4 | minor |
| `env.d.ts` files | 4 | `typescript/no-empty-object-type` |

### Fix strategy (single PR #325)

| Category | Count | Approach |
|----------|------:|----------|
| **complexity >15** | ~46 | Refactor hotspots OR `// oxlint-disable-next-line complexity` with ponytail comment on legacy UI (admin order forms) |
| **admin react** | ~10 | Fix set-state-in-effect properly (derive state, key reset) — do not disable |
| **env.d.ts empty interfaces** | 4 | Extend override: `typescript/no-empty-object-type: off` for `**/env.d.ts` only |
| **worker.mjs** | 1 | Tag parser helper (may overlap #322 W2) |
| **unused vars** | ~10 | Remove or prefix `_` |
| **storev2 no-console** | few | warn tier already; remove or structured log |

**Overrides to narrow (in #325):**

- Remove `packages/**` blanket for `@nkzw/no-instanceof`, `import/no-namespace` where fixes land
- Keep `apps/storev2/**` react-off (Solid)
- Remove `alchemy.run.ts` anti-slop spread override after Phase 6 fixes spreads
- Remove `schema.d.ts` from lint ignore (gitignore only)

**Verify:**

- [ ] `bunx vp lint` exit 0
- [ ] `bunx vp fmt --check`
- [ ] `turbo check-types`

---

## Phase 8 — CI gate (#326)

Add to `.github/workflows/ci.yml`:

```yaml
- run: bunx vp fmt --check
- run: bunx vp lint
```

Defer `typeAware/typeCheck: true` until astro-check TS7 unblocked.

**Verify:** CI green on stack tip (except known astro-check if still deferred).

---

## Operator checklist

- [ ] Merge #315 → #321 in order (or stack-merge)
- [ ] Approve Phase 6 swarm execution ("go" on anti-slop PRs)
- [ ] Phase 7 after Phase 6 merges
- [ ] Phase 8 after `vp lint` exit 0 locally

---

## Appendix A — References

- Adversarial review: `~/dev/scratchpad/vit-store/review-027-adversarial.md`
- store-kit lint: ~64s with `typeCheck: true`; vit-store ~8s with `typeCheck: false`
- Plan 027: `plans/027-migrate-lint-format-to-vite-plus.md`
