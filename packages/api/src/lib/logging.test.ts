import { describe, expect, test } from "bun:test";
import { summarizeLogValue, summarizeTrpcInputForLog, summarizeTrpcOutputForLog } from "./logging";

const REDACTED = "[redacted]";

describe("summarizeLogValue redaction", () => {
	test("drops customer and account values at any depth but keeps the field names", () => {
		const summarized = summarizeLogValue({
			customerPhone: 96348585,
			orderNumber: "ORD-1",
			order: {
				accountName: "Aviddaram Bazarragchaa",
				accountNumber: "5041724145",
				address: "TimeSquare 502, 901",
				notes: "leave at door",
			},
			user: { id: 630, phone: 96348585 },
		});

		expect(JSON.stringify(summarized)).not.toContain("96348585");
		expect(JSON.stringify(summarized)).not.toContain("5041724145");
		expect(JSON.stringify(summarized)).not.toContain("Aviddaram");
		expect(JSON.stringify(summarized)).not.toContain("TimeSquare");
		expect(summarized).toEqual({
			customerPhone: REDACTED,
			orderNumber: "ORD-1",
			order: {
				accountName: REDACTED,
				accountNumber: REDACTED,
				address: REDACTED,
				notes: REDACTED,
			},
			user: { id: 630, phone: REDACTED },
		});
	});

	test("redacts PII inside array samples", () => {
		const summarized = summarizeTrpcOutputForLog("admin.order.getPaginatedOrders", {
			orders: [{ id: 1, customerPhone: "96348585", address: "TimeSquare 502", total: 50000 }],
		});
		const flat = JSON.stringify(summarized);
		expect(flat).not.toContain("96348585");
		expect(flat).not.toContain("TimeSquare");
		expect(flat).toContain("50000");
	});

	test("redacts checkout credentials on inputs", () => {
		const summarized = summarizeTrpcInputForLog("order.addOrder", {
			phoneNumber: "96348585",
			address: "TimeSquare 502, 901",
			notes: "n",
			checkoutToken: "e7f14a58-9c1f-4c0e-9f6a-1234567890ab",
			products: [{ productId: 1 }],
		});
		const flat = JSON.stringify(summarized);
		expect(flat).not.toContain("96348585");
		expect(flat).not.toContain("e7f14a58");
		expect(flat).toContain("productId");
	});
});
