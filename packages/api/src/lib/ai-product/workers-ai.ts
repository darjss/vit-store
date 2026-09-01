import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { parseLlmOutput } from "~/lib/ai/llm-output";
import { logger } from "~/lib/logger";

export const PRODUCT_AI_MODEL = "@cf/moonshotai/kimi-k2.6" as const;

type ProductAiInput = {
	chat_template_kwargs: { thinking: false };
	max_completion_tokens: number;
	messages: Array<{
		content:
			| string
			| Array<
					| { text: string; type: "text" }
					| {
							image_url: { detail: "high"; url: string };
							type: "image_url";
					  }
			  >;
		role: "user";
	}>;
	response_format: {
		json_schema: {
			name: string;
			schema: Record<string, unknown>;
			strict: true;
		};
		type: "json_schema";
	};
	temperature: 0;
};

type ProductAiResponse = {
	choices: Array<{ message: { content: string | null } }>;
};

export interface ProductAi {
	run(model: typeof PRODUCT_AI_MODEL, inputs: ProductAiInput): Promise<ProductAiResponse>;
}

const MAX_AI_IMAGE_BYTES = 3_000_000;

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x80_00) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x80_00));
	}
	return btoa(binary);
}

async function imageUrlToDataUrl(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: {
			Accept: "image/*",
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
		},
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(`Image fetch failed: ${response.status}`);
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.startsWith("image/")) {
		throw new Error("Image fetch returned non-image content");
	}
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_AI_IMAGE_BYTES) {
		throw new Error("Image is too large for product analysis");
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength > MAX_AI_IMAGE_BYTES) {
		throw new Error("Image is too large for product analysis");
	}
	return `data:${contentType};base64,${toBase64(bytes)}`;
}

async function prepareImageUrl(url: string): Promise<string> {
	try {
		return await imageUrlToDataUrl(url);
	} catch (error) {
		logger.warn("productAi.imageDataUrlFailed", {
			error: error instanceof Error ? error.message : "unknown",
			url,
		});
		return url;
	}
}

async function runWithRetry(ai: ProductAi, inputs: ProductAiInput) {
	try {
		return await ai.run(PRODUCT_AI_MODEL, inputs);
	} catch (error) {
		if (!(error instanceof Error) || error.name !== "InferenceUpstreamError") {
			throw error;
		}
		return ai.run(PRODUCT_AI_MODEL, inputs);
	}
}

export async function runProductAi<T extends z.ZodType>(
	ai: ProductAi,
	params: {
		imageUrls?: Array<string>;
		maxCompletionTokens?: number;
		name: string;
		prompt: string;
		schema: T;
	},
): Promise<z.infer<T>> {
	const preparedImageUrls = params.imageUrls?.length
		? await Promise.all(params.imageUrls.map(prepareImageUrl))
		: [];
	const content = preparedImageUrls.length
		? [
				{ text: params.prompt, type: "text" as const },
				...preparedImageUrls.map((url) => ({
					image_url: { detail: "high" as const, url },
					type: "image_url" as const,
				})),
			]
		: params.prompt;

	const response = await runWithRetry(ai, {
		chat_template_kwargs: { thinking: false },
		max_completion_tokens: params.maxCompletionTokens ?? 2048,
		messages: [{ content, role: "user" }],
		response_format: {
			json_schema: {
				name: params.name,
				schema: z.toJSONSchema(params.schema),
				strict: true,
			},
			type: "json_schema",
		},
		temperature: 0,
	});

	const text = response.choices[0]?.message.content;
	if (!text) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Workers AI returned no product data",
		});
	}

	try {
		return parseLlmOutput(params.schema, JSON.parse(text));
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new TRPCError({
				cause: error,
				code: "INTERNAL_SERVER_ERROR",
				message: "Workers AI returned invalid product data",
			});
		}
		throw error;
	}
}
