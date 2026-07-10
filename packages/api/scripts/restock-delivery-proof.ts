import { strict as assert } from "node:assert";

const root = new URL("..", import.meta.url);
const dispatch = await Bun.file(
	new URL("src/lib/restock/dispatch.ts", root),
).text();
const subscribe = await Bun.file(
	new URL("src/lib/restock/subscribe.ts", root),
).text();
const migration = await Bun.file(
	new URL("src/db/migrations/0018_restock_delivery_outbox.sql", root),
).text();
const consentMigration = await Bun.file(
	new URL("src/db/migrations/0019_restock_consent.sql", root),
).text();
const productRouter = await Bun.file(
	new URL("src/routers/admin/product.ts", root),
).text();
const orderRouter = await Bun.file(
	new URL("src/routers/admin/order.ts", root),
).text();
const purchaseRouter = await Bun.file(
	new URL("src/routers/admin/purchase.ts", root),
).text();
const purchaseQueries = await Bun.file(
	new URL("src/queries/purchases.ts", root),
).text();
const storeProductRouter = await Bun.file(
	new URL("src/routers/store/product.ts", root),
).text();
const storefrontSheet = await Bun.file(
	new URL(
		"../../apps/storev2/src/components/product/restock-notify-sheet.tsx",
		root,
	),
).text();
const trpc = await Bun.file(new URL("src/lib/trpc.ts", root)).text();

assert.match(subscribe, /pg_advisory_xact_lock\(hashtextextended/);
assert.match(subscribe, /contactsToLock.*\.sort/s);
assert.match(
	dispatch,
	/eq\(RestockSubscriptionsTable\.claimToken, input\.claimToken\)/,
);
assert.match(dispatch, /deliveryState: "sending"/);
assert.match(dispatch, /leaseExpiresAt/);
assert.match(dispatch, /MAX_DELIVERY_ATTEMPTS = 5/);
assert.match(dispatch, /nextAttemptAt: retryAt/);
assert.match(dispatch, /DELIVERY_BATCH_SIZE = 3/);
assert.match(dispatch, /PROVIDER_TIMEOUT_MS = 8_000/);
assert.match(dispatch, /\.limit\(DELIVERY_BATCH_SIZE\)/);
assert.match(dispatch, /deliveryState: "unknown"[\s\S]+channel, "sms"/);
assert.match(dispatch, /deliveryState: "pending"[\s\S]+channel, "email"/);
assert.match(dispatch, /contact: null/);
assert.match(dispatch, /deliveryKey: claimed\.deliveryKey/);
assert.doesNotMatch(dispatch, /^.*log\.(?:info|error).*contact.*$/m);
assert.match(
	subscribe,
	/countDistinct\(RestockSubscriptionsTable\.productId\)/,
);
assert.match(subscribe, /consentState: "verified"/);
assert.match(
	storeProductRouter,
	/subscribeToRestock: verifiedCustomerProcedure/,
);
assert.match(productRouter, /scheduleRestockDispatch\(ctx, stockChange\)/);
assert.match(
	purchaseQueries,
	/applyStockTransition\(tx, \{ productId, delta \}\)/,
);
assert.match(
	purchaseRouter,
	/scheduleRestockDispatches\(ctx, restockCandidates\)/,
);
assert.match(
	orderRouter,
	/scheduleRestockDispatches\(ctx, restockCandidates\)/,
);
assert.doesNotMatch(storefrontSheet, /localStorage|error\.message|login-phone/);
assert.match(storefrontSheet, /case "UNAUTHORIZED"/);
assert.match(trpc, /path === "product\.subscribeToRestock"/);
assert.match(trpc, /contact_count: input\.contacts\.length/);
assert.match(migration, /ALTER COLUMN "contact" DROP NOT NULL/);
assert.match(migration, /"delivery_state"/);
assert.match(consentMigration, /"consent_state"/);
assert.match(consentMigration, /legacy subscription cancelled/);

const stockWrites: string[] = [];
for await (const path of new Bun.Glob("src/**/*.ts").scan({
	cwd: new URL(".", root).pathname,
})) {
	const source = await Bun.file(new URL(path, root)).text();
	if (/\.set\(\{\s*stock:/s.test(source)) stockWrites.push(path);
}
assert.deepEqual(stockWrites, ["src/lib/stock/transition.ts"]);

console.log("restock delivery proof: pass");
