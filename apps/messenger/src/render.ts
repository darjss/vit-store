import { send } from "./zernio";
import { storeClient, withTimeout } from "./store";
import type { Env } from "./env";
import type { ReplyPayload } from "./tools";

// Renders a model turn into Zernio sends. Every part key is deterministic
// (${turn}:text, ${turn}:cards) and recorded in `outbox` only after a
// successful send, so a retried or re-processed turn skips parts that already
// went out.
export const renderTurn = async (opts: {
	accountId: string;
	conversationId: string;
	env: Env;
	hasSent: (key: string) => boolean;
	markSent: (key: string) => void;
	reply: ReplyPayload;
	turnId: string;
}): Promise<void> => {
	const { accountId, conversationId, env, hasSent, markSent, reply, turnId } = opts;

	const textKey = `${turnId}:text`;
	if (!hasSent(textKey)) {
		await send(env, conversationId, { accountId, message: reply.text }, textKey);
		markSent(textKey);
	}

	const ids = reply.productIds ?? [];
	const cardsKey = `${turnId}:cards`;
	if (ids.length > 0 && !hasSent(cardsKey)) {
		const products = await storeClient(env).product.getProductsByIdsForAssistant.query(
			{ ids: ids.slice(0, 10) },
			{ signal: withTimeout() },
		);
		if (products.length > 0) {
			await send(
				env,
				conversationId,
				{
					accountId,
					template: {
						elements: products.slice(0, 10).map((p) => ({
							buttons: [
								{
									payload: `order_product:${p.id}`,
									title: "Захиалах",
									type: "postback" as const,
								},
							],
							imageUrl: p.image || undefined,
							subtitle: `${p.price}₮ · ${p.stockStatus}`,
							title: p.name.slice(0, 80),
						})),
						type: "generic" as const,
					},
				},
				cardsKey,
			);
			markSent(cardsKey);
		}
	}
};
