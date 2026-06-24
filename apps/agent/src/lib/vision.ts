import { type InboundImage, KIMI_VISION_MODEL } from "@vit/assistant";

// Workers AI binding adapter for the photo-identification tool. Reads the
// staged image bytes (already loaded from R2 by the tool's `loadImage`) and
// runs Kimi vision via the AI binding, returning the model's raw text for the
// channel-neutral domain to parse. env.AI is only available on the remote
// Workers AI binding (unsupported under local miniflare), so the photo path is
// a remote-only capability — see README "Photo identification".
//
// The binding speaks the OpenAI-compatible chat shape for kimi-k2.6 (same shape
// the flue Cloudflare provider uses): a user message whose content array
// carries the prompt text plus an image_url data-url.
//
// kimi-k2.6 is a REASONING model: it spends completion tokens on hidden
// `reasoning_content` before emitting the answer `content`. A budget that is
// too small is consumed entirely by reasoning, leaving an empty answer — so
// this is sized to leave ample room for the JSON answer after reasoning.
const MAX_VISION_TOKENS = 1536;

export const buildKimiVision =
	(ai: Ai) =>
	async (image: InboundImage, prompt: string): Promise<string> => {
		const dataUrl = `data:${image.contentType};base64,${toBase64(image.bytes)}`;
		const response = await ai.run(KIMI_VISION_MODEL, {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: prompt },
						{ type: "image_url", image_url: { url: dataUrl } },
					],
				},
			],
			max_tokens: MAX_VISION_TOKENS,
		});
		return extractText(response);
	};

// The AI binding's non-streamed return shape varies by model family. Pull the
// assistant text out of the shapes Workers AI / OpenAI-compat models use,
// falling back to a JSON dump so a shape change surfaces as a parse miss
// downstream rather than a silent empty string.
const extractText = (response: unknown): string => {
	if (typeof response === "string") return response;
	if (response && typeof response === "object") {
		const obj = response as Record<string, unknown>;
		if (typeof obj.response === "string") return obj.response;
		const choices = obj.choices;
		if (Array.isArray(choices) && choices.length > 0) {
			const message = (choices[0] as Record<string, unknown>)?.message as
				| Record<string, unknown>
				| undefined;
			const content = message?.content;
			if (typeof content === "string") return content;
			if (Array.isArray(content)) {
				return content
					.map((part) =>
						part && typeof part === "object"
							? String((part as Record<string, unknown>).text ?? "")
							: "",
					)
					.join("");
			}
		}
		const result = obj.result as Record<string, unknown> | undefined;
		if (result && typeof result.response === "string") return result.response;
	}
	return JSON.stringify(response);
};

// Base64-encode bytes using btoa over a binary string (workers-types provides
// btoa; Buffer is not in the agent's type set). Chunked so a multi-hundred-KB
// photo doesn't overflow the argument stack.
const toBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
};
