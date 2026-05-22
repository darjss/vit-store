import type { AiProductSessionState } from "@vit/shared";
import { TRPCError } from "@trpc/server";
import { kv } from "~/lib/kv";
import {
	AI_PRODUCT_SESSION_TTL,
} from "~/lib/ai-product/constants";
import { aiProductSessionKey } from "~/lib/ai-product/amazon-url";

export function createSessionId(): string {
	return crypto.randomUUID();
}

export async function readSession(
	sessionId: string,
): Promise<AiProductSessionState> {
	const session = await kv().get<AiProductSessionState>(
		aiProductSessionKey(sessionId),
		"json",
	);
	if (!session) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Extraction session expired or not found",
		});
	}
	return session;
}

export async function writeSession(
	sessionId: string,
	state: AiProductSessionState,
): Promise<void> {
	await kv().put(aiProductSessionKey(sessionId), JSON.stringify(state), {
		expirationTtl: AI_PRODUCT_SESSION_TTL,
	});
}

export async function deleteSession(sessionId: string): Promise<void> {
	await kv().delete(aiProductSessionKey(sessionId));
}

export function createInitialSession(query: string): AiProductSessionState {
	return {
		query,
		errors: [],
		status: "searching",
		extractionStatus: "success",
	};
}
