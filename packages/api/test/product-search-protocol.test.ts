import { describe, expect, test } from "bun:test";
import {
	productSearchInputSchema,
	productSearchSnapshotSchema,
	productSearchStatusSchema,
} from "../src/lib/product-search/types";
import * as v from "valibot";

describe("product search protocol schemas", () => {
	test("accepts a strict search request and rejects unknown fields", () => {
		expect(
			v.safeParse(productSearchInputSchema, {
				query: "vitamin",
				page: 1,
				pageSize: 10,
			}).success,
		).toBe(true);
		expect(
			v.safeParse(productSearchInputSchema, {
				query: "vitamin",
				page: 1,
				pageSize: 10,
				token: "private",
			}).success,
		).toBe(false);
	});

	test("rejects malformed persisted status and snapshot values", () => {
		expect(
			v.safeParse(productSearchStatusSchema, {
				initialized: true,
				memoryReady: false,
				productCount: -1,
				generatedAt: null,
				lastRebuildStartedAt: null,
				lastRebuildFinishedAt: null,
				lastRebuildReason: null,
				lastError: null,
			}).success,
		).toBe(false);
		expect(
			v.safeParse(productSearchSnapshotSchema, {
				version: 2,
				generatedAt: "2026-01-01T00:00:00.000Z",
				productCount: 0,
				documents: [],
				indexJson: "{}",
			}).success,
		).toBe(true);
		expect(
			v.safeParse(productSearchSnapshotSchema, {
				version: 1,
				generatedAt: "2026-01-01T00:00:00.000Z",
				productCount: 0,
				documents: [],
				indexJson: "{}",
			}).success,
		).toBe(false);
	});
});
