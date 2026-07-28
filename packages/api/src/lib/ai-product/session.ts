import type { AiProductSessionState } from "@vit/shared";
import { kv } from "~/lib/kv";
import { AI_PRODUCT_SESSION_TTL } from "~/lib/ai-product/constants";
import { aiProductSessionKey } from "~/lib/ai-product/amazon-url";

export function createSessionId(): string {
	return crypto.randomUUID();
}

export async function readSession(sessionId: string) {
	return kv().get<AiProductSessionState>(
		aiProductSessionKey(sessionId),
		"json",
	);
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
