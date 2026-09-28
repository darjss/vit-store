import { defineTool } from "@flue/runtime";
import type { DeliveryFailure } from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import { match } from "dismatch";
import { matchAsync } from "dismatch/async";
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
	type CheckoutPhase,
	type CheckoutState,
	canBeginCheckout,
	checkoutPhaseSchema,
	formatOrderCreated,
	formatOrderSummary,
	formatZoneCandidates,
	initialCheckoutState,
	markCreated,
	markCreating,
	prepareCheckoutAttempt,
	setZoneCandidates,
	type ZoneCandidate,
} from "./checkout";
import {
	type AiOperationError,
	type AssistantCheckoutError,
	assistantCheckoutErrorMessage,
	assistantCheckoutErrorSchema,
} from "./errors";

export interface CreatedOrder {
	orderNumber: string;
	paymentNumber: string | null;
	checkoutToken: string | null;
}

type OrderCreationFailure = Extract<
	AssistantCheckoutError,
	{ _tag: "OrderCreationFailed" }
>;

type ZoneResolutionFailure = Extract<
	AiOperationError,
	{ _tag: "ProviderUnavailable" }
>;

export interface CheckoutToolDeps {
	getCart: () => Promise<Cart>;
	getCheckout: () => Promise<CheckoutState | undefined>;
	saveCheckout: (state: CheckoutState) => Promise<CheckoutState>;
	resolveZoneCandidates: (
		addressText: string,
	) => Promise<BetterResult<ZoneCandidate[], ZoneResolutionFailure>>;
	createOrder: (
		payload: CheckoutOrderPayload,
	) => Promise<BetterResult<CreatedOrder, OrderCreationFailure>>;
	generateIdempotencyKey?: () => string;
	sendText: (text: string) => Promise<BetterResult<unknown, DeliveryFailure>>;
	sendPaymentChoices?: (
		order: CreatedOrder,
	) => Promise<BetterResult<unknown, DeliveryFailure>>;
}

const checkoutFactsEntries = {
	phase: checkoutPhaseSchema,
	phone: v.nullable(v.string()),
	address: v.nullable(v.string()),
	selectedZoneId: v.nullable(v.number()),
	selectedZoneName: v.nullable(v.string()),
	notes: v.nullable(v.string()),
	candidates: v.array(
		v.strictObject({
			zoneId: v.number(),
			zoneName: v.string(),
		}),
	),
} as const;

export const assistantCheckoutToolOutputSchema = v.variant("ok", [
	v.strictObject({
		ok: v.literal(true),
		...checkoutFactsEntries,
		orderNumber: v.optional(v.string()),
		paymentNumber: v.optional(v.nullable(v.string())),
		checkoutToken: v.optional(v.nullable(v.string())),
	}),
	v.strictObject({
		ok: v.literal(false),
		error: assistantCheckoutErrorSchema,
		phase: v.optional(checkoutPhaseSchema),
		phone: v.optional(v.nullable(v.string())),
		address: v.optional(v.nullable(v.string())),
		selectedZoneId: v.optional(v.nullable(v.number())),
		selectedZoneName: v.optional(v.nullable(v.string())),
		notes: v.optional(v.nullable(v.string())),
		candidates: v.optional(checkoutFactsEntries.candidates),
	}),
]);

const facts = (state: CheckoutState) => ({
	phase: state.phase,
	phone: state.phone ?? null,
	address: state.address ?? null,
	selectedZoneId: state.selectedZoneId ?? null,
	selectedZoneName: state.selectedZoneName ?? null,
	notes: state.notes ?? null,
	candidates: state.candidates.map(({ zoneId, zoneName }) => ({
		zoneId,
		zoneName,
	})),
});

const failure = (error: AssistantCheckoutError, state?: CheckoutState) => ({
	ok: false as const,
	error,
	...(state ? facts(state) : {}),
});

const phaseStates = {
	collecting_phone: { _tag: "collecting_phone" },
	collecting_address: { _tag: "collecting_address" },
	confirming_zone: { _tag: "confirming_zone" },
	collecting_notes: { _tag: "collecting_notes" },
	confirming: { _tag: "confirming" },
	creating: { _tag: "creating" },
	created: { _tag: "created" },
} as const satisfies Record<CheckoutPhase, { _tag: CheckoutPhase }>;

type PlaceOrderDecision =
	| { _tag: "Create" }
	| { _tag: "ValidateReadiness" }
	| { _tag: "NotStarted" };

const decidePlaceOrder = (phase: CheckoutPhase): PlaceOrderDecision =>
	match(
		phaseStates[phase],
		"_tag",
	)<PlaceOrderDecision>({
		collecting_phone: () => ({ _tag: "ValidateReadiness" }),
		collecting_address: () => ({ _tag: "ValidateReadiness" }),
		confirming_zone: () => ({ _tag: "ValidateReadiness" }),
		collecting_notes: () => ({ _tag: "ValidateReadiness" }),
		confirming: () => ({ _tag: "Create" }),
		creating: () => ({ _tag: "Create" }),
		created: () => ({ _tag: "NotStarted" }),
	});

export const buildCheckoutTools = (deps: CheckoutToolDeps) => {
	const deliverBestEffort = async (
		delivery: Promise<BetterResult<unknown, DeliveryFailure>>,
	) => {
		const result = await delivery;
		if (result.status === "error") {
			console.warn("[checkout] delivery failed", {
				error_tag: result.error._tag,
				provider: result.error.provider,
				code: result.error.code,
			});
		}
	};

	const reportFailure = async (
		error: AssistantCheckoutError,
		state?: CheckoutState,
	) => {
		await deliverBestEffort(
			deps.sendText(assistantCheckoutErrorMessage(error)),
		);
		return failure(error, state);
	};

	const advance = async (state: CheckoutState, prompt: string) => {
		const saved = await deps.saveCheckout(state);
		await deliverBestEffort(deps.sendText(prompt));
		return { ok: true as const, ...facts(saved) };
	};

	const prepareAttempt = async (state: CheckoutState, cart: Cart) => {
		const prepared = prepareCheckoutAttempt(
			state,
			cart,
			deps.generateIdempotencyKey ??
				(() => `checkout_${crypto.randomUUID()}`),
		);
		if (prepared.status === "error") return prepared;
		return Result.ok(await deps.saveCheckout(prepared.value));
	};

	const requireCheckout = async () => {
		const state = await deps.getCheckout();
		return state === undefined || state.phase === "created"
			? Result.err<CheckoutState, AssistantCheckoutError>({
					_tag: "CheckoutNotStarted",
				})
			: Result.ok<CheckoutState, AssistantCheckoutError>(state);
	};

	const beginCheckout = defineTool({
		name: "begin_checkout",
		description:
			"Start order checkout for the customer's confirmed cart and ask for their phone number.",
		input: v.object({}),
		output: assistantCheckoutToolOutputSchema,
		async run() {
			const guard = canBeginCheckout(await deps.getCart());
			if (guard.status === "error") return reportFailure(guard.error);
			return advance(initialCheckoutState(), CHECKOUT_PHONE_PROMPT);
		},
	});

	const providePhone = defineTool({
		name: "provide_phone",
		description:
			"Record and validate the customer's Mongolian phone number. If the same message has an address, call provide_address next.",
		input: v.object({ phone: v.pipe(v.string(), v.minLength(1)) }),
		output: assistantCheckoutToolOutputSchema,
		async run({ input }) {
			const required = await requireCheckout();
			if (required.status === "error") return reportFailure(required.error);
			const applied = applyPhone(required.value, input.phone);
			if (applied.status === "error") {
				return reportFailure(applied.error, required.value);
			}
			const saved = await deps.saveCheckout(applied.value);
			return { ok: true as const, ...facts(saved) };
		},
	});

	const provideAddress = defineTool({
		name: "provide_address",
		description:
			"Record the delivery address, resolve a zone, and show the order summary. Ask for a clearer address if no zone matches.",
		input: v.object({ address: v.pipe(v.string(), v.minLength(1)) }),
		output: assistantCheckoutToolOutputSchema,
		async run({ input }) {
			const required = await requireCheckout();
			if (required.status === "error") return reportFailure(required.error);
			const applied = applyAddress(required.value, input.address);
			if (applied.status === "error") {
				return reportFailure(applied.error, required.value);
			}

			const resolved = await deps.resolveZoneCandidates(applied.value.address);
			if (resolved.status === "error") {
				return reportFailure(
					{
						_tag: "OrderCreationFailed",
						retryable: resolved.error.retryable,
						recovery: { _tag: "Retry" },
					},
					applied.value,
				);
			}
			const candidates = resolved.value;
			const withCandidates = setZoneCandidates(applied.value, candidates);
			const first = candidates[0];
			if (first === undefined) {
				return advance(withCandidates, formatZoneCandidates(candidates));
			}
			const selected = applyZoneSelection(withCandidates, first.zoneId);
			if (selected.status === "error") {
				return reportFailure(selected.error, withCandidates);
			}
			const confirming = applyNotes(selected.value, undefined);
			const cart = await deps.getCart();
			const prepared = await prepareAttempt(confirming, cart);
			if (prepared.status === "error") {
				return reportFailure(prepared.error, confirming);
			}
			await deliverBestEffort(
				deps.sendText(formatOrderSummary(prepared.value, cart)),
			);
			return { ok: true as const, ...facts(prepared.value) };
		},
	});

	const confirmDeliveryZone = defineTool({
		name: "confirm_delivery_zone",
		description:
			"Select one offered delivery zone and show the final order summary.",
		input: v.object({
			zoneId: v.pipe(v.number(), v.integer(), v.minValue(1)),
		}),
		output: assistantCheckoutToolOutputSchema,
		async run({ input }) {
			const required = await requireCheckout();
			if (required.status === "error") return reportFailure(required.error);
			const selected = applyZoneSelection(required.value, input.zoneId);
			if (selected.status === "error") {
				return reportFailure(selected.error, required.value);
			}
			const confirming = applyNotes(selected.value, undefined);
			const cart = await deps.getCart();
			const prepared = await prepareAttempt(confirming, cart);
			if (prepared.status === "error") {
				return reportFailure(prepared.error, confirming);
			}
			await deliverBestEffort(
				deps.sendText(formatOrderSummary(prepared.value, cart)),
			);
			return { ok: true as const, ...facts(prepared.value) };
		},
	});

	const provideNotes = defineTool({
		name: "provide_notes",
		description:
			"Record optional order notes, then show the final summary for confirmation.",
		input: v.object({ notes: v.optional(v.string()) }),
		output: assistantCheckoutToolOutputSchema,
		async run({ input }) {
			const required = await requireCheckout();
			if (required.status === "error") return reportFailure(required.error);
			const confirming = applyNotes(required.value, input.notes);
			const cart = await deps.getCart();
			const prepared = await prepareAttempt(confirming, cart);
			if (prepared.status === "error") {
				return reportFailure(prepared.error, confirming);
			}
			await deliverBestEffort(
				deps.sendText(formatOrderSummary(prepared.value, cart)),
			);
			return { ok: true as const, ...facts(prepared.value) };
		},
	});

	const createConfirmedOrder = async (state: CheckoutState) => {
		const cart = await deps.getCart();
		const guard = canBeginCheckout(cart);
		if (guard.status === "error") {
			return reportFailure(guard.error, state);
		}
		const prepared = await prepareAttempt(state, cart);
		if (prepared.status === "error") {
			return reportFailure(prepared.error, state);
		}
		const payload = buildCheckoutOrderPayload(prepared.value, cart);
		if (payload.status === "error") {
			return reportFailure(payload.error, prepared.value);
		}

		const claimed = markCreating(prepared.value);
		await deps.saveCheckout(claimed);
		const created = await deps.createOrder(payload.value);
		if (created.status === "error") {
			return reportFailure(created.error, claimed);
		}

		const done = created.value.paymentNumber
			? attachPayment(markCreated(claimed), {
					paymentNumber: created.value.paymentNumber,
					checkoutToken: created.value.checkoutToken,
				})
			: markCreated(claimed);
		await deps.saveCheckout(done);
		await deliverBestEffort(
			deps.sendText(
				formatOrderCreated(
					created.value.orderNumber,
					created.value.paymentNumber,
				),
			),
		);
		if (created.value.paymentNumber && deps.sendPaymentChoices) {
			await deliverBestEffort(deps.sendPaymentChoices(created.value));
		}
		return {
			ok: true as const,
			orderNumber: created.value.orderNumber,
			paymentNumber: created.value.paymentNumber,
			checkoutToken: created.value.checkoutToken,
			...facts(done),
		};
	};

	const placeOrder = defineTool({
		name: "place_order",
		description:
			"Create one order only after the customer confirms the final summary. The store computes the authoritative total.",
		input: v.object({}),
		output: assistantCheckoutToolOutputSchema,
		async run() {
			const required = await requireCheckout();
			if (required.status === "error") return reportFailure(required.error);
			const state = required.value;

			return matchAsync(
				decidePlaceOrder(state.phase),
				"_tag",
			)({
				NotStarted: () => reportFailure({ _tag: "CheckoutNotStarted" }, state),
				ValidateReadiness: async () => {
					const cart = await deps.getCart();
					const prepared = await prepareAttempt(state, cart);
					if (prepared.status === "error") {
						return reportFailure(prepared.error, state);
					}
					await deliverBestEffort(
						deps.sendText(formatOrderSummary(prepared.value, cart)),
					);
					return failure(
						{ _tag: "SummaryNotConfirmed" },
						prepared.value,
					);
				},
				Create: () => createConfirmedOrder(state),
			});
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
