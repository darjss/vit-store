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
});
