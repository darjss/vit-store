For `impeccable` commands: root = storefront, `IMPECCABLE_CONTEXT_DIR=apps/admin` = dashboard. Infer from user keywords. Ask if unclear.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `darjss/vit-store`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` plus root `docs/adr/`. See `docs/agents/domain.md`.

## Orchestrated agent workflow

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
