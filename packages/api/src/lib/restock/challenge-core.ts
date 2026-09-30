export type RestockChallengeRecord = {
	channel: "sms" | "email";
	codeHash: string;
	contact: string;
	expiresAt: number;
	productId: number;
	version: 1;
};

export type RestockChallengeStore = {
	delete: (challengeId: string) => Promise<void>;
	get: (challengeId: string) => Promise<RestockChallengeRecord | null>;
	getdel: (challengeId: string) => Promise<RestockChallengeRecord | null>;
	restore: (challengeId: string, record: RestockChallengeRecord, ttlMs: number) => Promise<void>;
};

const encoder = new TextEncoder();

async function hashCode(challengeId: string, code: string) {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${challengeId}:${code}`));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
	if (left.length !== right.length) {
		return false;
	}
	let difference = 0;
	for (let index = 0; index < left.length; index++) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

export async function createRestockChallengeRecord(input: {
	challengeId: string;
	channel: "sms" | "email";
	code: string;
	contact: string;
	now: Date;
	productId: number;
	ttlMs: number;
}) {
	return {
		channel: input.channel,
		codeHash: await hashCode(input.challengeId, input.code),
		contact: input.contact,
		expiresAt: input.now.getTime() + input.ttlMs,
		productId: input.productId,
		version: 1,
	} satisfies RestockChallengeRecord;
}

async function matchesCode(challengeId: string, code: string, record: RestockChallengeRecord) {
	return constantTimeEqual(record.codeHash, await hashCode(challengeId, code));
}

export async function consumeRestockChallenge(input: {
	challengeId: string;
	code: string;
	now: Date;
	store: RestockChallengeStore;
}) {
	const record = await input.store.get(input.challengeId);
	if (!record) {
		return { status: "missing" as const };
	}
	if (record.expiresAt <= input.now.getTime()) {
		await input.store.delete(input.challengeId);
		return { status: "expired" as const };
	}
	if (!(await matchesCode(input.challengeId, input.code, record))) {
		return { status: "invalid" as const };
	}

	const consumed = await input.store.getdel(input.challengeId);
	if (!consumed) {
		return { status: "missing" as const };
	}
	if (
		consumed.expiresAt <= input.now.getTime() ||
		!(await matchesCode(input.challengeId, input.code, consumed))
	) {
		return { status: "invalid" as const };
	}

	return { challenge: consumed, status: "confirmed" as const };
}

export async function restoreRestockChallenge(input: {
	challenge: RestockChallengeRecord;
	challengeId: string;
	now: Date;
	store: RestockChallengeStore;
}) {
	const ttlMs = input.challenge.expiresAt - input.now.getTime();
	if (ttlMs <= 0) {
		return;
	}
	await input.store.restore(input.challengeId, input.challenge, ttlMs);
}
