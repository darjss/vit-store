import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// analytics.ts imports the D1/Workers DB client which is only available in the
// Workers runtime, so we test the exclusion by inspecting the source rather
// than importing the module. This verifies the fix is present and that
// SalesTable-based metrics are left untouched.
const sourcePath = join(import.meta.dir, "analytics.ts");
const source = readFileSync(sourcePath, "utf8");

describe("analytics: cancelled/refunded orders excluded from revenue", () => {
	test("EXCLUDED_ORDER_STATUSES is defined as cancelled + refunded", () => {
		expect(source).toMatch(
			/EXCLUDED_ORDER_STATUSES\s*=\s*\[\s*"cancelled"\s*,\s*"refunded"\s*\]/,
		);
	});

	test("every OrdersTable aggregation applies the exclusion filter", () => {
		const notInArrayCount = (source.match(/notInArray\(/g) ?? []).length;
		const fromOrdersCount =
			(source.match(/\.from\(OrdersTable\)/g) ?? []).length;
		// 6 aggregation spots use OrdersTable directly (AOV x2, CLV subquery x2,
		// repeat-customers subquery x2). Each must have a matching notInArray.
		expect(fromOrdersCount).toBe(6);
		expect(notInArrayCount).toBeGreaterThanOrEqual(6);
	});

	test("each notInArray references EXCLUDED_ORDER_STATUSES", () => {
		const matches = source.match(/notInArray\([^)]*EXCLUDED_ORDER_STATUSES/g) ?? [];
		expect(matches.length).toBe(6);
	});

	test("SalesTable aggregations are left untouched (no status filter)", () => {
		// SalesTable rows are immutable sale records; they must NOT be filtered
		// by order status.
		expect(source).not.toMatch(/notInArray\(\s*SalesTable\.status/);
	});
});
