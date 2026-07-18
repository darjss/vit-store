# Plan 009: Open the storefront menu as a true modal

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- apps/storev2/src/components/starwind/dialog/Dialog.astro apps/storev2/src/components/starwind/dialog/DialogTrigger.astro apps/storev2/src/components/starwind/dialog/DialogContent.astro apps/storev2/src/components/starwind/sheet/Sheet.astro apps/storev2/src/layouts/Layout.astro`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: B-03
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `ready-for-human`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The shared dialog sets an `open` attribute rather than using the browser modal contract, so focus can escape behind the menu and multiple scripts race to close it. One handler must own modal state, animation, cleanup, and trigger focus.

## Current state

`Dialog.astro:230-247`:
```ts
private open(): void {
  this.dialog.setAttribute("open", "");
  document.body.classList.add("overflow-hidden");
}
```
`Layout.astro:122-151` independently closes dialogs during navigation.

### Domain and repository rule

Preserve topmost-dialog and animation state. `Sheet.astro` wraps this shared dialog, so verify all consumers. Use native `showModal()`/`close()` semantics and reduced-motion behavior.

### Existing-issue coordination

No exact open issue was found.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- apps/storev2/src/components/starwind/dialog/Dialog.astro apps/storev2/src/components/starwind/dialog/DialogTrigger.astro apps/storev2/src/components/starwind/dialog/DialogContent.astro apps/storev2/src/components/starwind/sheet/Sheet.astro apps/storev2/src/layouts/Layout.astro` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- single shared dialog ownership
- modal opening, animated close, focus restore
- navigation cleanup routed through that owner

**Files/path families allowed**
- `apps/storev2/src/components/starwind/dialog/Dialog.astro`
- `apps/storev2/src/components/starwind/dialog/DialogTrigger.astro`
- `apps/storev2/src/components/starwind/dialog/DialogContent.astro`
- `apps/storev2/src/components/starwind/sheet/Sheet.astro`
- `apps/storev2/src/layouts/Layout.astro`

**Out of scope**
- visual redesign
- unrelated drawers
- second close/focus system
- non-dialog components

## Git workflow

- Branch: `audit/b-03-open-the-storefront-menu-as-a-true`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Confirm supported mobile Chrome/Safari matrix and whether any shared-dialog consumer intentionally needs non-modal behavior

Confirm supported mobile Chrome/Safari matrix and whether any shared-dialog consumer intentionally needs non-modal behavior.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Make `DialogHandler` own open/close/focus; remember the invoking trigger and remove only competing cleanup made obsolete

Make `DialogHandler` own open/close/focus; remember the invoking trigger and remove only competing cleanup made obsolete. Guard delayed close against reopen.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Browser-check menu and Sheet under normal/reduced motion, keyboard and navigation

Browser-check menu and Sheet under normal/reduced motion, keyboard and navigation.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

Storefront `check-types` and root `lint` exit 0. Focus cannot tab behind; Escape/backdrop/button close once; focus returns when trigger remains connected; no scroll lock/backdrop survives navigation at 390px and desktop.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `B-03` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- A caller requires non-modal behavior.
- Supported browser modal behavior conflicts with current Sheet markup.
- A disconnected trigger or reopen race cannot be handled within the single owner.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

All future shared dialog close paths must call the owner; test focus and navigation whenever animation changes.
