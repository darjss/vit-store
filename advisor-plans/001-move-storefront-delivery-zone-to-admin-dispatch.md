# Plan 001: Remove delivery-zone choice from storefront checkout and require it at admin dispatch

> **Executor instructions**: Follow this plan in order. Run each verification gate before moving on. Keep the Customer-facing Messenger/Flue checkout code unchanged. If a STOP condition occurs, stop and report it rather than widening scope.
>
> **Drift check (run first)**: `git diff --stat 1436eb2..HEAD -- packages/shared/src/schema.ts apps/storev2/src/components/checkout/checkout-form.tsx packages/api/src/routers/store/order.ts packages/api/src/routers/admin/order.ts packages/api/src/queries/orders.ts apps/admin/src/components/order apps/admin/src/routes/_dash/orders.$id.tsx CONTEXT.md docs/adr`
>
> If any in-scope source changed, compare the excerpts below with the live code. Stop on a behavior mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `1436eb2`, 2026-08-07

## Why this matters

Storefront checkout now asks a Customer to understand TU Delivery zones, waits for a remote zone list, and blocks order submission when that list is down. The admin dispatch path does the opposite: it does not ask for a zone and silently uses zone `15` when an Order has none. Move the choice to the staff member who checks the address and sends the Order, while keeping checkout limited to phone, natural address, and optional notes.

The Orders and Customers database columns already allow `NULL`, so this needs no migration. Existing Messenger/Flue checkout may keep sending a confirmed zone through the shared `order.addOrder` endpoint; do not edit its code.

## Current state

### Storefront requires and fetches a zone

- `apps/storev2/src/components/checkout/checkout-form.tsx:61-68` requires `addressZoneId` in the local validator.
- `apps/storev2/src/components/checkout/checkout-form.tsx:100-126` fetches and derives state from `order.getDeliveryAddressZones`.
- `apps/storev2/src/components/checkout/checkout-form.tsx:183-187,230-234` restores a Customer's saved zone.
- `apps/storev2/src/components/checkout/checkout-form.tsx:468-521` renders the Customer-facing zone selector and fetch errors.
- `apps/storev2/src/components/checkout/checkout-form.tsx:596-602` blocks checkout until zone data is ready.

Current validator excerpt:

```ts
// apps/storev2/src/components/checkout/checkout-form.tsx:61-68
const checkoutValidators = v.object({
	phoneNumber: phoneSchema,
	address: v.pipe(v.string(), v.minLength(5, "Хаягаа бичнэ үү")),
	addressZoneId: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(1, "Хаягийн бүс сонгоно уу"),
	),
	notes: v.string(),
});
```

### The shared storefront Order input requires a zone

```ts
// packages/shared/src/schema.ts:369-378
export const newOrderSchema = v.object({
	// phone and address omitted here
	address: v.string(),
	addressZoneId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	notes: v.optional(v.string()),
	// products omitted here
});
```

`packages/api/src/routers/store/order.ts:145-168` writes that value to both the Customer and Order. The public `getDeliveryAddressZones` procedure at lines 344-360 must remain because the existing Messenger checkout also uses this store router.

### Admin dispatch hides the choice and applies a false default

```ts
// packages/api/src/routers/admin/order.ts:603-623
shipOrder: proc
	.input(v.object({ orderId: v.number() }))
	.mutation(async ({ input, ctx }) => {
		// ...load and check pending Order...
		const deliveryResult = await createDelivery(
			order.id,
			order.orderNumber,
			String(order.customerPhone),
			order.addressZoneId ?? 15,
			order.address,
			order.notes,
		);
		await orderQueries.admin.updateOrderStatus(order.id, "shipped", {
			deliveryProvider: "tu-delivery",
		});
```

That fallback can send the wrong zone. The query helper at `packages/api/src/queries/orders.ts:638-651` can persist `deliveryProvider` with status, but not `addressZoneId`.

Admin has four TU send entry points:

- `apps/admin/src/routes/_dash/orders.$id.tsx:187-197,256-262` — Order detail action.
- `apps/admin/src/components/order/order-card.tsx:70-82,340-357` — Order card action.
- `apps/admin/src/components/order/order-form.tsx:75-89,350-360` — edit-form action, which can also discard unsaved edits.
- `apps/admin/src/components/order/orders-list.tsx:119-173,321-348` — batch TU send.

`apps/admin/src/components/order/order-form.tsx:67-69,128-146,197-230` also fetches and edits the zone before dispatch. This is the wrong step for the new rule.

### Existing conventions

- Admin UI uses React, TanStack Query, the local `Dialog`, `Select`, and `Button` parts, and Sonner toasts. Match `apps/admin/src/components/order/pending-transfer-dialog.tsx` for a focused action dialog and `apps/admin/src/components/order/order-form.tsx:197-230` for zone option rendering.
- Storefront checkout uses Solid and TanStack Solid Form. Keep its current local validator and `form.AppField` patterns; only remove the zone field and its fetch dependency.
- Shared inputs use Valibot in `packages/shared/src/schema.ts`.
- API errors shown to staff use Mongolian `TRPCError` messages in `packages/api/src/routers/admin/order.ts:603-648`.
- Commits use Conventional Commits, such as `fix(api): persist order delivery zone`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Root type check | `bun run check-types` | exit 0, no type errors in any workspace |
| Admin type check | `bun run --cwd apps/admin check-types` | exit 0 |
| Storefront type check | `bun run --cwd apps/storev2 check-types` | exit 0 |
| Admin build | `bun run --cwd apps/admin build` | exit 0 |
| Storefront build | `bun run --cwd apps/storev2 build` | exit 0 |
| Lint changed workspaces | `bun run --cwd apps/admin lint && bun run lint` | exit 0; do not run write/fix mode |
| Changed files | `git diff --name-only` | only files listed under Scope, plus `advisor-plans/README.md` if the executor updates status |

There is no repository test command for these apps or routers. Do not add mock-based tests. Use the real browser/API proof in the Test plan with a disposable non-production Order.

## Suggested executor toolkit

- Use `karpathy-guidelines` to keep the API and UI changes local.
- Use `solidjs` for the storefront checkout edit.
- Use `better-accessibility` for the zone dialogs, labels, focus, errors, and pending state.
- Use `agent-browser` for the final storefront and admin browser proof.

## Scope

**In scope — the only source/docs files to modify**

- `packages/shared/src/schema.ts`
- `apps/storev2/src/components/checkout/checkout-form.tsx`
- `packages/api/src/routers/store/order.ts`
- `packages/api/src/routers/admin/order.ts`
- `packages/api/src/queries/orders.ts`
- `apps/admin/src/components/order/delivery-zone-select.tsx` (create if a shared select keeps the two dispatch dialogs small)
- `apps/admin/src/components/order/ship-order-dialog.tsx` (create)
- `apps/admin/src/components/order/order-card.tsx`
- `apps/admin/src/components/order/order-form.tsx`
- `apps/admin/src/components/order/orders-list.tsx`
- `apps/admin/src/routes/_dash/orders.$id.tsx`
- `CONTEXT.md`
- `docs/adr/0005-delivery-zone-resolution-as-shared-workstream.md`
- `docs/adr/0009-storefront-defers-delivery-zone-to-admin-dispatch.md` (create)

**Out of scope — do not touch**

- `apps/agent/**`
- `packages/assistant/**`
- Messenger webhook, Flue, agent prompts, checkout state, tools, simulations, and resolver ranking/eval code
- Delivery fees, delivery estimates, payment steps, QPay, transfer handling, stock, or Order totals
- TU Delivery client payloads or retry/reconciliation logic in `packages/api/src/lib/integrations/delivery/index.ts`
- Database schema or migrations; both zone columns are already nullable
- Automatic address-to-zone inference
- Admin delivery methods other than TU send; batch “mark self shipped” must keep working without a zone

## Git workflow

- Branch: `feat/admin-delivery-zone-at-dispatch`
- Use small conventional commits, for example:
  1. `fix(storefront): remove delivery zone from checkout`
  2. `fix(api): require delivery zone at dispatch`
  3. `feat(admin): choose delivery zone when shipping`
  4. `docs(delivery): record dispatch-time zone ownership`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Make the shared checkout input accept Orders with no zone

In `packages/shared/src/schema.ts`, change only `newOrderSchema.addressZoneId` from required to optional. Keep the same integer/minimum checks when present:

```ts
addressZoneId: v.optional(
	v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
),
```

Do not remove this property. The shared store API also receives the existing Messenger checkout payload, which may still send a confirmed zone.

In `packages/api/src/routers/store/order.ts`:

1. When updating an existing Customer, always update `address` but update `addressZoneId` only when the input supplied one. A storefront Order must not erase a historic Customer zone by writing `undefined`/`NULL`.
2. When inserting a new Customer, allow the omitted zone to remain `NULL`.
3. When inserting an Order, write `input.addressZoneId ?? null`.
4. Keep `getDeliveryAddressZones` and its import unchanged because non-storefront callers still use it.

**Verify**:

```sh
bun run check-types
git grep -n 'addressZoneId: input.addressZoneId' -- packages/api/src/routers/store/order.ts
```

Expected: type check exits 0. The grep may match the conditional Customer patch, but the Order insert must use `?? null`, and no unconditional existing-Customer zone overwrite may remain.

### Step 2: Remove zone UI and zone-network gating from storefront checkout

In `apps/storev2/src/components/checkout/checkout-form.tsx`:

1. Remove `addressZoneId` from `checkoutValidators`.
2. Remove the delivery-zone query, local `DeliveryZone` type, option/error/readiness memos, and no-longer-used `useQuery` import.
3. Remove `addressZoneId` from form defaults and the signed-in Customer sync effect.
4. Remove the full “Хаягийн бүс” field/loading/error/retry block.
5. Remove `!deliveryZonesReady()` from submit-button disabled logic.
6. Keep phone, natural address, notes, delivery fee, delivery estimate, payment transition, and all current error/focus behavior unchanged.
7. Ensure `newOrderType` inference lets `mutation.mutate` send no zone.

**Verify**:

```sh
bun run --cwd apps/storev2 check-types
bun run --cwd apps/storev2 build
git grep -n -E 'addressZoneId|delivery-address-zones|deliveryZonesReady|getDeliveryAddressZones' -- apps/storev2/src/components/checkout/checkout-form.tsx
```

Expected: both commands exit 0 and grep returns no matches.

### Step 3: Make the dispatch API require the selected zone and persist it

In `packages/api/src/routers/admin/order.ts`:

1. Change `shipOrder` input to require both a positive integer `orderId` and a positive integer `addressZoneId`. Use the same finite/integer/minimum form as other shared inputs.
2. Pass `input.addressZoneId` to `createDelivery`; remove `order.addressZoneId ?? 15` with no replacement fallback.
3. After `createDelivery` succeeds, persist `status: "shipped"`, `deliveryProvider: "tu-delivery"`, and that exact `addressZoneId` in the same order-header update.
4. Keep the current “pending only” check and delivery reconciliation behavior.

In `packages/api/src/queries/orders.ts`, extend `orderQueries.admin.updateOrderStatus`'s optional patch with `addressZoneId?: number | null`, and include it in the update only when supplied.

Do not trust a separate prior `patchOrderHeader` call as the send input. The dispatch mutation itself must carry the zone so a stale page or failed autosave cannot send with the wrong value.

**Verify**:

```sh
bun run check-types
git grep -n '\?\? 15' -- packages/api/src/routers/admin/order.ts
git grep -n 'shipOrder.*orderId' -- apps/admin/src packages/assistant/src/admin
```

Expected: type check exits 0, the fallback grep returns no matches, and every dashboard call site will be updated in Steps 4–6 to supply `addressZoneId`. Ignore the admin-assistant instruction text for this task; do not edit it.

### Step 4: Add one accessible single-Order dispatch dialog

Create `apps/admin/src/components/order/ship-order-dialog.tsx`. It should:

- accept controlled `open`/`onOpenChange`, the Order's `id`, `orderNumber`, `address`, and optional saved `addressZoneId`, plus an `onSuccess` callback;
- fetch zones from `trpc.order.getDeliveryAddressZones` only while/open for dispatch, using TanStack Query's existing cache;
- show the natural address above a required labeled zone select;
- prefill a saved zone for legacy/admin-created Orders, but still require the staff member to open the dialog and confirm;
- keep confirm disabled while zones load, after a load error, when the list is empty, when no zone is selected, or while mutation runs;
- show an inline load error and retry action;
- call `trpc.order.shipOrder` with `{ orderId, addressZoneId }`;
- close only on success, call `onSuccess`, and use existing Mongolian toast style;
- preserve focus handling through the existing Radix dialog parts.

If both the single and batch flow need identical select markup, create the small `delivery-zone-select.tsx` named in Scope. Keep it presentational: typed zone options, value, change handler, disabled state, label/error IDs. Do not make it own server state or mutations.

**Verify**: `bun run --cwd apps/admin check-types && bun run --cwd apps/admin lint` → exit 0.

### Step 5: Route single-Order send actions through the dialog and remove early zone choice

Update `apps/admin/src/routes/_dash/orders.$id.tsx` and `apps/admin/src/components/order/order-card.tsx`:

- replace direct `shipOrder({ orderId })` mutations with the controlled `ShipOrderDialog`;
- keep the current visible send buttons, but make them open the dialog;
- on success, invalidate the same detail/list queries and show one success toast, not two;
- on the detail page's Delivery section, display the saved zone name after dispatch when available; fall back to `Бүс #<id>` if the live list no longer contains it.

Update `apps/admin/src/components/order/order-form.tsx`:

- remove its delivery-zone query, field, Customer-zone autofill, and imports;
- remove its direct “Илгээх” mutation/button. It can discard unsaved form edits and duplicates the detail/card dispatch actions;
- keep `addressZoneId` optional in the form's typed values/defaults only if the schema requires that for update payload shape; do not render or auto-set it;
- preserve Order create/edit, address lookup, products, status, payment, and delivery-provider behavior.

**Verify**:

```sh
bun run --cwd apps/admin check-types
bun run --cwd apps/admin build
git grep -n 'shipOrder.*{ orderId' -- apps/admin/src/routes/_dash/orders.$id.tsx apps/admin/src/components/order/order-card.tsx apps/admin/src/components/order/order-form.tsx
```

Expected: checks exit 0. Grep returns no direct send call in these files; the dialog owns the mutation and sends the selected zone.

### Step 6: Preserve batch TU send by collecting one zone per selected Order

Update `apps/admin/src/components/order/orders-list.tsx` rather than deleting batch send:

1. The toolbar's TU action opens a dialog instead of sending at once.
2. The dialog lists each selected pending Order with Order number, natural address, and required zone select.
3. Seed each row from its saved `addressZoneId` when present; leave new storefront Orders blank.
4. Disable batch confirmation until every selected Order has a zone and the zone query is ready.
5. Pass each row's explicit `{ orderId, addressZoneId }` to the existing sequential retry loop.
6. Keep the current partial-failure report. A failed row must stay pending; successful rows must store their own chosen zone and become shipped.
7. Keep the separate batch “Өөрөөр хүргэсэн” action unchanged; it must not ask for a TU zone.
8. Clear zone draft state when selection clears, page/filter changes, or the dialog closes after success. Do not carry a selected zone to another Order.

Do not apply one zone to all selected Orders.

**Verify**: `bun run --cwd apps/admin check-types && bun run --cwd apps/admin build` → exit 0.

### Step 7: Record the new ownership boundary without changing Messenger code

Create `docs/adr/0009-storefront-defers-delivery-zone-to-admin-dispatch.md` with this decision:

- storefront Customers provide natural address only;
- storefront Orders store `addressZoneId = NULL` until dispatch;
- the admin must choose a TU zone in the send action;
- the dispatch mutation carries and persists the chosen zone and has no numeric fallback;
- existing Messenger checkout behavior is not part of this change;
- a future proven resolver may prefill or suggest a zone, but dispatch still needs an explicit confirmed value unless a later ADR changes that rule.

Add a short note to `docs/adr/0005-delivery-zone-resolution-as-shared-workstream.md` that ADR 0009 replaces its storefront rollout rule but not its Messenger/resolver work. Update only the Delivery zone paragraph in `CONTEXT.md` to distinguish storefront/admin behavior from Messenger behavior.

**Verify**:

```sh
git grep -n '0009\|admin.*zone\|dispatch' -- CONTEXT.md docs/adr/0005-delivery-zone-resolution-as-shared-workstream.md docs/adr/0009-storefront-defers-delivery-zone-to-admin-dispatch.md
```

Expected: all three docs state the same ownership rule and no source file under `apps/agent` or `packages/assistant` changed.

### Step 8: Run final static and real-system proof

Run all static gates:

```sh
bun run check-types
bun run --cwd apps/admin build
bun run --cwd apps/storev2 build
bun run --cwd apps/admin lint
bun run lint
git diff --check
git diff --name-only
```

Expected: all commands exit 0; changed files stay within Scope.

Then run the browser/API checks in the Test plan against local or staging with disposable data. Do not dispatch a real Customer Order.

## Test plan

No mock tests. Use `agent-browser` against a local or staging Storefront/Admin and inspect the saved Order through the admin/API/database tool already used by the operator.

### Storefront cases

1. **Guest checkout**: add one item, open checkout, and confirm only phone, address, and optional notes appear. No zone label, select, loading text, or zone error appears.
2. **Returning Customer**: load a Customer who has a historic `addressZoneId`; confirm checkout still does not show or submit it.
3. **Zone endpoint unavailable**: block/fail `order.getDeliveryAddressZones`; checkout must remain usable because storefront sends no request to it.
4. **Create Order**: place a disposable Order. Confirm payment step appears and the Order row has `address_zone_id = NULL`.
5. **Messenger contract guard**: run `bun run check-types`. Existing agent payloads that include `addressZoneId` must still typecheck; do not run or alter Messenger flows.

### Admin single-send cases

1. Open the new pending Order. Click TU send. Confirm the dialog shows the exact natural address and no default zone.
2. Confirm Send stays disabled until a zone is selected.
3. Close and reopen without sending. Confirm no Order/header change occurred.
4. Select a known disposable/staging zone and send. Confirm the TU request receives that exact ID, the Order saves that ID, and status becomes `shipped` only after delivery creation succeeds.
5. Force a TU creation error. Confirm the Order stays `pending`, the dialog remains useful, and no false success toast appears.
6. Use a legacy Order with a saved zone. Confirm the dialog prefills it but still requires an explicit Send click.

### Admin batch cases

1. Select two pending Orders with different addresses. Confirm each row requires its own zone.
2. Choose two different zones and send. Confirm each remote request and saved Order uses its row's zone.
3. Leave one row blank. Confirm the batch action stays disabled.
4. Force one of two sends to fail. Confirm the successful Order is shipped with its zone, the failed Order stays pending, and the existing partial-failure report names it.
5. Run “Өөрөөр хүргэсэн” on disposable pending Orders. Confirm it still works without a TU zone.

### Cleanup

Cancel/delete all disposable Orders through the normal non-production admin path and remove any test delivery through the provider's safe staging cleanup process. Never use production Customer data.

## Done criteria

- [ ] Storefront checkout contains no delivery-zone field, zone query, zone error, saved-zone fill, or zone-based submit gate.
- [ ] `newOrderSchema` accepts an omitted zone but still validates a supplied one.
- [ ] Storefront-created Orders save `addressZoneId = NULL`; a supplied existing non-storefront zone still persists.
- [ ] Existing Customers do not lose a historic zone when storefront checkout updates their address.
- [ ] `shipOrder` requires an explicit valid `addressZoneId`; no hard-coded zone or stored-zone fallback remains.
- [ ] Successful TU dispatch saves the exact selected zone with shipped status/provider.
- [ ] Detail and card sends use the zone dialog; edit form has no zone/send controls.
- [ ] Batch TU send collects one zone per Order and keeps partial-failure behavior.
- [ ] Batch self-shipped behavior remains unchanged and needs no TU zone.
- [ ] No database migration exists for this change.
- [ ] No file under `apps/agent/**` or `packages/assistant/**` changed.
- [ ] Root/admin/storefront type checks and admin/storefront builds exit 0.
- [ ] Browser/API proof passes with disposable non-production Orders.
- [ ] `git diff --name-only` contains only in-scope files and plan status files.

## STOP conditions

Stop and report back if:

- The database columns `ecom_vit_order.address_zone_id` or `ecom_vit_customer.address_zone_id` are no longer nullable.
- A storefront total, delivery fee, payment, stock, or Messenger behavior must change to omit the zone.
- The TU API requires a zone before Order creation rather than only at delivery creation.
- The admin Order list result no longer includes `addressZoneId`, so batch rows cannot seed existing values without widening API query scope.
- The batch UI cannot bind one distinct zone per selected Order without replacing the current batch model; do not fall back to one zone for all Orders.
- The current delivery reconciliation path requires the old hard-coded zone to identify an existing remote delivery.
- Any verification fails twice after one reasonable correction.
- Work requires changes outside Scope.

## Maintenance notes

- Treat `OrdersTable.addressZoneId` as the delivery record's final zone. A Customer's historic zone may help future suggestions but must not silently choose a new Order's dispatch zone.
- Review every TU send call for `{ orderId, addressZoneId }`; the API should reject callers that omit the zone.
- If a future resolver ships, use it to prefill or rank choices in the admin dialog first. Do not restore Customer-facing manual zone selection.
- Keep zone-list failure separate from checkout availability: only admin TU dispatch should depend on that remote list.
