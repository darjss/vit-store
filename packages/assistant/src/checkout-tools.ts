import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import type { Cart } from "./cart";
import {
	applyAddress,
	applyNotes,
	applyPhone,
	applyZoneSelection,
	attachPayment,
	buildCheckoutOrderPayload,
	CHECKOUT_PHONE_PROMPT,
	type CheckoutOrderPayload,
	type CheckoutState,
	canBeginCheckout,
	formatOrderCreated,
	formatOrderSummary,
	formatZoneCandidates,
	initialCheckoutState,
	isReadyToCreate,
	markCreated,
	markCreating,
	setZoneCandidates,
	type ZoneCandidate,
} from "./checkout";

// Conversational checkout tools for the customer assistant. The model drives a
// confirmed cart through phone → address → zone confirmation → notes → final
// summary → order creation by calling these in order, extracting each field
// from the customer's natural-language turn. Each tool sends the next customer-
// facing prompt itself (mirroring the cart tools) and returns structured facts
// so the model knows the phase and what to ask next.
//
// Persistence and the order/zone HTTP boundary are INJECTED (`CheckoutToolDeps`)
// so this stays channel-neutral and unit-testable without a worker: the agent
// app binds these to the per-session CheckoutStore DO (ADR 0006), the live
// `order.getDeliveryAddressZones` ranker, and the `order.addOrder` boundary.

// What `order.addOrder` returns through the agent boundary — the identifiers the
// payment slices (#24/#25) consume.
export interface CreatedOrder {
	orderNumber: string;
	paymentNumber: string | null;
	checkoutToken: string | null;
}

export interface CheckoutToolDeps {
	getCart: () => Promise<Cart>;
	getCheckout: () => Promise<CheckoutState | undefined>;
	saveCheckout: (state: CheckoutState) => Promise<CheckoutState>;
	// Best-effort delivery-zone candidates for an address (live zone list +
	// ranker). The customer confirms one; never auto-picked (ADR 0005).
	resolveZoneCandidates: (addressText: string) => Promise<ZoneCandidate[]>;
	// Calls the EXISTING `order.addOrder` procedure. The agent never computes the
	// total — the API does, and adds the delivery fee.
	createOrder: (payload: CheckoutOrderPayload) => Promise<CreatedOrder>;
	// Sends a plain text reply on the bound channel.
	sendText: (text: string) => Promise<unknown>;
	// Optional post-order hook (#25): once the order exists and has a payment
	// number, offer the QPay/transfer payment choices on the channel. Injected so
	// the channel-neutral tools never build a Messenger button template. Omitted
	// in unit/sim contexts that only exercise order creation.
	sendPaymentChoices?: (order: CreatedOrder) => Promise<unknown>;
}

const facts = (state: CheckoutState) => ({
	phase: state.phase,
	phone: state.phone ?? null,
	address: state.address ?? null,
	selectedZoneId: state.selectedZoneId ?? null,
	selectedZoneName: state.selectedZoneName ?? null,
	notes: state.notes ?? null,
	candidates: state.candidates.map((c) => ({
		zoneId: c.zoneId,
		zoneName: c.zoneName,
	})),
});

const CHECKOUT_NOT_STARTED_MESSAGE =
	"Эхлээд захиалга баталгаажуулъя. Сагсаа баталгаажуулсны дараа утасны дугаараа өгнө үү.";

// Finishes a just-created order: persists the created checkout (recording the
// payment identifiers so the post-order payment surface — #25 — can build the
// QPay link and later recognise a bank-transfer claim), sends the confirmation,
// and offers the QPay/transfer choices. The choice-send is best-effort: the
// order is already durably created, so a failed send must not throw or undo it.
const finalizeCreatedOrder = async (
	deps: CheckoutToolDeps,
	claimed: CheckoutState,
	created: CreatedOrder,
): Promise<CheckoutState> => {
	const done = created.paymentNumber
		? attachPayment(markCreated(claimed), {
				paymentNumber: created.paymentNumber,
				checkoutToken: created.checkoutToken,
			})
		: markCreated(claimed);
	await deps.saveCheckout(done);
	await deps.sendText(
		formatOrderCreated(created.orderNumber, created.paymentNumber),
	);
	if (created.paymentNumber && deps.sendPaymentChoices) {
		try {
			await deps.sendPaymentChoices(created);
		} catch (error) {
			console.warn(
				"[checkout] post-order payment-choice send failed (order is durable):",
				error,
			);
		}
	}
	return done;
};

export const buildCheckoutTools = (deps: CheckoutToolDeps) => {
	// Sends the customer-facing prompt, then reports the new state to the model.
	const advance = async (state: CheckoutState, prompt: string) => {
		const saved = await deps.saveCheckout(state);
		await deps.sendText(prompt);
		return { ok: true, ...facts(saved) };
	};

	// Loads the in-progress checkout, or sends the "start checkout first" nudge
	// and returns undefined when there is none (or it is already created) so the
	// caller can early-return a typed failure.
	const requireCheckout = async (): Promise<CheckoutState | undefined> => {
		const state = await deps.getCheckout();
		if (!state || state.phase === "created") {
			await deps.sendText(CHECKOUT_NOT_STARTED_MESSAGE);
			return undefined;
		}
		return state;
	};

	const notStarted = () => ({
		ok: false as const,
		error: "checkout_not_started",
	});

	const beginCheckout = defineTool({
		name: "begin_checkout",
		description:
			"Start order checkout for the customer's CONFIRMED cart. Call this only after the cart is confirmed and the customer wants to place the order. It asks the customer for their phone number. Phone is collected only here, at checkout — never earlier.",
		input: v.object({}),
		async run() {
			const cart = await deps.getCart();
			const guard = canBeginCheckout(cart);
			if (!guard.ok) {
				await deps.sendText(guard.error);
				return { ok: false, error: guard.error };
			}
			return advance(initialCheckoutState(), CHECKOUT_PHONE_PROMPT);
		},
	});

	const providePhone = defineTool({
		name: "provide_phone",
		description:
			"Record the phone number the customer gave for delivery. Pass exactly what they typed; it is normalized and validated (Mongolian 8-digit, starts 6-9). On an invalid number the customer is asked to re-enter. We ask for phone AND address together, so on success this does NOT re-prompt — immediately call provide_address with the address from the same message. If the customer gave only a phone, ask once for the address yourself.",
		input: v.object({ phone: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			const state = await requireCheckout();
			if (!state) return notStarted();
			const result = applyPhone(state, input.phone);
			if (!result.ok) {
				await deps.sendText(result.error);
				return { ok: false, error: result.error, ...facts(state) };
			}
			// Phone + address are asked together up front, so don't re-prompt for
			// the address here; the model calls provide_address next from the same
			// customer turn (it sends the order summary).
			const saved = await deps.saveCheckout(result.state);
			return { ok: true, ...facts(saved) };
		},
	});

	const provideAddress = defineTool({
		name: "provide_address",
		description:
			"Record the customer's natural-language delivery address (district, khoroo, building/unit, nearby landmark). The delivery zone is resolved and auto-selected, then the short order summary is sent for a single confirm — you do NOT ask the customer to pick a zone, and you do NOT ask for notes. If no zone matches, the customer is asked to give a clearer address.",
		input: v.object({ address: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			const state = await requireCheckout();
			if (!state) return notStarted();
			const result = applyAddress(state, input.address);
			if (!result.ok) {
				await deps.sendText(result.error);
				return { ok: false, error: result.error, ...facts(state) };
			}
			const candidates = await deps.resolveZoneCandidates(
				result.state.address as string,
			);
			const withCandidates = setZoneCandidates(result.state, candidates);
			// Short admin-style flow: auto-select the top-ranked zone rather than
			// making the customer pick one, then jump straight to the summary for a
			// single confirm. The chosen zone is shown in the summary, so the
			// customer can still object before the order is placed.
			if (candidates.length === 0) {
				return advance(withCandidates, formatZoneCandidates(candidates));
			}
			const zoned = applyZoneSelection(withCandidates, candidates[0]!.zoneId);
			if (!zoned.ok) {
				return advance(withCandidates, formatZoneCandidates(candidates));
			}
			const confirming = applyNotes(zoned.state, undefined);
			const saved = await deps.saveCheckout(confirming);
			const cart = await deps.getCart();
			await deps.sendText(formatOrderSummary(saved, cart));
			return { ok: true, ...facts(saved) };
		},
	});

	const confirmDeliveryZone = defineTool({
		name: "confirm_delivery_zone",
		description:
			"Fallback for when a clear zone could not be auto-selected and the customer picked one from the offered list. Pass the zoneId they chose (must be one of the offered candidates). After this the order summary is shown for a single confirm — notes are not asked.",
		input: v.object({
			zoneId: v.pipe(v.number(), v.integer(), v.minValue(1)),
		}),
		async run({ input }) {
			const state = await requireCheckout();
			if (!state) return notStarted();
			const result = applyZoneSelection(state, input.zoneId);
			if (!result.ok) {
				await deps.sendText(result.error);
				return { ok: false, error: result.error, ...facts(state) };
			}
			const confirming = applyNotes(result.state, undefined);
			const saved = await deps.saveCheckout(confirming);
			const cart = await deps.getCart();
			await deps.sendText(formatOrderSummary(saved, cart));
			return { ok: true, ...facts(saved) };
		},
	});

	const provideNotes = defineTool({
		name: "provide_notes",
		description:
			"Record optional order notes, or skip them. Pass the notes text, or leave empty / call with no notes when the customer has none or says to skip. After this the final order summary is shown for the customer to confirm before creation.",
		input: v.object({ notes: v.optional(v.string()) }),
		async run({ input }) {
			const state = await requireCheckout();
			if (!state) return notStarted();
			const next = applyNotes(state, input.notes);
			const saved = await deps.saveCheckout(next);
			const cart = await deps.getCart();
			await deps.sendText(formatOrderSummary(saved, cart));
			return { ok: true, ...facts(saved) };
		},
	});

	const placeOrder = defineTool({
		name: "place_order",
		description:
			"Create the order once the customer has confirmed the final summary (e.g. said yes/тийм). This calls the store order API, which computes the total and adds the delivery fee. Only call after phone, address, and a confirmed zone are collected. Returns the order number, payment number, and checkout token.",
		input: v.object({}),
		async run() {
			const state = await requireCheckout();
			if (!state) return notStarted();
			// Idempotency: a checkout already past `confirming` has claimed the
			// irreversible commit (or finished it). Refuse rather than risk a second
			// order on an in-turn/durable replay — `addOrder` has no idempotency key.
			if (state.phase === "creating") {
				return {
					ok: false as const,
					error: "checkout_already_creating",
					...facts(state),
				};
			}
			// The final summary (provide_notes → `confirming`) must have been shown
			// and confirmed before creation. `isReadyToCreate` is already true at
			// `collecting_notes`, so guard on the phase too; otherwise re-show it.
			if (state.phase !== "confirming") {
				if (!isReadyToCreate(state)) {
					const error =
						"Захиалга үүсгэхэд утас, хаяг, хүргэлтийн бүс бүрэн биш байна.";
					await deps.sendText(error);
					return { ok: false, error, ...facts(state) };
				}
				const cart = await deps.getCart();
				await deps.sendText(formatOrderSummary(state, cart));
				return {
					ok: false as const,
					error: "summary_not_confirmed",
					...facts(state),
				};
			}
			const cart = await deps.getCart();
			// Re-assert the cart is still the confirmed, non-empty cart. A button tap
			// (Захиалах / inc / dec / remove) handled in the webhook, independent of
			// this agent turn, re-opens the cart (`confirmed=false`); creating from
			// that would place an order the customer never confirmed.
			const guard = canBeginCheckout(cart);
			if (!guard.ok) {
				await deps.sendText(guard.error);
				return { ok: false as const, error: guard.error, ...facts(state) };
			}
			const payload = buildCheckoutOrderPayload(state, cart);
			// Claim BEFORE the irreversible commit (see `markCreating`).
			const claimed = markCreating(state);
			await deps.saveCheckout(claimed);
			const created = await deps.createOrder(payload);
			const done = await finalizeCreatedOrder(deps, claimed, created);
			return {
				ok: true,
				orderNumber: created.orderNumber,
				paymentNumber: created.paymentNumber,
				checkoutToken: created.checkoutToken,
				...facts(done),
			};
		},
	});

	return [
		beginCheckout,
		providePhone,
		provideAddress,
		confirmDeliveryZone,
		provideNotes,
		placeOrder,
	];
};
