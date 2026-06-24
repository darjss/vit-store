// End-to-end checkout simulation — the #23 live proof.
//
// What is REAL here (production code, unmodified):
//   - the whole `@vit/assistant` checkout state machine: phone validation,
//     phase transitions, zone-candidate confirmation, notes, summary, and the
//     order-payload builder (which sends ONLY line quantities, never a total),
//   - the real `rankZoneCandidates` best-effort delivery-zone ranker,
//   - the real `src/lib/order.ts` transport boundary — `fetchDeliveryZones`
//     (tRPC GET) and `createOrder` (tRPC POST mutation) — including the real
//     SuperJSON serialize/deserialize and valibot response validation.
//
// What is SIMULATED (and why): the upstream store API/DB is not running here,
// so a tiny stub tRPC server on :3000 stands in for `order.getDeliveryAddressZones`
// and `order.addOrder`. The worker/agent in production calls the SAME
// `createOrder`/`fetchDeliveryZones` against the real store API — only this CLI
// points them at the stub. The stub mimics the real API contract: addOrder
// computes the total itself (products + the 6,000 MNT delivery fee) and returns
// an order number, payment number, and checkout token.
//
// Usage: bun scripts/checkout-sim.ts
import {
	addToCart,
	applyAddress,
	applyNotes,
	applyPhone,
	applyZoneSelection,
	buildCheckoutOrderPayload,
	type Cart,
	canBeginCheckout,
	confirmCart,
	EMPTY_CART,
	formatOrderCreated,
	formatOrderSummary,
	formatZoneCandidates,
	initialCheckoutState,
	rankZoneCandidates,
	setZoneCandidates,
	validatePhone,
} from "@vit/assistant";
import { deliveryFee } from "@vit/shared/constants";
import { SuperJSON } from "superjson";
import { createOrder, fetchDeliveryZones } from "../src/lib/order";

const STORE_PORT = 3000;
process.env.STORE_API_URL = `http://127.0.0.1:${STORE_PORT}`;

// ── Simulated store catalog (for the stub's total math only) ─────────────────
const CATALOG: Record<number, { name: string; price: number }> = {
	101: { name: "Magnesium Glycinate 400mg", price: 54900 },
	202: { name: "Omega-3 1000mg", price: 39900 },
};

// ── Simulated live delivery zones (real ranker consumes these) ───────────────
const ZONES = [
	{ Id: 11, zoneName: "Баянзүрх дүүрэг" },
	{ Id: 12, zoneName: "Сүхбаатар дүүрэг" },
	{ Id: 13, zoneName: "Чингэлтэй дүүрэг" },
	{ Id: 14, zoneName: "Хан-Уул дүүрэг" },
];

// Deterministic-ish id generator for the stub (the real API uses nanoid). A
// module-level counter keeps successive ids distinct within the same ms.
let rndSeed = Date.now() % 1_000_000;
const rnd = (len: number): string => {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let out = "";
	for (let i = 0; i < len; i++) {
		rndSeed = (rndSeed * 1103515245 + 12345) & 0x7fffffff;
		out += alphabet[rndSeed % alphabet.length];
	}
	return out;
};

// ── Stub store API (stands in for the real tRPC store router) ────────────────
const storeApi = Bun.serve({
	port: STORE_PORT,
	hostname: "127.0.0.1",
	async fetch(req) {
		const url = new URL(req.url);
		const trpcBody = (data: unknown) =>
			new Response(
				JSON.stringify({ result: { data: SuperJSON.serialize(data) } }),
				{ headers: { "content-type": "application/json" } },
			);

		if (url.pathname.endsWith("/order.getDeliveryAddressZones")) {
			return trpcBody(ZONES);
		}

		if (url.pathname.endsWith("/order.addOrder")) {
			const raw = (await req.json()) as Parameters<
				typeof SuperJSON.deserialize
			>[0];
			const input = SuperJSON.deserialize(raw) as {
				products: { productId: number; quantity: number }[];
			};
			// Mirror the real API: it totals itself (products + delivery fee). The
			// CLI never sends a total; the stub computes it exactly as addOrder does.
			const productsTotal = input.products.reduce(
				(acc, p) => acc + (CATALOG[p.productId]?.price ?? 0) * p.quantity,
				0,
			);
			const total = productsTotal + deliveryFee;
			console.log(
				`\n[stub store API] order.addOrder computed total = ${total.toLocaleString("en-US")}₮ (products ${productsTotal.toLocaleString("en-US")}₮ + delivery ${deliveryFee.toLocaleString("en-US")}₮)`,
			);
			return trpcBody({
				orderNumber: rnd(8),
				paymentNumber: rnd(10),
				checkoutToken: `ct_${rnd(24)}`,
			});
		}

		return new Response("not found", { status: 404 });
	},
});

const hr = () => console.log("─".repeat(64));

async function main(): Promise<void> {
	console.log("CHECKOUT SIMULATION (issue #23)\n");
	console.log(
		"REAL: @vit/assistant checkout domain + ranker + src/lib/order.ts transport.",
	);
	console.log(
		"STUBBED: upstream store API/DB (order.addOrder + getDeliveryAddressZones).\n",
	);

	// 1) A confirmed cart (the #21 checkout gate), built with the real reducers.
	let cart: Cart = { ...EMPTY_CART };
	cart = addToCart(cart, { id: 101, ...CATALOG[101] }, 2);
	cart = addToCart(cart, { id: 202, ...CATALOG[202] }, 1);
	cart = confirmCart(cart);
	hr();
	console.log("STEP 0 — confirmed cart:");
	console.log(JSON.stringify(cart, null, 2));

	const begin = canBeginCheckout(cart);
	console.log(`\nbegin_checkout guard → ${begin.ok ? "OK" : begin.error}`);
	if (!begin.ok) throw new Error("cart should be confirmed");

	let state = initialCheckoutState();
	console.log(`phase: ${state.phase}`);

	// 2) Phone — invalid first (validation only fires at checkout), then valid.
	hr();
	const bad = validatePhone("123");
	console.log(
		`STEP 1a — provide_phone "123" → ${bad.ok ? "ok" : `REJECTED: ${bad.error}`}`,
	);

	const phoneStep = applyPhone(state, "9911-2233");
	if (!phoneStep.ok) throw new Error(phoneStep.error);
	state = phoneStep.state;
	console.log(
		`STEP 1b — provide_phone "9911-2233" → accepted as ${state.phone} (phase: ${state.phase})`,
	);

	// 3) Natural address text.
	hr();
	const addressText =
		"Баянзүрх дүүрэг, 26-р хороо, 120 мянгат, 45-р байр, 12 тоот";
	const addrStep = applyAddress(state, addressText);
	if (!addrStep.ok) throw new Error(addrStep.error);
	state = addrStep.state;
	console.log(
		`STEP 2 — provide_address → "${state.address}" (phase: ${state.phase})`,
	);

	// 4) Delivery-zone candidates via the REAL boundary + REAL ranker; confirm.
	const zones = await fetchDeliveryZones();
	const candidates = rankZoneCandidates(addressText, zones);
	state = setZoneCandidates(state, candidates);
	hr();
	console.log(
		"STEP 3 — delivery-zone candidates (customer confirms one; never auto-picked):",
	);
	console.log(formatZoneCandidates(candidates));
	console.log("\ncandidate scores/evidence:");
	for (const c of candidates) {
		console.log(
			`  [${c.zoneId}] ${c.zoneName} — score ${c.score.toFixed(2)} — ${c.evidence.join("; ") || "(no signal)"}`,
		);
	}

	const chosen = candidates[0];
	const zoneStep = applyZoneSelection(state, chosen.zoneId);
	if (!zoneStep.ok) throw new Error(zoneStep.error);
	state = zoneStep.state;
	console.log(
		`\ncustomer confirms zone [${chosen.zoneId}] ${chosen.zoneName} (phase: ${state.phase})`,
	);

	// 5) Optional notes.
	hr();
	state = applyNotes(state, "Үдээс хойш авна, орц 2");
	console.log(
		`STEP 4 — provide_notes → "${state.notes}" (phase: ${state.phase})`,
	);

	// 6) Final summary before creation.
	hr();
	console.log("STEP 5 — final order summary (shown before creation):\n");
	console.log(formatOrderSummary(state, cart));

	// 7) The exact order payload sent to order.addOrder (NO total — API computes it).
	hr();
	const payload = buildCheckoutOrderPayload(state, cart);
	console.log("STEP 6 — order payload submitted to order.addOrder:\n");
	console.log(JSON.stringify(payload, null, 2));

	// 8) Create the order via the REAL transport against the stub store API.
	const created = await createOrder(payload);
	hr();
	console.log(
		"STEP 7 — order created (response surfaced for payment slices #24/#25):\n",
	);
	console.log(`  orderNumber:   ${created.orderNumber}`);
	console.log(`  paymentNumber: ${created.paymentNumber}`);
	console.log(`  checkoutToken: ${created.checkoutToken}`);
	console.log("\ncustomer-facing confirmation:\n");
	console.log(formatOrderCreated(created.orderNumber, created.paymentNumber));

	if (
		!created.orderNumber ||
		!created.paymentNumber ||
		!created.checkoutToken
	) {
		throw new Error("missing order/payment/checkout identifiers");
	}

	hr();
	console.log(
		"\n✓ SIMULATION PASSED — confirmed cart → phone → address → zone → notes → summary → order created.",
	);
	storeApi.stop();
}

main().catch((error) => {
	storeApi.stop();
	console.error(
		"\n✗ SIMULATION FAILED:",
		error instanceof Error ? error.message : error,
	);
	process.exit(1);
});
