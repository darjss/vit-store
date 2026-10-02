// Local store API stub on :8798 so dev runs never touch production mutations.
// tRPC GET queries under /trpc/store forward unchanged to
// https://api.amerikvitamin.mn (public read procedures only). POST mutations
// in `mutations` answer locally in the SuperJSON shape httpLink expects:
//   { "result": { "data": { "json": ... } } }
// Every answered mutation is appended to /tmp/messenger-store-stub.jsonl.
// POST /stub/pay/<paymentNumber> flips getPaymentStatus to "success".

import { appendFileSync } from "node:fs";
import * as v from "valibot";

const UPSTREAM = "https://api.amerikvitamin.mn";
const LOG = "/tmp/messenger-store-stub.jsonl";
const PORT = 8798;

const paid = new Set<string>();
let orderSeq = 0;

// Every stub result is a flat record of scalars.
type StubData = Record<string, number | string>;

const ok = (data: StubData): Response => Response.json({ result: { data: { json: data } } });

const trpcError = (message: string, code: string, httpStatus: number): Response =>
	Response.json(
		{ error: { json: { code: -32_600, data: { code, httpStatus }, message } } },
		{ status: httpStatus },
	);

// httpLink (non-batch) bodies look like { json: {...} }; GET queries carry the
// same shape in the `input` query param.
const inputSchema = v.looseObject({
	json: v.looseObject({
		checkoutToken: v.optional(v.string()),
		paymentNumber: v.optional(v.string()),
	}),
});

const mutationInput = (body: string) => {
	try {
		const parsed = v.safeParse(inputSchema, JSON.parse(body));
		return parsed.success
			? {
					checkoutToken: parsed.output.json.checkoutToken,
					paymentNumber: parsed.output.json.paymentNumber,
				}
			: { checkoutToken: undefined, paymentNumber: undefined };
	} catch {
		return { checkoutToken: undefined, paymentNumber: undefined };
	}
};

const queryParamInput = (url: URL) => {
	const raw = url.searchParams.get("input");
	if (raw === null) {
		return { paymentNumber: undefined };
	}
	try {
		const parsed = v.safeParse(inputSchema, JSON.parse(raw));
		return { paymentNumber: parsed.success ? parsed.output.json.paymentNumber : undefined };
	} catch {
		return { paymentNumber: undefined };
	}
};

const record = (procedure: string, body: string): void => {
	appendFileSync(
		LOG,
		`${JSON.stringify({ at: new Date().toISOString(), body: JSON.parse(body), procedure })}\n`,
	);
};

const mutations = new Map<string, (body: string) => Response>([
	[
		"order.addOrder",
		() => {
			orderSeq += 1;
			return ok({
				accountName: "Test Account",
				accountNumber: "0000000000",
				checkoutToken: "ct_local",
				orderNumber: `ORD-LOCAL-${orderSeq}`,
				paymentNumber: `PAY-LOCAL-${orderSeq}`,
				total: 131_000,
			});
		},
	],
	["payment.claimTransferPaid", () => ok({ outcome: "changed" })],
	[
		"payment.selectTransfer",
		(body) => {
			const { paymentNumber } = mutationInput(body);
			if (paymentNumber !== undefined && paid.has(paymentNumber)) {
				return trpcError("ALREADY_PAID", "BAD_REQUEST", 400);
			}
			return ok({ provider: "transfer" });
		},
	],
]);

// Local answer for the history-prefill lookup: 99112233 has a saved address,
// every other phone is NOT_FOUND. No production read.
const customerByPhone = (url: URL): Response => {
	const raw = url.searchParams.get("input");
	const parsed = v.safeParse(
		v.looseObject({ json: v.looseObject({ phone: v.optional(v.number()) }) }),
		raw === null ? undefined : JSON.parse(raw),
	);
	const phone = parsed.success ? parsed.output.json.phone : undefined;
	if (phone === 99_112_233) {
		return ok({ address: "БЗД, 3-р хороо, тест байр 12", phone });
	}
	return trpcError("Customer not found", "NOT_FOUND", 404);
};

// Admin bot surface: GETs forward to production (reads are safe), POSTs are
// mutations and must never reach production.
const botRoute = async (request: Request, url: URL, procedure: string): Promise<Response> => {
	if (request.method === "POST") {
		const body = await request.text();
		appendFileSync(
			LOG,
			`${JSON.stringify({ at: new Date().toISOString(), body, procedure: `bot.${procedure}` })}\n`,
		);
		return trpcError("blocked by local stub", "FORBIDDEN", 403);
	}
	if (procedure === "customer.getCustomerByPhone") {
		return customerByPhone(url);
	}
	return forward(request, url);
};

const storeRoute = async (request: Request, url: URL, procedure: string): Promise<Response> => {
	if (request.method === "GET" && procedure === "payment.getPaymentStatus") {
		const { paymentNumber } = queryParamInput(url);
		return ok({
			provider: "transfer",
			status: paymentNumber !== undefined && paid.has(paymentNumber) ? "success" : "pending",
		});
	}
	if (request.method === "GET" && procedure === "payment.getTransferReconciliationStatus") {
		return ok({ status: "polling" });
	}
	if (request.method === "POST") {
		const handler = mutations.get(procedure);
		if (handler === undefined) {
			// Never forward a mutation to production.
			return trpcError("stub does not implement this mutation", "NOT_IMPLEMENTED", 501);
		}
		const body = await request.text();
		record(procedure, body);
		return handler(body);
	}
	return forward(request, url);
};

Bun.serve({
	fetch: async (request) => {
		const url = new URL(request.url);

		const payMatch = /^\/stub\/pay\/([^/]+)$/.exec(url.pathname);
		if (payMatch && request.method === "POST") {
			paid.add(payMatch[1]);
			return Response.json({ ok: true, paymentNumber: payMatch[1] });
		}
		if (url.pathname.startsWith("/trpc/bot/")) {
			return botRoute(request, url, url.pathname.slice("/trpc/bot/".length));
		}
		if (!url.pathname.startsWith("/trpc/store/")) {
			return new Response("not found", { status: 404 });
		}
		return storeRoute(request, url, url.pathname.slice("/trpc/store/".length));
	},
	port: PORT,
});

// Forward a read verbatim to the real store API, keeping the caller's auth
// headers (X-Admin-Bot-Token for /trpc/bot). The original `host`
// (127.0.0.1:8798) must not leak upstream — CDN routing keys off it.
const forward = async (request: Request, url: URL): Promise<Response> => {
	const forwardHeaders = new Headers(request.headers);
	forwardHeaders.delete("host");
	forwardHeaders.delete("content-length");
	const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
		headers: forwardHeaders,
		method: request.method,
	});
	return new Response(upstream.body, {
		headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
		status: upstream.status,
	});
};

console.log(`store stub on :${PORT} -> ${UPSTREAM} (reads), mutations local, log ${LOG}`);
