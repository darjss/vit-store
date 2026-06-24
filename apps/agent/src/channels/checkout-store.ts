import {
	type CheckoutState,
	checkoutStateSchema,
	initialCheckoutState,
} from "@vit/assistant";
import * as v from "valibot";

// Per-session checkout persistence (ADR 0006: pre-order Messenger conversations
// live only in the Flue agent session, keyed by PSID — no customer row until
// the order is created). One Durable Object instance per assistant session id
// (the channel derives the id with `idFromName(sessionId)`), so the in-progress
// checkout (phone/address/zone/notes) survives across turns for the whole
// conversation.
//
// Like the CartStore, this DO holds zero checkout business logic — it is just
// durable storage for the channel-neutral `CheckoutState` from `@vit/assistant`.
// Requests are serialized per instance by the Durable Object runtime, so a
// read-modify-write is race-free without extra locking.

const STORAGE_KEY = "checkout";

// Wire payloads accepted on POST. `begin` resets to a fresh checkout; `put`
// stores a full channel-neutral CheckoutState. Parsed in two steps (discriminator
// then state) so the nested `checkoutStateSchema` keeps its precise type.
const checkoutRequestSchema = v.object({
	type: v.picklist(["put", "begin"]),
	state: v.optional(checkoutStateSchema),
});

export class CheckoutStore implements DurableObject {
	constructor(private readonly state: DurableObjectState) {}

	private async read(): Promise<CheckoutState | undefined> {
		const stored = await this.state.storage.get(STORAGE_KEY);
		if (stored === undefined) return undefined;
		// Tolerate a legacy/garbled record by resetting rather than throwing the
		// customer's whole turn.
		const parsed = v.safeParse(checkoutStateSchema, stored);
		return parsed.success ? parsed.output : undefined;
	}

	private async write(state: CheckoutState): Promise<CheckoutState> {
		await this.state.storage.put(STORAGE_KEY, state);
		return state;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.method === "GET") {
			return Response.json({ checkout: (await this.read()) ?? null });
		}
		if (request.method === "DELETE") {
			await this.state.storage.delete(STORAGE_KEY);
			return Response.json({ checkout: null });
		}
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return new Response("Invalid JSON", { status: 400 });
		}
		const parsed = v.safeParse(checkoutRequestSchema, body);
		if (!parsed.success) {
			return new Response("Invalid checkout request", { status: 400 });
		}

		if (parsed.output.type === "begin") {
			return Response.json({
				checkout: await this.write(initialCheckoutState()),
			});
		}
		if (!parsed.output.state) {
			return new Response("Invalid checkout request", { status: 400 });
		}
		return Response.json({ checkout: await this.write(parsed.output.state) });
	}
}
