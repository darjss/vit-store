import { describe, expect, test } from "bun:test";
import { createLogger } from "evlog";
import { logTrpcError } from "./trpc-error-log";

describe("logTrpcError", () => {
	test("does not merge a wrapped error into an existing read-only cause", () => {
		const postgresError = new TypeError("connection slots exhausted");
		Object.defineProperty(postgresError, "stack", {
			value: postgresError.stack,
			writable: false,
		});
		const databaseError = new TypeError("database request failed", {
			cause: postgresError,
		});
		const log = createLogger({ operation: "test" });
		log.error(databaseError);

		const wrapped = new Error("Failed to fetch paginated orders", {
			cause: databaseError,
		}) as Error & { code?: string };
		wrapped.code = "INTERNAL_SERVER_ERROR";

		expect(() =>
			logTrpcError(
				log,
				"trpc.admin_error",
				"order.getPaginatedOrders",
				wrapped,
			),
		).not.toThrow();
		expect(log.getContext().event).toBe("trpc.admin_error");
	});

	test("redacts submitted values while preserving operator correlation", () => {
		const phone = "91234567";
		const address = "Known checkout address 42";
		const notes = "Known checkout notes";
		const idempotencyKey = "checkout_00000000-0000-4000-8000-000000000001";
		const checkoutToken = "known-checkout-token-secret";
		const adminCustomer = "known-admin-customer@example.com";
		const log = createLogger({ correlation_id: "req-known-correlation" });
		const error = new Error(
			[
				phone,
				address,
				notes,
				idempotencyKey,
				checkoutToken,
				adminCustomer,
			].join(" | "),
		) as Error & { code?: string };
		error.code = "INTERNAL_SERVER_ERROR";

		logTrpcError(log, "trpc.store_error", "v2.order.addOrder", error);

		const serialized = JSON.stringify(log.getContext());
		for (const secret of [
			phone,
			address,
			notes,
			idempotencyKey,
			checkoutToken,
			adminCustomer,
		]) {
			expect(serialized).not.toContain(secret);
		}
		expect(log.getContext()).toMatchObject({
			correlation_id: "req-known-correlation",
			event: "trpc.store_error",
			trpc: { path: "v2.order.addOrder", code: "INTERNAL_SERVER_ERROR" },
		});
	});
});
