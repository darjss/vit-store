import { cardTitle, mnt, STOCK_LABEL } from "./copy";
import type { Env } from "./env";
import { storeClient, withTimeout } from "./store";
import type { ReplyResult } from "./tools";
import { send } from "./zernio";

const CDN_PREFIX = "https://cdn.amerikvitamin.mn/";

// Most product photos are tall bottles and Messenger crops card images to
// fill, so Cloudflare pads CDN-hosted photos onto a white square first.
// External URLs (e.g. m.media-amazon.com) return 403 from /cdn-cgi/image,
// so pass them through directly.
export const squareImage = (url: string) =>
	url.startsWith(CDN_PREFIX)
		? `${CDN_PREFIX}cdn-cgi/image/width=600,height=600,fit=pad,background=white,format=jpeg/${url}`
		: url;

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
	reply: ReplyResult;
	turnId: string;
}): Promise<Array<number>> => {
	const { accountId, conversationId, env, hasSent, markSent, reply, turnId } = opts;
	const text = reply.text?.trim() ?? "";

	const textKey = `${turnId}:text`;
	if (text.length > 0 && !hasSent(textKey)) {
		await send(env, conversationId, { accountId, message: text }, textKey);
		markSent(textKey);
	}

	// Confirmation sends the summary right after, so cards there would duplicate.
	const ids = reply.action === undefined ? (reply.productIds ?? []).slice(0, 6) : [];
	const cardsKey = `${turnId}:cards`;
	if (ids.length > 0 && !hasSent(cardsKey)) {
		if (await sendCards({ accountId, conversationId, env, ids, key: cardsKey })) {
			markSent(cardsKey);
		}
	}
	return hasSent(cardsKey) ? ids : [];
};

// One product carousel, up to 10 cards. False when none of the ids exist.
export const sendCards = async (opts: {
	accountId: string;
	conversationId: string;
	env: Env;
	ids: Array<number>;
	key: string;
}): Promise<boolean> => {
	const { accountId, conversationId, env, ids, key } = opts;
	const products = await storeClient(env).product.getProductsByIdsForAssistant.query(
		{ ids: ids.slice(0, 10) },
		{ signal: withTimeout() },
	);
	if (products.length === 0) {
		return false;
	}
	const [only] = products;
	// Single in-stock product: send a full zoomable bottle photo (Mom's UX)
	// instead of a 1-card generic carousel widget with a "Сонгох" button.
	if (
		products.length === 1 &&
		only !== undefined &&
		only.stockStatus !== "out_of_stock" &&
		only.image
	) {
		await send(
			env,
			conversationId,
			{
				accountId,
				attachmentType: "image",
				attachmentUrl: squareImage(only.image),
			},
			key,
		);
		return true;
	}
	await send(
		env,
		conversationId,
		{
			accountId,
			template: {
				elements: products.slice(0, 10).map((p) => ({
					// A sold-out card shows "Дууссан" and nothing to tap.
					buttons:
						p.stockStatus === "out_of_stock"
							? undefined
							: [
									{
										payload: `order_product:${p.id}`,
										title: "Сонгох",
										type: "postback" as const,
									},
								],
					imageUrl: p.image ? squareImage(p.image) : undefined,
					subtitle: `${mnt(p.price)} · ${STOCK_LABEL[p.stockStatus]}`,
					title: cardTitle(p.name, p.brand),
				})),
				imageAspectRatio: "square",
				type: "generic" as const,
			},
		},
		key,
	);
	return true;
};
