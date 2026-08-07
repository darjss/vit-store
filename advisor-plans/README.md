# Owner-directed implementation plans

Created on 2026-08-07. This directory is separate from the sealed 26-plan audit set in `plans/`, whose validator only accepts plans 001–026.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
|---|---|---:|---:|---|---|
| 001 | [Move storefront delivery-zone choice to admin dispatch](001-move-storefront-delivery-zone-to-admin-dispatch.md) | P1 | M | — | DONE |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED — <reason>`, `REJECTED — <reason>`.

## Dependency notes

Plan 001 is self-contained. It preserves the existing Messenger/Flue checkout and limits the change to storefront checkout, shared Order input, dispatch API, admin dashboard, and delivery-zone ownership docs.
