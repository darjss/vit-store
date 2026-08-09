import { TRPCError } from "@trpc/server";
import { customAlphabet } from "nanoid";
import { sendEmail, smsGateway } from "~/lib/integrations";
import { redis } from "~/lib/redis";
import {
	consumeRestockChallenge,
	createRestockChallengeRecord,
	type RestockChallengeRecord,
	type RestockChallengeStore,
} from "~/lib/restock/challenge-core";
import {
	isValidRestockContact,
	normalizeRestockContact,
} from "~/lib/restock/normalize";
import { enforceRestockRateLimit } from "~/lib/restock/rate-limit";

const CHALLENGE_TTL_SECONDS = 10 * 60;
const SEND_WINDOW_SECONDS = 60 * 60;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const createCode = customAlphabet("1234567890", 6);

const challengeKey = (challengeId: string) =>
	`restock:confirmation:challenge:${challengeId}`;

const challengeStore: RestockChallengeStore = {
	get: (challengeId) =>
		redis().get<RestockChallengeRecord>(challengeKey(challengeId)),
	getdel: (challengeId) =>
		redis().getdel<RestockChallengeRecord>(challengeKey(challengeId)),
	delete: async (challengeId) => {
		await redis().del(challengeKey(challengeId));
	},
};

function invalidConfirmation(): never {
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: "Confirmation is invalid or expired",
	});
}

async function sendConfirmation(input: {
	channel: "sms" | "email";
	contact: string;
	code: string;
}) {
	if (input.channel === "sms") {
		const finalState = await smsGateway.sendSmsAndWait({
			message: `Baraa oroh medegdel batalgaajuulah kod: ${input.code}`,
			phoneNumbers: [`+976${input.contact}`],
		});
		if (finalState.state === "Failed") {
			throw new Error("Restock confirmation SMS failed");
		}
		return;
	}

	await sendEmail({
		to: input.contact,
		subject: "Бараа орсны мэдэгдлээ баталгаажуулна уу",
		text: `Таны баталгаажуулах код: ${input.code}\n\nКод 10 минутын хугацаанд хүчинтэй.`,
	});
}

export async function requestGuestRestockConfirmation(input: {
	productId: number;
	channel: "sms" | "email";
	contact: string;
	requestIp: string;
}) {
	const contact = normalizeRestockContact(input.channel, input.contact);
	if (!isValidRestockContact(input.channel, contact)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				input.channel === "sms"
					? "Invalid phone number"
					: "Invalid email address",
		});
	}

	await Promise.all([
		enforceRestockRateLimit({
			action: "confirmation-send",
			scope: "contact",
			value: contact,
			limit: 3,
			windowSeconds: SEND_WINDOW_SECONDS,
		}),
		enforceRestockRateLimit({
			action: "confirmation-send",
			scope: "ip",
			value: input.requestIp,
			limit: 10,
			windowSeconds: SEND_WINDOW_SECONDS,
		}),
	]);

	const challengeId = crypto.randomUUID();
	const code = createCode();
	const record = await createRestockChallengeRecord({
		challengeId,
		code,
		productId: input.productId,
		channel: input.channel,
		contact,
		now: new Date(),
		ttlMs: CHALLENGE_TTL_SECONDS * 1000,
	});
	await redis().set(challengeKey(challengeId), record, {
		ex: CHALLENGE_TTL_SECONDS,
	});

	try {
		await sendConfirmation({ channel: input.channel, contact, code });
	} catch {
		await challengeStore.delete(challengeId);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to send restock confirmation",
		});
	}

	return { challengeId, expiresInSeconds: CHALLENGE_TTL_SECONDS };
}

export async function getGuestRestockChallengeForAttempt(input: {
	challengeId: string;
	requestIp: string;
}) {
	await enforceRestockRateLimit({
		action: "confirmation-attempt",
		scope: "ip",
		value: input.requestIp,
		limit: 30,
		windowSeconds: ATTEMPT_WINDOW_SECONDS,
	});

	const challenge = await challengeStore.get(input.challengeId);
	if (!challenge || challenge.expiresAt <= Date.now()) {
		if (challenge) await challengeStore.delete(input.challengeId);
		return invalidConfirmation();
	}

	await enforceRestockRateLimit({
		action: "confirmation-attempt",
		scope: "contact",
		value: challenge.contact,
		limit: 5,
		windowSeconds: ATTEMPT_WINDOW_SECONDS,
	});
	return challenge;
}

export async function confirmGuestRestockChallenge(input: {
	challengeId: string;
	code: string;
}) {
	const result = await consumeRestockChallenge({
		store: challengeStore,
		challengeId: input.challengeId,
		code: input.code,
		now: new Date(),
	});
	if (result.status !== "confirmed") return invalidConfirmation();
	return result.challenge;
}

export async function cancelGuestRestockChallenge(challengeId: string) {
	await challengeStore.delete(challengeId);
}
