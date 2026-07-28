import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	deserializeResult,
	deserializeResultOrThrow,
	projectPanicForLog,
	projectResultForLog,
	publicErrorSchema,
	serializeResult,
} from "@vit/shared";
import { Result, ResultDeserializationError, TaggedError } from "better-result";
import superjson from "superjson";
import * as v from "valibot";
import { toLegacyTrpc } from "../src/result/legacy-trpc";

const valueSchema = v.strictObject({
	id: v.number(),
	label: v.string(),
});

const errorSchema = v.variant("_tag", [
	publicErrorSchema("NotFound", { message: v.string() }),
	publicErrorSchema("Unavailable", { retryable: v.boolean() }),
	publicErrorSchema("Conflict", { resource: v.string() }),
]);

const schemas = { value: valueSchema, error: errorSchema };
type Value = v.InferInput<typeof valueSchema>;
type Failure = v.InferInput<typeof errorSchema>;

const resultStatus = (result: Result<Value, Failure>) => result.status;

describe("validated serialized Results", () => {
	test("round-trips Ok and Err through JSON", () => {
		const okWire = serializeResult(
			Result.ok<Value, Failure>({ id: 7, label: "vitamin" }),
			schemas,
		);
		const errorWire = serializeResult(
			Result.err<Value, Failure>({
				_tag: "Unavailable",
				retryable: true,
			}),
			schemas,
		);

		const ok = deserializeResultOrThrow(
			JSON.parse(JSON.stringify(okWire)),
			schemas,
		);
		const error = deserializeResultOrThrow(
			JSON.parse(JSON.stringify(errorWire)),
			schemas,
		);

		expect(ok.status).toBe("ok");
		expect(error.status).toBe("error");
		expect(ok.match({ ok: (value) => value.id, err: () => 0 })).toBe(7);
		expect(
			error.match({
				ok: () => false,
				err: (failure) => failure._tag === "Unavailable" && failure.retryable,
			}),
		).toBe(true);
	});

	test("round-trips SuperJSON values", () => {
		const datedSchemas = {
			value: v.strictObject({ createdAt: v.date() }),
			error: errorSchema,
		};
		const createdAt = new Date("2026-01-02T03:04:05.000Z");
		const wire = serializeResult(
			Result.ok<v.InferInput<typeof datedSchemas.value>, Failure>({
				createdAt,
			}),
			datedSchemas,
		);
		const transported = superjson.parse(superjson.stringify(wire));
		const result = deserializeResultOrThrow(transported, datedSchemas);

		expect(
			result.match({
				ok: (value) => value.createdAt.toISOString(),
				err: () => "error",
			}),
		).toBe(createdAt.toISOString());
	});

	test("keeps batched Results independent", () => {
		const wire = [
			serializeResult(
				Result.ok<Value, Failure>({ id: 1, label: "first" }),
				schemas,
			),
			serializeResult(
				Result.err<Value, Failure>({ _tag: "NotFound", message: "missing" }),
				schemas,
			),
		];
		const batch = superjson.parse<unknown[]>(superjson.stringify(wire));
		const hydrated = batch.map((item) =>
			deserializeResultOrThrow(item, schemas),
		);

		expect(hydrated.map(resultStatus)).toEqual(["ok", "error"]);
	});

	test.each([
		null,
		{},
		{ status: "ok" },
		{ status: "ok", value: { id: "7", label: "vitamin" } },
		{ status: "ok", value: { id: 7, label: "vitamin" }, extra: true },
		{ status: "error", error: { _tag: "Unavailable", retryable: "yes" } },
		{
			status: "error",
			error: { _tag: "NotFound", message: "missing", stack: "secret" },
		},
		{ status: "other", value: { id: 7, label: "vitamin" } },
	])("rejects a malformed envelope or nested payload", (wire) => {
		const result = deserializeResult(wire, schemas);
		expect(
			result.match({
				ok: () => false,
				err: (error) => ResultDeserializationError.is(error),
			}),
		).toBe(true);
		expect(() => deserializeResultOrThrow(wire, schemas)).toThrow(
			ResultDeserializationError,
		);
	});

	test("rejects Error subclasses before serialization", () => {
		class LeakyNotFound extends TaggedError("NotFound")<{
			message: string;
			token: string;
		}>() {}

		const result = Result.err<Value, Failure>(
			new LeakyNotFound({ message: "missing", token: "secret-token" }),
		);

		expect(() => serializeResult(result, schemas)).toThrow(
			"Public Result errors must be plain records.",
		);
	});
});

describe("safe Result log projection", () => {
	test("keeps only allowlisted expected-failure metadata", () => {
		const result = Result.err({
			_tag: "ProviderUnavailable",
			retryable: true,
			message: "token=secret-token",
			token: "secret-token",
			phone: "99112233",
			address: "private-address",
			fingerprint: "private-fingerprint",
			providerBody: "private-provider-body",
			cause: new Error("private-cause"),
			stack: "private-stack",
		});
		const projection = projectResultForLog(result, {
			operation: "payment.refresh",
			error_layer: "operation",
			attempt: 2,
			provider: "qpay",
		});
		const serialized = JSON.stringify(projection);

		expect(projection).toEqual({
			operation: "payment.refresh",
			error_layer: "operation",
			attempt: 2,
			provider: "qpay",
			outcome: "error",
			error_tag: "ProviderUnavailable",
			retryable: true,
		});
		for (const secret of [
			"secret-token",
			"99112233",
			"private-address",
			"private-fingerprint",
			"private-provider-body",
			"private-cause",
			"private-stack",
		]) {
			expect(serialized).not.toContain(secret);
		}
	});

	test("projects panics by correlation ID without the thrown value", () => {
		expect(
			projectPanicForLog("correlation-123", {
				operation: "checkout.create",
				error_layer: "router",
			}),
		).toEqual({
			operation: "checkout.create",
			error_layer: "router",
			outcome: "error",
			panic: true,
			correlation_id: "correlation-123",
		});
	});
});

describe("legacy tRPC adapter", () => {
	test("returns the legacy success DTO unchanged", () => {
		const value = { id: 3, label: "legacy" };
		expect(
			toLegacyTrpc(Result.ok<Value, Failure>(value), () => ({
				code: "BAD_REQUEST",
				message: "unused",
			})),
		).toBe(value);
	});

	test("maps an expected Err to the legacy code and message", () => {
		try {
			toLegacyTrpc(
				Result.err<Value, Failure>({ _tag: "NotFound", message: "missing" }),
				() => ({ code: "NOT_FOUND", message: "Purchase not found" }),
			);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("NOT_FOUND");
			expect((error as TRPCError).message).toBe("Purchase not found");
		}
	});
});
