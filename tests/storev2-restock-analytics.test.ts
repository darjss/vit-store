import { afterEach, describe, expect, test } from "bun:test";
import {
	trackRestockChannelSelected,
	trackRestockConfirmationCompleted,
	trackRestockConfirmationRequested,
	trackRestockSheetOpened,
	trackRestockSubscriptionCreated,
	trackRestockSubscriptionFailed,
} from "../apps/storev2/src/lib/analytics";

type CapturedEvent = {
	name: string;
	properties?: Record<string, unknown>;
};

const privateValues = [
	"99112233",
	"guest@example.com",
	"123456",
	"25b5eab9-e189-4a41-9ad8-132a6eedd31f",
];

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("restock analytics", () => {
	test("captures only the approved fields", () => {
		const events: CapturedEvent[] = [];
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				posthog: {
					capture: (name: string, properties?: Record<string, unknown>) => {
						events.push({ name, properties });
					},
				},
			},
		});
		const base = {
			productId: 7283,
			channel: "email" as const,
			customerType: "guest" as const,
		};

		trackRestockSheetOpened(base);
		trackRestockChannelSelected(base);
		trackRestockConfirmationRequested(base);
		trackRestockConfirmationCompleted(base);
		trackRestockSubscriptionCreated({ ...base, alreadySubscribed: true });
		trackRestockSubscriptionFailed({ ...base, errorCode: "BAD_REQUEST" });

		expect(events.map((event) => event.name)).toEqual([
			"restock_sheet_opened",
			"restock_channel_selected",
			"restock_confirmation_requested",
			"restock_confirmation_completed",
			"restock_subscription_created",
			"restock_subscription_failed",
		]);
		const allowedFields = new Set([
			"product_id",
			"channel",
			"customer_type",
			"already_subscribed",
			"error_code",
		]);
		for (const event of events) {
			const fields = Object.keys(event.properties ?? {});
			expect(fields).toEqual(
				expect.arrayContaining(["customer_type", "product_id"]),
			);
			expect(fields.every((field) => allowedFields.has(field))).toBe(true);
			const serialized = JSON.stringify(event.properties);
			for (const privateValue of privateValues) {
				expect(serialized).not.toContain(privateValue);
			}
		}
	});
});
