import { describe, expect, test } from "bun:test";
import {
	consumeRestockChallenge,
	createRestockChallengeRecord,
	type RestockChallengeRecord,
	type RestockChallengeStore,
} from "../src/lib/restock/challenge-core";
import { checkRestockRateLimit } from "../src/lib/restock/rate-limit-core";

class MemoryChallengeStore implements RestockChallengeStore {
	readonly records = new Map<string, RestockChallengeRecord>();

	async get(challengeId: string) {
		return this.records.get(challengeId) ?? null;
	}

	async getdel(challengeId: string) {
		const record = this.records.get(challengeId) ?? null;
		this.records.delete(challengeId);
		return record;
	}

	async delete(challengeId: string) {
		this.records.delete(challengeId);
	}
}

class MemoryRateLimitStore {
	readonly counts = new Map<string, number>();
	readonly expirations = new Map<string, number>();

	async incr(key: string) {
		const count = (this.counts.get(key) ?? 0) + 1;
		this.counts.set(key, count);
		return count;
	}

	async expire(key: string, windowSeconds: number) {
		this.expirations.set(key, windowSeconds);
	}
}

const now = new Date("2026-07-20T00:00:00.000Z");

async function createStoredChallenge(store: MemoryChallengeStore) {
	const challengeId = "challenge-1";
	const record = await createRestockChallengeRecord({
		challengeId,
		code: "123456",
		productId: 7283,
		channel: "sms",
		contact: "99112233",
		now,
		ttlMs: 10 * 60 * 1000,
	});
	store.records.set(challengeId, record);
	return challengeId;
}

describe("restock confirmation challenge", () => {
	test("a wrong code does not consume the challenge", async () => {
		const store = new MemoryChallengeStore();
		const challengeId = await createStoredChallenge(store);

		expect(
			await consumeRestockChallenge({
				store,
				challengeId,
				code: "000000",
				now,
			}),
		).toEqual({ status: "invalid" });
		expect(store.records.has(challengeId)).toBe(true);
	});

	test("an expired challenge fails and is removed", async () => {
		const store = new MemoryChallengeStore();
		const challengeId = await createStoredChallenge(store);

		expect(
			await consumeRestockChallenge({
				store,
				challengeId,
				code: "123456",
				now: new Date(now.getTime() + 11 * 60 * 1000),
			}),
		).toEqual({ status: "expired" });
		expect(store.records.has(challengeId)).toBe(false);
	});

	test("rate limits use hashed keys and reject excess attempts", async () => {
		const store = new MemoryRateLimitStore();
		const input = {
			store,
			action: "confirmation-attempt" as const,
			scope: "contact" as const,
			value: "guest@example.com",
			limit: 2,
			windowSeconds: 15 * 60,
		};

		expect(await checkRestockRateLimit(input)).toBe(true);
		expect(await checkRestockRateLimit(input)).toBe(true);
		expect(await checkRestockRateLimit(input)).toBe(false);
		const [key] = store.counts.keys();
		expect(key).not.toContain(input.value);
		expect(store.expirations.get(key ?? "")).toBe(input.windowSeconds);
	});

	test("a valid challenge can be consumed only once", async () => {
		const store = new MemoryChallengeStore();
		const challengeId = await createStoredChallenge(store);

		const first = await consumeRestockChallenge({
			store,
			challengeId,
			code: "123456",
			now,
		});
		expect(first.status).toBe("confirmed");
		if (first.status === "confirmed") {
			expect(first.challenge).toMatchObject({
				productId: 7283,
				channel: "sms",
				contact: "99112233",
			});
		}

		expect(
			await consumeRestockChallenge({
				store,
				challengeId,
				code: "123456",
				now,
			}),
		).toEqual({ status: "missing" });
	});
});
