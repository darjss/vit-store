import { describe, expect, mock, test } from "bun:test";
import {
	adminCustomerSchema,
	catalogMutationErrorSchema,
	checkoutCreatedSchema,
	checkoutErrorSchema,
	newOrderSchema,
} from "@vit/shared";
import { Result } from "better-result";
import { createLogger } from "evlog";
import type { Context } from "../src/lib/context";
import { serializeOperationResult } from "../src/operations/serialize-operation-result";

mock.module("cloudflare:workers", () => ({ env: {} }));

const [
	{ adminProcedure, baseProcedure, customerProcedure, router },
	adminSession,
	customerSession,
] = await Promise.all([
	import("../src/lib/trpc"),
	import("../src/lib/session/admin"),
	import("../src/lib/session/store"),
]);
const { createAdminSession } = adminSession;
const { createSession: createCustomerSession } = customerSession;

const CHECKOUT_PHONE = "91234567";
const CHECKOUT_ADDRESS = "Known checkout address 42";
const CHECKOUT_NOTES = "Known checkout notes";
const IDEMPOTENCY_KEY = "checkout_00000000-0000-4000-8000-000000000001";
const CHECKOUT_TOKEN = "known-checkout-token-secret";
const PAYMENT_NUMBER = "known-payment-number";
const ORDER_NUMBER = "known-order-number";
const ACCOUNT_NUMBER = "known-account-number";
const ACCOUNT_NAME = "known-account-name";
const ADMIN_EMAIL = "known-admin@example.com";
const ADMIN_CUSTOMER_PHONE = 87654321;
const ADMIN_CUSTOMER_ADDRESS = "Known admin customer address";
const AUTH_CUSTOMER_PHONE = 93456789;
const CORRELATION_ID = "req-known-correlation";

const checkoutInput = {
	phoneNumber: CHECKOUT_PHONE,
	address: CHECKOUT_ADDRESS,
	addressZoneId: 1,
	notes: CHECKOUT_NOTES,
	products: [{ productId: 10, quantity: 2 }],
	idempotencyKey: IDEMPOTENCY_KEY,
};

const checkoutValue = {
	paymentNumber: PAYMENT_NUMBER,
	orderNumber: ORDER_NUMBER,
	checkoutToken: CHECKOUT_TOKEN,
	total: 25_000,
	customerPhone: CHECKOUT_PHONE,
	accountNumber: ACCOUNT_NUMBER,
	accountName: ACCOUNT_NAME,
};

const adminCustomer = {
	id: 77,
	phone: ADMIN_CUSTOMER_PHONE,
	address: ADMIN_CUSTOMER_ADDRESS,
	addressZoneId: 3,
	facebook_username: "known-admin-customer-facebook",
	instagram_username: "known-admin-customer-instagram",
	createdAt: new Date("2025-01-01T00:00:00.000Z"),
	updatedAt: null,
	deletedAt: null,
};

const loggingTestRouter = router({
	checkout: baseProcedure
		.input(newOrderSchema)
		.mutation(({ ctx }) =>
			serializeOperationResult(
				ctx,
				Result.ok(checkoutValue),
				{ value: checkoutCreatedSchema, error: checkoutErrorSchema },
				{ operation: "store.checkout.create", error_layer: "domain" },
			),
		),
	adminCustomer: adminProcedure.query(({ ctx }) =>
		serializeOperationResult(
			ctx,
			Result.ok(adminCustomer),
			{ value: adminCustomerSchema, error: catalogMutationErrorSchema },
			{ operation: "admin.customer.lookup", error_layer: "domain" },
		),
	),
	customerSession: customerProcedure.query(() => ({ authenticated: true })),
	unexpected: baseProcedure.input(newOrderSchema).mutation(({ input }) => {
		throw new Error(
			[
				input.phoneNumber,
				input.address,
				input.notes,
				input.idempotencyKey,
				CHECKOUT_TOKEN,
				ADMIN_CUSTOMER_PHONE,
				ADMIN_CUSTOMER_ADDRESS,
			].join(" | "),
		);
	}),
});

const createMemoryKv = () => {
	const entries = new Map<string, string>();
	return {
		get: async (key: string) => entries.get(key) ?? null,
		put: async (key: string, value: string) => {
			entries.set(key, value);
		},
		delete: async (key: string) => {
			entries.delete(key);
		},
	} as unknown as KVNamespace;
};

const createCallerContext = (cookie = "", kv = createMemoryKv()) => {
	const log = createLogger({ correlation_id: CORRELATION_ID });
	const c = {
		req: {
			raw: new Request("https://vit.test/trpc", {
				headers: cookie ? { cookie } : undefined,
			}),
		},
		env: {},
	} as Context["c"];
	const context = {
		c,
		session: null,
		db: undefined,
		kv,
		r2: undefined,
		correlationId: CORRELATION_ID,
		log,
	} as unknown as Context;
	return { context, log };
};

const expectSecretsAbsent = (serializedLog: string, secrets: unknown[]) => {
	for (const secret of secrets) {
		expect(serializedLog).not.toContain(String(secret));
	}
};

describe("tRPC log redaction", () => {
	test("keeps checkout and authenticated customer data out of success logs", async () => {
		const checkout = createCallerContext();
		await loggingTestRouter
			.createCaller(checkout.context)
			.checkout(checkoutInput);

		const checkoutContext = checkout.log.getContext();
		expect(checkoutContext).toMatchObject({
			correlation_id: CORRELATION_ID,
			operation_result: {
				operation: "store.checkout.create",
				outcome: "ok",
			},
			trpc: {
				path: "checkout",
				type: "MUTATION",
				outcome: "success",
				counts: { input: { fields: 6, list_items: 1 } },
			},
		});
		expect(Object.keys(checkoutContext.trpc).sort()).toEqual([
			"counts",
			"duration_ms",
			"outcome",
			"path",
			"type",
		]);
		expectSecretsAbsent(JSON.stringify(checkoutContext), [
			CHECKOUT_PHONE,
			CHECKOUT_ADDRESS,
			CHECKOUT_NOTES,
			IDEMPOTENCY_KEY,
			CHECKOUT_TOKEN,
			PAYMENT_NUMBER,
			ORDER_NUMBER,
			ACCOUNT_NUMBER,
			ACCOUNT_NAME,
		]);

		const adminKv = createMemoryKv();
		const { token: adminToken } = await createAdminSession(
			{
				id: 9,
				username: ADMIN_EMAIL,
				googleId: null,
				isApproved: true,
				createdAt: new Date("2025-01-01T00:00:00.000Z"),
				updatedAt: null,
				deletedAt: null,
			},
			adminKv,
		);
		const admin = createCallerContext(`admin_session=${adminToken}`, adminKv);
		await loggingTestRouter.createCaller(admin.context).adminCustomer();

		const adminContext = admin.log.getContext();
		expect(adminContext.user).toEqual({ id: 9 });
		expect(adminContext).toMatchObject({
			correlation_id: CORRELATION_ID,
			operation_result: {
				operation: "admin.customer.lookup",
				outcome: "ok",
			},
			trpc: { path: "adminCustomer", outcome: "success" },
		});
		expect(Object.keys(adminContext.trpc).sort()).toEqual([
			"counts",
			"duration_ms",
			"outcome",
			"path",
			"type",
		]);
		expectSecretsAbsent(JSON.stringify(adminContext), [
			adminToken,
			ADMIN_EMAIL,
			ADMIN_CUSTOMER_PHONE,
			ADMIN_CUSTOMER_ADDRESS,
			adminCustomer.facebook_username,
			adminCustomer.instagram_username,
		]);

		const customerKv = createMemoryKv();
		const { token: customerToken } = await createCustomerSession(
			{
				id: 11,
				phone: AUTH_CUSTOMER_PHONE,
				address: null,
				addressZoneId: null,
				facebook_username: null,
				instagram_username: null,
				createdAt: new Date("2025-01-01T00:00:00.000Z"),
				updatedAt: null,
				deletedAt: null,
				trust: "phone_verified",
			},
			customerKv,
		);
		const customer = createCallerContext(
			`store_session=${customerToken}`,
			customerKv,
		);
		await loggingTestRouter.createCaller(customer.context).customerSession();
		expect(customer.log.getContext().user).toEqual({ id: 11 });
		expectSecretsAbsent(JSON.stringify(customer.log.getContext()), [
			customerToken,
			AUTH_CUSTOMER_PHONE,
		]);
	});

	test("keeps submitted and returned data out of unexpected-failure logs", async () => {
		const { context, log } = createCallerContext();

		try {
			await loggingTestRouter.createCaller(context).unexpected(checkoutInput);
		} catch {
			// The caller receives the error. The request logger retains only structure.
		}

		const logContext = log.getContext();
		expect(logContext).toMatchObject({
			correlation_id: CORRELATION_ID,
			trpc: {
				path: "unexpected",
				type: "MUTATION",
				outcome: "error",
				counts: { input: { fields: 6, list_items: 1 } },
			},
		});
		expect(Object.keys(logContext.trpc).sort()).toEqual([
			"counts",
			"duration_ms",
			"outcome",
			"path",
			"type",
		]);
		expectSecretsAbsent(JSON.stringify(logContext), [
			CHECKOUT_PHONE,
			CHECKOUT_ADDRESS,
			CHECKOUT_NOTES,
			IDEMPOTENCY_KEY,
			CHECKOUT_TOKEN,
			ADMIN_CUSTOMER_PHONE,
			ADMIN_CUSTOMER_ADDRESS,
		]);
	});
});
