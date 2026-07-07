import { describe, expect, test } from "bun:test";
import { getDaysAgo, getStartAndEndofDayAgo, getStartOfDay } from "./utils";

const UB_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("day boundaries use Asia/Ulaanbaatar (UTC+8) midnight", () => {
	test("getStartOfDay lands on a UB-midnight UTC instant", () => {
		const start = getStartOfDay();
		const ms = start.getTime();
		// UB midnight => (ms + 8h) must be an exact multiple of 1 day.
		expect((ms + UB_OFFSET_MS) % DAY_MS).toBe(0);
		// And it must be today's UB-midnight (<= now, within the last 24h).
		const now = Date.now();
		expect(ms).toBeLessThanOrEqual(now);
		expect(now - ms).toBeLessThan(DAY_MS);
	});

	test("getStartOfDay is not affected by runtime-local timezone", () => {
		// Workers run in UTC; the result must still be a UB-midnight regardless
		// of the host's local timezone. Verify the hour-in-UTC is 16:00 (00:00 UB).
		const start = getStartOfDay();
		expect(start.getUTCHours()).toBe(16);
		expect(start.getUTCMinutes()).toBe(0);
		expect(start.getUTCSeconds()).toBe(0);
		expect(start.getUTCMilliseconds()).toBe(0);
	});

	test("getDaysAgo(n) is exactly n days before today's UB-midnight", () => {
		const today = getStartOfDay();
		for (const n of [1, 7, 30]) {
			const past = getDaysAgo(n);
			expect(past.getTime()).toBe(today.getTime() - n * DAY_MS);
			// Still a UB-midnight.
			expect((past.getTime() + UB_OFFSET_MS) % DAY_MS).toBe(0);
		}
	});

	test("getStartAndEndofDayAgo spans one full UB day", () => {
		const { startDate, endDate } = getStartAndEndofDayAgo(1);
		expect(startDate.getTime()).toBe(getDaysAgo(1).getTime());
		// End of day = start + 1 day - 1 ms (23:59:59.999 UB).
		expect(endDate.getTime()).toBe(startDate.getTime() + DAY_MS - 1);
		expect((startDate.getTime() + UB_OFFSET_MS) % DAY_MS).toBe(0);
		expect((endDate.getTime() + 1 + UB_OFFSET_MS) % DAY_MS).toBe(0);
	});
});
