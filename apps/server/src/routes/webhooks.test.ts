import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { Hono } from "hono";
import type { GenericWebhookPayload } from "@vit/api/integrations";
import { executePaymentConfirmation } from "@vit/api/lib/payments/payment-confirmation-core";
import type { ServerHonoEnv } from "../lib/logging";
import { createMessengerWebhookRoutes } from "./webhooks";

const APP_SECRET = "test-app-secret";
const PAGE_ID = "test-page-id";
const VERIFY_TOKEN = "test-verify-token";

const env = {
	MESSENGER_APP_SECRET: APP_SECRET,
	MESSENGER_PAGE_ID: PAGE_ID,
	MESSENGER_VERIFY_TOKEN: VERIFY_TOKEN,
} as unknown as Env;

const payload = (pageId = PAGE_ID) => ({
	object: "page" as const,
	entry: [
		{
			id: pageId,
			time: 1_750_000_000_000,
			messaging: [
				{
					sender: { id: "admin-psid" },
					recipient: { id: pageId },
					timestamp: 1_750_000_000_000,
					postback: {
						mid: "postback-mid-1",
						payload: "confirm_payment:PAY-100",
					},
				},
			],
		},
	],
});

const signature = (body: string) =>
	`sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

const createApp = (
	handler: (
		payload: GenericWebhookPayload,
	) => Promise<
		| { status: "ok" }
		| { status: "error"; error: { _tag: string; code: string } }
	>,
) => {
	const app = new Hono<ServerHonoEnv>();
	app.use("*", async (c, next) => {
		c.set(
			"log",
			{
				set() {},
				info() {},
				warn() {},
			} as never,
		);
		await next();
	});
	app.route("/webhooks", createMessengerWebhookRoutes(handler));
	return app;
};

const post = (
	app: ReturnType<typeof createApp>,
	body: string,
	hubSignature?: string,
) =>
	app.request(
		"/webhooks/messenger",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(hubSignature
					? { "x-hub-signature-256": hubSignature }
					: {}),
			},
			body,
		},
		env,
	);

const okHandler = async () => ({ status: "ok" as const });

describe("legacy Messenger webhook authentication", () => {
	test.each([
		["missing", undefined],
		["wrong", `sha256=${"0".repeat(64)}`],
	])("rejects a %s signature before payment dispatch", async (_name, value) => {
		let dispatches = 0;
		const app = createApp(async () => {
			dispatches += 1;
			return { status: "ok" };
		});
		const body = JSON.stringify(payload());

		const response = await post(app, body, value);

		expect(response.status).toBe(401);
		expect(dispatches).toBe(0);
	});

	test("rejects changed bytes signed for the original body", async () => {
		let dispatches = 0;
		const app = createApp(async () => {
			dispatches += 1;
			return { status: "ok" };
		});
		const body = JSON.stringify(payload());

		const response = await post(app, `${body}\n`, signature(body));

		expect(response.status).toBe(401);
		expect(dispatches).toBe(0);
	});

	test("rejects a signed callback for a different Page", async () => {
		let dispatches = 0;
		const app = createApp(async () => {
			dispatches += 1;
			return { status: "ok" };
		});
		const body = JSON.stringify(payload("other-page-id"));

		const response = await post(app, body, signature(body));

		expect(response.status).toBe(403);
		expect(dispatches).toBe(0);
	});

	test("forwards a valid signed payment callback and preserves its response", async () => {
		const received: GenericWebhookPayload[] = [];
		const app = createApp(async (wire) => {
			received.push(wire);
			return { status: "ok" };
		});
		const wire = payload();
		const body = JSON.stringify(wire);

		const response = await post(app, body, signature(body));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
		expect(received).toEqual([wire]);
	});

	test("keeps a valid duplicate safe at the payment confirmation boundary", async () => {
		let committed = false;
		let commits = 0;
		let recoveryRuns = 0;
		const app = createApp(async () => {
			const result = await executePaymentConfirmation({
				commit: async () => {
					if (committed) {
						return Result.ok({
							outcome: "already_confirmed" as const,
							orderId: 1,
						});
					}
					committed = true;
					commits += 1;
					return Result.ok({ outcome: "confirmed" as const, orderId: 1 });
				},
				loadOrderNumber: async () => "OR-100",
				recover: async () => {
					recoveryRuns += 1;
					return { recoveryPending: false };
				},
			});
			expect(result.isOk()).toBe(true);
			return { status: "ok" };
		});
		const body = JSON.stringify(payload());
		const hubSignature = signature(body);

		const first = await post(app, body, hubSignature);
		const duplicate = await post(app, body, hubSignature);

		expect([first.status, duplicate.status]).toEqual([200, 200]);
		expect([await first.text(), await duplicate.text()]).toEqual(["OK", "OK"]);
		expect(commits).toBe(1);
		expect(recoveryRuns).toBe(1);
	});
});
