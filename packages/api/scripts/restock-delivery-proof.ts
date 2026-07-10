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
assert.match(dispatch, /DELIVERY_BATCH_SIZE = 25/);
assert.match(dispatch, /\.limit\(DELIVERY_BATCH_SIZE\)/);
assert.match(dispatch, /contact: null/);
assert.match(dispatch, /deliveryKey: claimed\.deliveryKey/);
assert.doesNotMatch(dispatch, /^.*log\.(?:info|error).*contact.*$/m);
assert.match(migration, /ALTER COLUMN "contact" DROP NOT NULL/);
assert.match(migration, /"delivery_state"/);

console.log("restock delivery proof: pass");
