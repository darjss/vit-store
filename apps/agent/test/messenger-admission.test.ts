import { describe, expect, test } from "bun:test";
import {
	claimInboundOnce,
	releaseInboundClaim,
} from "../src/channels/messenger-admission";

describe("Messenger admission dedupe", () => {
	test("claims once, reports a duplicate, and permits a released retry", async () => {
		const key = `test:${crypto.randomUUID()}`;
		const first = await claimInboundOnce(key);
		expect(first.status).toBe("ok");

		const duplicate = await claimInboundOnce(key);
		expect(duplicate.status).toBe("error");
		if (duplicate.status === "error") {
			expect(duplicate.error._tag).toBe("DuplicateInboundDelivery");
			expect(duplicate.error.retryable).toBe(false);
		}

		const released = await releaseInboundClaim(key);
		expect(released.status).toBe("ok");
		const retry = await claimInboundOnce(key);
		expect(retry.status).toBe("ok");
		await releaseInboundClaim(key);
	});

	test("rejects an invalid empty claim key", async () => {
		const result = await claimInboundOnce("");
		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.error._tag).toBe("InvalidDelivery");
		}
	});
});
