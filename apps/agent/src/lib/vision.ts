import {
	type AiOperationError,
	type InboundImage,
	KIMI_VISION_MODEL,
} from "@vit/assistant";
import { Result } from "better-result";

const MAX_VISION_TOKENS = 1536;

type VisionFailure = Extract<
	AiOperationError,
	{ _tag: "InvalidModelOutput" } | { _tag: "ProviderUnavailable" }
>;

export const buildKimiVision =
	(ai: Ai) => async (image: InboundImage, prompt: string) => {
		const dataUrl = `data:${image.contentType};base64,${toBase64(image.bytes)}`;
		let response: unknown;
		try {
			response = await ai.run(KIMI_VISION_MODEL, {
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
		} catch {
			return Result.err<string, VisionFailure>({
				_tag: "ProviderUnavailable",
				retryable: true,
			});
		}

		const text = extractText(response)?.trim();
		return text
			? Result.ok<string, VisionFailure>(text)
			: Result.err<string, VisionFailure>({ _tag: "InvalidModelOutput" });
	};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const textFromContent = (content: unknown) => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return undefined;
	const parts: string[] = [];
	for (const part of content) {
		if (isRecord(part) && typeof part.text === "string") parts.push(part.text);
	}
	return parts.length > 0 ? parts.join("") : undefined;
};

const extractText = (response: unknown): string | undefined => {
	if (typeof response === "string") return response;
	if (!isRecord(response)) return undefined;
	if (typeof response.response === "string") return response.response;

	const firstChoice = Array.isArray(response.choices)
		? response.choices[0]
		: undefined;
	if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
		const content = textFromContent(firstChoice.message.content);
		if (content !== undefined) return content;
	}
	if (
		isRecord(response.result) &&
		typeof response.result.response === "string"
	) {
		return response.result.response;
	}
	return undefined;
};

const toBase64 = (bytes: Uint8Array) => {
	let binary = "";
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
};
