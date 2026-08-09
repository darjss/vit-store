export type RestockChallengeRecord = {
	version: 1;
	productId: number;
	channel: "sms" | "email";
	contact: string;
	codeHash: string;
	expiresAt: number;
};

export type RestockChallengeStore = {
	get: (challengeId: string) => Promise<RestockChallengeRecord | null>;
	getdel: (challengeId: string) => Promise<RestockChallengeRecord | null>;
	delete: (challengeId: string) => Promise<void>;
};

const encoder = new TextEncoder();

async function hashCode(challengeId: string, code: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		encoder.encode(`${challengeId}:${code}`),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function constantTimeEqual(left: string, right: string) {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index++) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

export async function createRestockChallengeRecord(input: {
	challengeId: string;
	code: string;
	productId: number;
	channel: "sms" | "email";
	contact: string;
	now: Date;
	ttlMs: number;
}) {
	return {
		version: 1,
		productId: input.productId,
		channel: input.channel,
		contact: input.contact,
		codeHash: await hashCode(input.challengeId, input.code),
		expiresAt: input.now.getTime() + input.ttlMs,
	} satisfies RestockChallengeRecord;
}

async function matchesCode(
	challengeId: string,
	code: string,
	record: RestockChallengeRecord,
) {
	return constantTimeEqual(record.codeHash, await hashCode(challengeId, code));
}

export async function consumeRestockChallenge(input: {
	store: RestockChallengeStore;
	challengeId: string;
	code: string;
	now: Date;
}) {
	const record = await input.store.get(input.challengeId);
	if (!record) return { status: "missing" as const };
	if (record.expiresAt <= input.now.getTime()) {
		await input.store.delete(input.challengeId);
		return { status: "expired" as const };
	}
	if (!(await matchesCode(input.challengeId, input.code, record))) {
		return { status: "invalid" as const };
	}

	const consumed = await input.store.getdel(input.challengeId);
	if (!consumed) return { status: "missing" as const };
	if (
		consumed.expiresAt <= input.now.getTime() ||
		!(await matchesCode(input.challengeId, input.code, consumed))
	) {
		return { status: "invalid" as const };
	}

	return { status: "confirmed" as const, challenge: consumed };
}
