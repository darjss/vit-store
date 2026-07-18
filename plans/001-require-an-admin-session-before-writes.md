# Plan 001: Require an admin session before writes

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- apps/server/src/index.ts apps/server/src/routes/uploads.ts apps/admin/src/components/upload-button.tsx packages/api/src/lib/trpc.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: A-01
- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: security
- **Suggested triage label**: `ready-for-human`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Upload and operational write routes are mounted beside public routes, while the dashboard upload request does not send its session cookie. Logging a request as admin does not authenticate a User. The correction must reject unsigned writes before parsing or storage while keeping OAuth and webhooks public.

## Current state

**Baseline source:** `apps/server/src/index.ts:118-123`

```ts
app.route("/", healthRoutes);
app.route("/admin", authRoutes);
app.route("/upload", uploadRoutes);
app.route("/webhooks", paymentRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/admin", adminRoutes);
```

### Domain and repository rule

`packages/api/src/lib/trpc.ts:58-80` is the session-auth exemplar. In `CONTEXT.md`, an admin/staff principal is a **User**. Keep OAuth start/callback and webhook verification public.

### Existing-issue coordination

Coordinate with broad go-live issue #125; do not claim duplication or modify it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- apps/server/src/index.ts apps/server/src/routes/uploads.ts apps/admin/src/components/upload-button.tsx packages/api/src/lib/trpc.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- shared session gate for upload and explicitly operational admin handlers
- dashboard upload credentials needed by that gate

**Files/path families allowed**
- `apps/server/src/index.ts`
- `apps/server/src/routes/uploads.ts`
- `apps/admin/src/components/upload-button.tsx`
- `packages/api/src/lib/trpc.ts`

**Out of scope**
- OAuth start/callback
- Messenger and Payment webhooks
- image transforms, object keys, and response shapes
- new machine-authentication design

## Git workflow

- Branch: `audit/a-01-require-an-admin-session-before-wr`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Inventory every route under the upload and operational mounts and identify public or machine callers from tracked code and read-only access/runbook evidence

Inventory every route under the upload and operational mounts and identify public or machine callers from tracked code and read-only access/runbook evidence. Record the intended auth per route.

**Verify**: `git grep -n -E 'app.route\("/(admin|upload|webhooks)|adminAuth|credentials:' -- apps/server/src apps/admin/src packages/api/src/lib/trpc.ts` → output names every protected/public mount, the existing admin-session helper, and the dashboard upload caller; record any non-User machine caller before editing.

### Step 2: If no public machine caller exists, apply the existing admin session mechanism before body parsing/write dispatch; keep public auth/webhook routes outside the gate

If no public machine caller exists, apply the existing admin session mechanism before body parsing/write dispatch; keep public auth/webhook routes outside the gate.

**Verify**: `bun run --cwd apps/server check-types && bun run --cwd apps/admin check-types && git diff --check` → exit 0; the guard and credential change compile and the diff has no whitespace errors.

### Step 3: Send dashboard uploads with credentials and prove unsigned/signed behavior through the real staging boundary

Send dashboard uploads with credentials and prove unsigned/signed behavior through the real staging boundary.

**Verify**: **Prerequisites/setup:** Staging server/dashboard URL, disposable signed-in User, synthetic image, and operator access to the staging object list.

**Bounded procedure:** Record object count/key prefix, then attempt the upload once without a session and once through the signed-in dashboard.

**Machine-observable expected result:** Unsigned response is 401 before object count changes; signed request returns the unchanged response shape and creates exactly one disposable object.

**Cleanup:** Delete that object through the existing staging storage workflow and confirm the count returns to baseline.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `A-01` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- A real machine caller or required public status read is found without an approved authentication contract.
- The session mechanism differs from the established admin session or requires exposing a credential.
- Body, storage, or response behavior would change.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Review new operational routes at the mount boundary; a `user_type` log field is never authorization.
