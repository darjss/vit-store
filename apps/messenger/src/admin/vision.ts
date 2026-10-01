import * as v from "valibot";
import { aiResponseSchema, formatAiResponseText } from "./ai-response-text";
import type { InboundImage } from "./photo";

// Workers AI binding adapter for the extract tools. Reads staged image bytes
// (already loaded from R2) and runs glm-5.3-flash vision via the AI binding.
const VISION_MODEL = "@cf/zai-org/glm-5.3-flash";

export const buildVision =
	(ai: Ai, maxTokens = 1536) =>
	async (image: InboundImage, prompt: string): Promise<string> => {
		const dataUrl = `data:${image.contentType};base64,${toBase64(image.bytes)}`;
		const response = await ai.run(VISION_MODEL, {
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
// btoa; Buffer is not in the type set). Chunked so a multi-hundred-KB photo
// doesn't overflow the argument stack.
const toBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	const CHUNK = 0x80_00;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
};
