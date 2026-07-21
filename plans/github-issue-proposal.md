# GitHub issue proposal — draft only

> **Do not publish.** Await explicit user approval. Parent placeholder: `<PARENT_ISSUE_URL>`. Suggested labels use only the canonical triage vocabulary.

## Parent draft

**Title:** Implement the accepted Vit Store audit corrections
**Suggested canonical triage label:** `ready-for-human`

## What to build

Coordinate the 26 accepted audit corrections as independently grabbable changes. Preserve Customer shopping, User dashboard, Order, Payment, Delivery zone, Messenger, deployment, and maintenance behavior except for each child’s exact correction.

Security and operations work must remain defensive: never expose credentials, Customer data, environment identifiers, or operational misuse detail. Use existing static/build checks and real browser, API, Worker, Messenger, or focused CLI proof with disposable data; do not add unit or integration tests. Coordinate with adjacent open issues without closing or modifying them.

## Acceptance criteria

- [ ] All 26 approved child issues are completed in dependency order.
- [ ] Each child has real-system proof and applicable existing static/build checks.
- [ ] Unresolved owner or operations choices stop at their information gate.
- [ ] No rejected or discussion-only finding is included.

## Blocked by

None — children carry their own dependencies.

## Child drafts in dependency order

### A-01 / Plan 001 — Require an admin session before writes

**Draft key:** `child-001`
**Suggested canonical triage label:** `ready-for-human`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Protect dashboard upload and operational writes with the existing User session while keeping explicitly public authentication and webhook surfaces unchanged.

## Acceptance criteria

- [ ] Unsigned writes are rejected before parsing or storage.
- [ ] A signed-in User can complete the unchanged dashboard upload flow with disposable data.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### A-03 / Plan 002 — Place product creation inside the signed-in admin area

**Draft key:** `child-002`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Place Product creation under the existing signed-in dashboard guard without changing its public navigation destination or save behavior.

## Acceptance criteria

- [ ] Signed-out visitors are redirected before the creation form renders.
- [ ] A signed-in User sees the same dashboard form and can complete the existing Product save flow.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### A-04 / Plan 003 — Bind address updates to the signed-in Customer

**Draft key:** `child-003`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Make Customer address updates derive ownership from the authenticated Customer rather than request-selected identity.

## Acceptance criteria

- [ ] A Customer can update only their own address.
- [ ] Unrelated Customer fields and existing response behavior remain unchanged.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### A-09 / Plan 004 — Return the Customer from the Order transaction

**Draft key:** `child-004`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Build checkout session data from the Customer created or updated in the same Order transaction, removing a failure after committed writes.

## Acceptance criteria

- [ ] New and existing disposable Customers receive the unchanged checkout session behavior.
- [ ] A successful Order no longer depends on a detached Customer lookup after commit.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### A-07 / Plan 005 — Make transfer claims safe to repeat

**Draft key:** `child-005`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Make bank-transfer claims repeat-safe while preserving the distinction between a transfer claim and transfer confirmation.

## Acceptance criteria

- [ ] A repeated claim produces at most one state transition and one Admin alert.
- [ ] Closed Payments remain closed and no claim applies stock.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Choose the Customer-facing result when a transfer claim reaches a closed Payment.

---

### A-10 / Plan 006 — Abort paid Order edits when stock cannot change

**Draft key:** `child-006`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Fail paid Order edits atomically when any required stock transition cannot be applied.

## Acceptance criteria

- [ ] A valid paid edit retains current behavior.
- [ ] A missing or insufficient-stock transition leaves Order, Payment, sales, and stock unchanged.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Decide whether Users have an intentional, explicitly audited negative-stock override.

---

### B-01 / Plan 007 — Render editable products from complete product data

**Draft key:** `child-007`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Ensure editable Product search results use complete stored Product data rather than placeholder values.

## Acceptance criteria

- [ ] Editing one field from search preserves every untouched stored field.
- [ ] Search ranking, card layout, and save behavior remain unchanged.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### B-02 / Plan 008 — Make Featured and New match their labels

**Draft key:** `child-008`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Define the Customer-facing meaning of Featured and New, then apply the same rules to results, ordering, and displayed totals.

## Acceptance criteria

- [ ] Featured results and totals describe the same Product set.
- [ ] New follows the approved deterministic ordering across pages.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Define New ordering and its deterministic tie-break, and confirm Featured total semantics.

---

### B-03 / Plan 009 — Open the storefront menu as a true modal

**Draft key:** `child-009`
**Suggested canonical triage label:** `ready-for-human`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Make the shared storefront menu a true modal with one owner for close, focus restoration, animation, and navigation cleanup.

## Acceptance criteria

- [ ] Keyboard focus cannot move behind the open menu and returns to its trigger when possible.
- [ ] Repeated close and navigation paths leave no stale overlay or scroll lock in supported browsers.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### B-04 / Plan 010 — Refresh every cached purchase-list version after a write

**Draft key:** `child-010`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Refresh every cached Purchase-list variant after a Purchase write without clearing unrelated cached data.

## Acceptance criteria

- [ ] Filtered, sorted, searched, and non-default pages refresh without manual reload.
- [ ] Unrelated dashboard queries are not invalidated.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### B-05 / Plan 011 — Reject invalid catalog page numbers consistently

**Draft key:** `child-011`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Apply one approved validation and out-of-range policy to category and brand catalogue page numbers.

## Acceptance criteria

- [ ] Malformed and past-end page requests follow the approved not-found or canonical response without a Customer-facing error.
- [ ] Valid in-range pages and existing sorting remain unchanged.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Choose leading-zero and empty-catalog handling and the response for invalid or past-end pages.

---

### B-06 / Plan 012 — Restore Delivery zone confirmation and Order notes

**Draft key:** `child-012`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Restore explicit Delivery zone confirmation and optional Order notes before final Messenger checkout confirmation.

## Acceptance criteria

- [ ] A Customer must choose a surfaced Delivery zone and an unoffered choice is rejected.
- [ ] Notes can be supplied or explicitly skipped before one final-confirmed Order is created.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### B-07 / Plan 013 — Preserve old Product links when a slug changes

**Draft key:** `child-013`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Preserve prior Product links under an approved slug-history and retention policy when a Product name changes.

## Acceptance criteria

- [ ] The current Product URL renders and approved prior URLs redirect to it.
- [ ] History is updated atomically, deduplicated, and follows the approved retention rule.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Decide whether slug history is authoritative for redirects, plus retention and concurrent-edit policy.

---

### S-03 / Plan 014 — Use one QPay create-and-store function

**Draft key:** `child-014`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Centralize QPay invoice creation so eager checkout preparation and fallback use one Payment-owned persistence behavior.

## Acceptance criteria

- [ ] Eager and fallback paths retain the existing response, Payment, and cache behavior.
- [ ] Eager failure remains non-fatal, is lifecycle-safe, and does not expose sensitive provider information.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Draft `child-004`
- Information gate: Confirm eager/fallback persistence ordering and the approved Worker-lifecycle boundary for non-fatal eager work.

---

### S-04 / Plan 015 — Attempt both scheduled jobs every time

**Draft key:** `child-015`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Attempt independent restock and Payment-notification scheduled work on every trigger even when one job fails.

## Acceptance criteria

- [ ] Both jobs are attempted when either one fails.
- [ ] The overall scheduled result follows the approved operations policy without exposing Customer or Payment content.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Choose whether either job failure rejects the overall scheduled invocation after both jobs settle.

---

### S-05 / Plan 016 — List the admin functions the assistant already has

**Draft key:** `child-016`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Document the claimed-transfer count and list reads that the admin assistant already has, without adding capabilities.

## Acceptance criteria

- [ ] An authorized User can ask the assistant for each existing read with synthetic data.
- [ ] The assistant does not describe a transfer claim as confirmation.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### D-01 / Plan 017 — Delete stale diagnostics and the cart placeholder

**Draft key:** `child-017`
**Suggested canonical triage label:** `ready-for-human`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Remove the accepted unowned diagnostic, benchmark, sandbox, and starter-cart surfaces after sanitized access and runbook review.

## Acceptance criteria

- [ ] Every removed surface is confirmed unused and unowned before deletion.
- [ ] Retained health, catalogue, cart, and dashboard behavior continues through real boundaries.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### D-03 / Plan 018 — Delete unused shared copies and pass-through files

**Draft key:** `child-018`
**Suggested canonical triage label:** `ready-for-agent`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Remove proven-unused duplicate shared contracts and pass-through exports after checking package consumers.

## Acceptance criteria

- [ ] No tracked or documented external consumer uses a removed export.
- [ ] Owned API contracts and active shared Product/Order values remain intact.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### D-04 / Plan 019 — Remove the install-only CI job

**Draft key:** `child-019`
**Suggested canonical triage label:** `ready-for-human`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Remove the redundant dependency-install CI job after confirming its status name is not required.

## Acceptance criteria

- [ ] The retained check job still installs dependencies and reports successfully.
- [ ] No required status or downstream workflow consumer is lost.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### D-08 / Plan 020 — Untrack reproducible reports and the dev log

**Draft key:** `child-020`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Stop tracking reproducible quality output and a development log, and send future generated output to ignored scratch storage.

## Acceptance criteria

- [ ] No external owner consumes the removed tracked artifacts.
- [ ] Running quality generation no longer dirties a clean worktree.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Confirm no external dashboard or runbook owns the generated reports or development log.

---

### D-10 / Plan 021 — Remove misleading teardown and unrelated scratch files

**Draft key:** `child-021`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Remove an ambiguous repository-wide teardown alias and two unowned scratch artifacts after runbook and archive checks.

## Acceptance criteria

- [ ] Existing app-specific teardown behavior remains unchanged and no new destructive command is added.
- [ ] No active runbook or archive owner depends on the removed names or artifacts.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Confirm no recovery/runbook or archive owner needs the root teardown alias or scratch artifacts.

---

### S-06 / Plan 022 — Delete broken command names instead of recreating scripts

**Draft key:** `child-022`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Remove manifest commands that point to missing targets or obsolete workspace names, with matching documentation cleanup.

## Acceptance criteria

- [ ] Every retained command resolves to a tracked target or intended workspace.
- [ ] No owned operator workflow loses a command and no absent script is recreated speculatively.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Confirm no external operator runbook depends on each broken command name or workspace alias.

---

### P-01 / Plan 023 — Standardize workspace package resolution

**Draft key:** `child-023`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Choose and document one proven workspace package-resolution model across all application consumers.

## Acceptance criteria

- [ ] Every application consumer passes clean static and build checks without stale generated output.
- [ ] No consumer-specific contradictory alias remains; stop at the first incompatible tool.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Draft `child-018`
- Information gate: Choose one candidate source-or-built workspace resolution model after recording every application consumer.

---

### P-02 / Plan 024 — Resolve ownership of the legacy logger package

**Draft key:** `child-024`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Resolve ownership of the secondary logger and its remaining ingestion workflow before retaining, migrating, or removing it.

## Acceptance criteria

- [ ] Any active external consumer keeps its required safe structured fields.
- [ ] The final package/dependency state has one documented logger owner and no undeclared caller.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Identify the ingestion workflow owner and any external parser of its structured logger output.

---

### P-04 / Plan 025 — Reconcile SQL migrations with journal metadata

**Draft key:** `child-025`
**Suggested canonical triage label:** `ready-for-human`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Reconcile migration metadata, declared schema, and read-only environment history; use only forward-compatible repairs for changes proven missing.

## Acceptance criteria

- [ ] Every environment comparison is recorded without rewriting applied history.
- [ ] A disposable fresh database reaches the declared schema using the approved forward-only sequence.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

None — can start immediately

---

### P-05 / Plan 026 — Make cache maintenance environment-explicit and safe

**Draft key:** `child-026`
**Suggested canonical triage label:** `needs-info`
**Parent:** `<PARENT_ISSUE_URL>`

## What to build

Decide whether cache maintenance remains supported; if retained, require an explicit environment and preview before any remote operation.

## Acceptance criteria

- [ ] Default invocation performs no cache I/O and no fixed environment target remains.
- [ ] Approved proof uses only disposable local data and selects the intended scope.
- [ ] Applicable existing static/build checks pass, and no unrelated behavior changes.

## Blocked by

- Information gate: Decide whether cache maintenance remains owned and, if retained, which explicit environments and key owner are supported.

---

## Needs discussion — not publishable

**A-06 — Delete the production photo diagnostic.** User note: “No note provided”.

Decision question: **Should the production photo diagnostic be deleted, retained with an explicit owner/access policy, or handled in a separately approved change?**
