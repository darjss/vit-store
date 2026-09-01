For `impeccable` commands: root = storefront, `IMPECCABLE_CONTEXT_DIR=apps/admin` = dashboard. Infer from user keywords. Ask if unclear.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `darjss/vit-store`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` plus root `docs/adr/`. See `docs/agents/domain.md`.

### vit-playground

Maintenance scripts, product JSON dumps, QA/dogfood reports, and scratch notes live in the sibling repo [`darjss/vit-playground`](https://github.com/darjss/vit-playground) at `../vit-playground` (or `~/dev/vit-playground`). Keep `vit-store` for app source, ADRs, `docs/problems/`, and `plans/`.

| Path in vit-playground | Use                                                                            |
| ---------------------- | ------------------------------------------------------------------------------ |
| `scripts/`             | Catalog ops, cache maintenance, slugs, revenue reports, messenger explore      |
| `api-scripts/`         | DB/product maintenance; imports `@vit/api` from the sibling vit-store checkout |
| `data/`                | Product JSON, `seed.sql`, sample images                                        |
| `reports/`             | Dogfood output, production QA snapshots                                        |
| `scratch/`             | Temp notes and one-off drafts                                                  |
| `vit-stock-review/`    | Catalogue audits, stock sheets, generated creatives                            |

`apps/agent/scripts/` stays in vit-store (wired into agent dev/deploy). Do not move those back into vit-store root `scripts/`. Run playground scripts from `vit-playground` or via `bun ../vit-playground/scripts/...` from vit-store; see vit-playground `README.md`.

## Lint & check

All lint and typecheck cleanup (anti-slop, nkzw, CI gates) follows the same bar. See `scripts/anti-slop-worker-brief.md` for anti-slop specifics; the rules below apply to **every** lint phase.

**Hard rejects**

- `oxlint-disable` / `eslint-disable` (any form)
- New rule overrides in `oxlint.config.ts` to make CI green
- `as any`, chained `as unknown as`, or vacuous `// SAFETY:` comments
- Schemas or types that accept everything just to satisfy a rule

**Fix order**

1. **Design first** — parse at I/O boundaries (valibot or existing wire schemas), name domain types, fix data flow. Internal code takes parsed types, not `unknown`.
2. **Contracts** — `satisfies`, named metadata types; no `Record<string, unknown>` without an owner contract.
3. **Assertions last** — only when a real invariant remains after step 1. The `// SAFETY:` comment must state the **concrete invariant** that proves the assertion (e.g. "parsed by `fooSchema` on the prior line", "Drizzle row from `orders` table").
4. **Complexity / framework rules** — refactor first. A single-line `complexity` disable with a `ponytail:` comment is allowed only on legacy UI hotspots named in the plan; never blanket-off a rule category.

**Verify before PASS**

```bash
bun scripts/lint-anti-slop-bucket.ts <path>   # when anti-slop is in scope
bunx vp lint <path>
bunx vp fmt --check
```

Do not merge a lint PR whose only diff is config overrides or comment spam.


- Use caveman-style output for worker/reviewer agents: terse chat only, details in summary/report files.
- Use the `btca-local` skill whenever work depends on third-party/local repo internals, especially Flue. Inspect source/examples before assuming APIs. Cite local paths in summaries when decisions depend on those internals.
- Use the `karpathy-guidelines` skill when writing, reviewing, or refactoring code: surgical changes, simple direct design, explicit assumptions, and verifiable success criteria.
- For reviews, use `thermo-nuclear-code-quality-review` only. Do one review pass; if the author fixes first-pass findings and checks/proof are green, push/PR/merge without a second review unless risk is high or the maintainer asks.
- After an issue branch is approved/fixed, proactively push it, open a PR, watch Macroscope only unless told otherwise, merge when safe, clean up worktrees, then start the next unblocked `ready-for-agent` issue.
- In isolated worktrees, copy or reference local `.env*` only when needed for testing and safe. Never commit secrets/private exports. Do not shell-source `.env` blindly; it may be malformed for shell.
- Keep `messenger-chat-history/` private and untracked. Do not commit it or derived private payloads.

## Messenger agent implementation notes

- `@flue/messenger` should own inbound Messenger verification/parsing/conversation-key behavior.
- Do not guess Flue Messenger APIs; verify them with `btca-local` against local Flue source/examples.
- If `@flue/messenger` does not provide outbound Send API helpers, keep any project-owned Messenger client as a thin Graph Send API boundary only. Avoid broad generic Graph clients or unused Messenger features in v1.
- Messenger delivery retries must be deduped by inbound message identity before dispatching assistant turns.
