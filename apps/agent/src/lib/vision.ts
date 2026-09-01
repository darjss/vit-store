import * as v from "valibot";
import { type InboundImage, KIMI_VISION_MODEL } from "@vit/assistant";
import { aiResponseSchema, formatAiResponseText } from "./ai-response-text";

// Workers AI binding adapter for the photo-identification tool. Reads staged
// image bytes from R2 and runs glm-5.3-flash vision via the AI binding.
const MAX_VISION_TOKENS = 1536;

export const buildKimiVision =
	(ai: Ai, maxTokens = MAX_VISION_TOKENS) =>
	async (image: InboundImage, prompt: string): Promise<string> => {
		const dataUrl = `data:${image.contentType};base64,${toBase64(image.bytes)}`;
		const response = await ai.run(KIMI_VISION_MODEL, {
			max_tokens: maxTokens,
			messages: [
				{
					content: [
						{ text: prompt, type: "text" },
						{ image_url: { url: dataUrl }, type: "image_url" },
					],
					role: "user",
				},
			],
		});
		const parsed = v.safeParse(aiResponseSchema, response);
		return parsed.success ? formatAiResponseText(parsed.output) : JSON.stringify(response);
	};

// Base64-encode bytes using btoa over a binary string (workers-types provides
// btoa; Buffer is not in the agent's type set). Chunked so a multi-hundred-KB
// photo doesn't overflow the argument stack.
const toBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	const CHUNK = 0x80_00;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
};
