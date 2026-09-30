// End-to-end payment-surface simulation — the #25 live proof.
//
// What is REAL here (production code, unmodified):
//   - the whole `@vit/assistant` payment domain: the QPay url builder, the
//     payment-choice buttons, the bank-transfer message, the claim ack copy,
//     the postback payload codecs, and the "хийсэн" text matcher,
//   - the REAL `place_order` checkout tool (it attaches the payment context and
//     fires `sendPaymentChoices` after the order is created),
//   - the REAL deterministic webhook handlers `handleChooseTransfer` /
//     `handleTransferClaim` (the no-model post-order path),
//   - the REAL `src/lib/payment.ts` transport — `fetchPaymentSummary`
//     (tRPC GET) and `claimTransfer` (tRPC POST) — incl. SuperJSON + valibot.
//
// What is SIMULATED: the upstream store API/DB is not running, so a tiny stub
// tRPC server on :3000 stands in for `payment.getPaymentByNumber` and
// `payment.claimTransferPaid`. The stub also exposes the payment-CONFIRMATION
// procedures and FAILS THE PROOF if the agent ever calls one — that is the
// ADR-0004 invariant: a transfer claim never confirms payment.
//
// Usage: bun cli/payment-proof.ts
import {
	addToCart,
	buildCheckoutTools,
	buildPaymentChoice,
	buildQpayPageUrl,
	type Cart,
	type CheckoutState,
	type CheckoutToolDeps,
	type CreatedOrder,
	chooseTransferPayload,
	claimTransferPayload,
	confirmCart,
	EMPTY_CART,
	isTransferDoneText,
	type PaymentRef,
	parseChooseTransferPayload,
	parseClaimTransferPayload,
	rankZoneCandidates,
	TRANSFER_CLAIM_ACK_MESSAGE,
} from "@vit/assistant";
import { bankTransfer } from "@vit/shared/constants";
import { trpcResponseBody } from "./trpc-stub";
import {
	handleChooseTransfer,
	handleTransferClaim,
	type PaymentHandlerDeps,
} from "../src/channels/payment-handler";
import { claimTransfer, fetchPaymentSummary } from "../src/lib/payment";

const STORE_PORT = 3000;
const STORE_BASE = `http://127.0.0.1:${STORE_PORT}`;
process.env.STORE_API_URL = STORE_BASE;
// Storefront origin for the QPay-only page link (shares the store origin here).
process.env.STORE_PUBLIC_URL = STORE_BASE;

// ── Simulated order/payment record the stub serves ───────────────────────────
let paymentStatus: "pending" | "customer_claimed_paid" | "success" = "pending";
const PAYMENT = {
	checkoutToken: "ct_test_9f3ab21c",
	customerPhone: "99112233",
	orderNumber: "ORD-5521",
	paymentNumber: "PMT-7K2QX",
	get status() {
		return paymentStatus;
	},
	set status(value: "pending" | "customer_claimed_paid" | "success") {
		paymentStatus = value;
	},
	total: 145_800,
};

// Records of which store procedures the agent hit, so the proof can assert the
// claim path called the CLAIM api and NEVER a confirmation api.
const calls = {
	claimTransferPaid: 0,
	getPaymentByNumber: 0,
	// Any of these being > 0 is an ADR-0004 violation.
	checkQpayInvoice: 0,
	confirmPayment: 0,
	confirmPaymentAndApplyStock: 0,
};

// ── Stub store API (stands in for the real tRPC store router) ────────────────
const storeApi = Bun.serve({
	async fetch(req) {
		const url = new URL(req.url);
		const path = url.pathname;

		if (path.endsWith("/payment.getPaymentByNumber")) {
			calls.getPaymentByNumber += 1;
			return trpcResponseBody({
				createdAt: "2026-06-25T00:00:00.000Z",
				order: {
					address: "Баянзүрх дүүрэг",
					createdAt: "2026-06-25T00:00:00.000Z",
					customerPhone: PAYMENT.customerPhone,
					notes: "",
					orderNumber: PAYMENT.orderNumber,
					products: [],
					status: "pending",
				},
				paymentNumber: PAYMENT.paymentNumber,
				provider: "transfer",
				status: PAYMENT.status,
				total: PAYMENT.total,
			});
		}

		if (path.endsWith("/payment.claimTransferPaid")) {
			calls.claimTransferPaid += 1;
			// The claim records customer_claimed_paid — NOT success. Stock untouched.
			if (PAYMENT.status === "pending") {
				PAYMENT.status = "customer_claimed_paid";
			}
			return trpcResponseBody({ orderNumber: PAYMENT.orderNumber });
		}

		// Confirmation procedures — the agent must NEVER reach these on a claim.
		if (path.endsWith("/payment.confirmPayment")) {
			calls.confirmPayment += 1;
			PAYMENT.status = "success";
			return trpcResponseBody({ ok: true });
		}
		if (path.endsWith("/payment.confirmPaymentAndApplyStock")) {
			calls.confirmPaymentAndApplyStock += 1;
			PAYMENT.status = "success";
			return trpcResponseBody({ ok: true });
		}
		if (path.endsWith("/payment.checkQpayInvoice")) {
			calls.checkQpayInvoice += 1;
			return trpcResponseBody({ paid: false });
		}

		return new Response("not found", { status: 404 });
	},
	hostname: "127.0.0.1",
	port: STORE_PORT,
});

const hr = () => console.log("─".repeat(68));
let failures = 0;
const check = (label: string, ok: boolean): void => {
	console.log(`  ${ok ? "✓" : "✗ FAIL"} ${label}`);
	if (!ok) {
		failures += 1;
	}
};

// ── Build deterministic webhook deps (REAL handlers, captured sends) ─────────
interface Captured {
	bank: Array<{ buttonPayload: string; text: string }>;
	texts: Array<string>;
	transferStatus: string | undefined;
}

const makePaymentDeps = (cap: Captured): PaymentHandlerDeps => ({
	claimTransfer: (ref) => claimTransfer(ref.paymentNumber, ref.checkoutToken),
	fetchPaymentSummary: async (ref) => {
		const summary = await fetchPaymentSummary(ref.paymentNumber, ref.checkoutToken);
		return { amount: summary.total, reference: summary.order.customerPhone };
	},
	sendBankDetails: async (text, paymentRef) => {
		cap.bank.push({ buttonPayload: claimTransferPayload(paymentRef), text });
		return { messageId: null, ok: true };
	},
	sendText: async (text) => {
		cap.texts.push(text);
		return { messageId: null, ok: true };
	},
	setTransferStatus: async (status) => {
		cap.transferStatus = status;
	},
});

// ── PATH 1: order created → QPay choice ──────────────────────────────────────
async function drivePlaceOrder(): Promise<{
	checkout: CheckoutState | undefined;
	choiceOrder: CreatedOrder | undefined;
}> {
	let checkout: CheckoutState | undefined;
	let choiceOrder: CreatedOrder | undefined;
	const cart: Cart = confirmCart(
		addToCart({ ...EMPTY_CART }, { id: 101, name: "Magnesium", price: 69_900 }, 2),
	);
	const ZONES = [{ zoneId: 11, zoneName: "Баянзүрх дүүрэг" }];
	const deps: CheckoutToolDeps = {
		createOrder: async (): Promise<CreatedOrder> => ({
			checkoutToken: PAYMENT.checkoutToken,
			orderNumber: PAYMENT.orderNumber,
			paymentNumber: PAYMENT.paymentNumber,
		}),
		getCart: async () => cart,
		getCheckout: async () => checkout,
		resolveZoneCandidates: async (a) => rankZoneCandidates(a, ZONES),
		saveCheckout: async (s) => {
			checkout = s;
			return s;
		},
		sendPaymentChoices: async (order) => {
			choiceOrder = order;
			return { messageId: null, ok: true };
		},
		sendText: async () => ({ messageId: null, ok: true }),
	};
	type CheckoutTool = ReturnType<typeof buildCheckoutTools>[number];
	const tools = new Map<string, CheckoutTool>(buildCheckoutTools(deps).map((t) => [t.name, t]));
	const run = async (name: string, input: Record<string, string | number> = {}) => {
		const tool = tools.get(name);
		if (!tool) {
			throw new Error(`no such tool: ${name}`);
		}
		return tool.run({ input });
	};
	await run("begin_checkout");
	await run("provide_phone", { phone: PAYMENT.customerPhone });
	await run("provide_address", { address: "Баянзүрх дүүрэг, 26-р хороо" });
	await run("confirm_delivery_zone", { zoneId: 11 });
	await run("provide_notes", { notes: "" });
	await run("place_order");
	return { checkout, choiceOrder };
}

function assertQpayPaymentChoice(ref: PaymentRef, checkout: CheckoutState | undefined) {
	const choice = buildPaymentChoice(STORE_BASE, ref);
	const qpayBtn = choice.buttons.find((b) => b.type === "web_url");
	const transferBtn = choice.buttons.find((b) => b.type === "postback");
	const expectedUrl = `${STORE_BASE}/payment/qpay/${PAYMENT.paymentNumber}?ct=${PAYMENT.checkoutToken}`;

	console.log(`\n  bot → "${choice.text}"`);
	console.log(`  [button] ${qpayBtn?.title} → ${qpayBtn?.url}`);
	console.log(`  [button] ${transferBtn?.title} → postback ${transferBtn?.payload}\n`);

	check("two payment-choice buttons offered", choice.buttons.length === 2);
	check(`QPay button title is "QPay-р төлөх"`, qpayBtn?.title === "QPay-р төлөх");
	check(
		"QPay url = qpay-only page + payment number + checkout token",
		qpayBtn?.url === expectedUrl,
	);
	check("QPay url matches buildQpayPageUrl", qpayBtn?.url === buildQpayPageUrl(STORE_BASE, ref));
	check(`transfer button title is "Дансаар шилжүүлэх"`, transferBtn?.title === "Дансаар шилжүүлэх");
	check(
		"transfer postback round-trips to the payment ref",
		parseChooseTransferPayload(transferBtn?.payload ?? "")?.paymentNumber === PAYMENT.paymentNumber,
	);
}

async function pathQpay(): Promise<PaymentRef> {
	hr();
	console.log("PATH 1 — order created → QPay payment choice\n");

	const { checkout, choiceOrder } = await drivePlaceOrder();
	check("place_order fired sendPaymentChoices", choiceOrder !== undefined);
	check(
		"payment context persisted on checkout (status 'offered')",
		checkout?.payment?.transferStatus === "offered" &&
			checkout?.payment?.paymentNumber === PAYMENT.paymentNumber,
	);

	const ref: PaymentRef = {
		checkoutToken: PAYMENT.checkoutToken,
		paymentNumber: PAYMENT.paymentNumber,
	};
	assertQpayPaymentChoice(ref, checkout);
	return ref;
}

// ── PATH 2: transfer → bank details → claim (pending, never confirmed) ───────
async function pathTransfer(ref: PaymentRef): Promise<void> {
	hr();
	console.log("PATH 2 — bank transfer → details → claim (NEVER confirmed)\n");

	// (a) Customer taps `Дансаар шилжүүлэх`. The webhook decodes the postback and
	// runs the REAL choose-transfer handler (which calls the REAL store boundary).
	const chosen = parseChooseTransferPayload(chooseTransferPayload(ref));
	if (!chosen) {
		throw new Error("choose-transfer payload did not parse");
	}
	check("Дансаар шилжүүлэх postback decoded", chosen.paymentNumber === ref.paymentNumber);

	const cap: Captured = { bank: [], texts: [], transferStatus: undefined };
	const deps = makePaymentDeps(cap);
	await handleChooseTransfer(chosen, deps);

	const bank = cap.bank[0];
	console.log("  bot → bank transfer details:");
	console.log(
		bank.text
			.split("\n")
			.map((l) => `      ${l}`)
			.join("\n"),
	);
	console.log(`  [button] Шилжүүлсэн → postback ${bank.buttonPayload}\n`);

	check("bank message shows the account number", bank.text.includes(bankTransfer.accountNumber));
	check("bank message shows the bank name", bank.text.includes(bankTransfer.bankName));
	check("bank message shows the account name", bank.text.includes(bankTransfer.accountName));
	check("bank message shows the amount", bank.text.includes(PAYMENT.total.toLocaleString("en-US")));
	check("bank message shows the reference (phone)", bank.text.includes(PAYMENT.customerPhone));
	check(
		"Шилжүүлсэн button carries a claim postback",
		bank.buttonPayload.startsWith("transfer_done:"),
	);
	check("transfer status moved to 'transfer_pending'", cap.transferStatus === "transfer_pending");
	check("payment is still pending after viewing details", PAYMENT.status === "pending");
	check(
		"NO payment-confirmation api called yet",
		calls.confirmPayment === 0 && calls.confirmPaymentAndApplyStock === 0,
	);

	// (b) Three equivalent claim triggers — button, "хийсэн" text, screenshot —
	// each must record a CLAIM only and never confirm.
	for (const trigger of ["button:Шилжүүлсэн", 'text:"хийсэн"', "image:screenshot"]) {
		console.log(`  ── claim via ${trigger} ──`);
		const c: Captured = { bank: [], texts: [], transferStatus: undefined };
		const d = makePaymentDeps(c);

		if (trigger.startsWith("text")) {
			check('"хийсэн" recognised as a transfer claim', isTransferDoneText("хийсэн"));
			check('"hiisen" recognised as a transfer claim', isTransferDoneText("hiisen"));
		}
		const claimRef = parseClaimTransferPayload(claimTransferPayload(ref)) ?? ref;
		await handleTransferClaim(claimRef, d);

		console.log(`  bot → "${c.texts[0]}"\n`);
		check("claim acknowledged to the customer", c.texts[0] === TRANSFER_CLAIM_ACK_MESSAGE);
		check("ack explains admin/bank confirmation is pending", /админ|банк/.test(c.texts[0] ?? ""));
		check("transfer status moved to 'transfer_claimed'", c.transferStatus === "transfer_claimed");
	}

	hr();
	console.log("ADR-0004 INVARIANTS (the whole point of #25)\n");
	check("claim api WAS called (payment.claimTransferPaid)", calls.claimTransferPaid >= 1);
	check("payment.confirmPayment NEVER called", calls.confirmPayment === 0);
	check(
		"payment.confirmPaymentAndApplyStock NEVER called",
		calls.confirmPaymentAndApplyStock === 0,
	);
	check("payment.checkQpayInvoice NEVER called", calls.checkQpayInvoice === 0);
	check(
		"payment status is 'customer_claimed_paid' (a claim, NOT success)",
		PAYMENT.status === "customer_claimed_paid",
	);
	check("payment status is NOT 'success'", PAYMENT.status !== "success");
}

async function main(): Promise<void> {
	console.log("\n#25 PAYMENT SURFACE PROOF — QPay + bank transfer after an order\n");
	const ref = await pathQpay();
	await pathTransfer(ref);
	hr();
	if (failures === 0) {
		console.log("✅ ALL CHECKS PASSED — both payment paths verified.\n");
	} else {
		console.log(`❌ ${failures} CHECK(S) FAILED.\n`);
	}
	await storeApi.stop(true);
	process.exit(failures === 0 ? 0 : 1);
}

await main();
