import { google } from "@ai-sdk/google";
import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import { generateText, Output } from "ai";
import * as v from "valibot";
import { z } from "zod";
import { publicProcedure, router } from "../../lib/trpc";
import type {
	StoreAssistantDisplayType,
	StoreAssistantPageContext,
	StoreAssistantResponse,
} from "../../lib/types";
import { searchProducts } from "../../lib/upstash-search";

const assistantResponseSchema = z.object({
	answer: z.string().min(1),
	displayType: z.enum(["none", "single-product", "product-carousel"]),
	productIds: z.array(z.number().int().positive()).max(5).default([]),
});

type AssistantSearchToolResult = {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
	stockStatus: "in_stock" | "low_stock" | "out_of_stock";
};

const messageSchema = v.object({
	role: v.picklist(["user", "assistant"]),
	content: v.pipe(v.string(), v.minLength(1), v.maxLength(4000)),
});

const pageContextSchema = v.object({
	path: v.optional(v.string()),
	productId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	searchQuery: v.optional(v.string()),
});

function mapStockStatus(
	status: string,
	stock: number,
): AssistantSearchToolResult["stockStatus"] {
	if (status === "out_of_stock" || stock <= 0) return "out_of_stock";
	if (stock <= 5) return "low_stock";
	return "in_stock";
}

async function getAssistantSearchProducts(input: {
	query: string;
	limit: number;
	brandId?: number;
	categoryId?: number;
}) {
	const searchResults = await searchProducts(input.query, input.limit, {
		brandId: input.brandId,
		categoryId: input.categoryId,
	});

	if (searchResults.length === 0) {
		return [];
	}

	const ids = searchResults.map((result) => result.id);
	const canonicalProducts =
		await productQueries.store.getProductsByIdsWithDetails(ids);
	const canonicalById = new Map(
		canonicalProducts.map((product) => [product.id, product]),
	);

	return ids
		.map((id) => canonicalById.get(id))
		.filter((product): product is NonNullable<typeof product> => !!product)
		.map((product) => ({
			id: product.id,
			slug: product.slug,
			name: product.name,
			price: product.price,
			image: product.images[0]?.url || "",
			brand: product.brand?.name || "",
			stockStatus: mapStockStatus(product.status, product.stock),
		}));
}

async function getAssistantProductInfo(productId: number) {
	const product = await productQueries.store.getProductById(productId);
	if (!product) {
		return null;
	}

	const stockInfo = await productQueries.store.getProductStockStatus(productId);

	return {
		id: product.id,
		name: product.name,
		price: product.price,
		status: product.status,
		description: product.description,
		amount: product.amount,
		potency: product.potency,
		dailyIntake: product.dailyIntake,
		ingredients: product.ingredients,
		brand: product.brand?.name ?? null,
		category: product.category?.name ?? null,
		images: product.images.map((image) => image.url),
		stock: stockInfo?.stock ?? 0,
	};
}

async function retrieveAssistantContext(input: {
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	pageContext?: StoreAssistantPageContext;
}) {
	const userMessages = input.messages.filter(
		(message) => message.role === "user",
	);
	const latestUserMessage = userMessages.at(-1)?.content.trim() ?? "";
	const previousUserMessage = userMessages.at(-2)?.content.trim() ?? "";
	const queries = Array.from(
		new Set(
			[
				latestUserMessage,
				previousUserMessage,
				input.pageContext?.searchQuery?.trim(),
			].filter((value): value is string => Boolean(value && value.length > 0)),
		),
	).slice(0, 3);

	const retrievedProducts = new Map<number, AssistantSearchToolResult>();

	for (const query of queries) {
		const results = await getAssistantSearchProducts({
			query,
			limit: query === latestUserMessage ? 5 : 3,
		});

		for (const product of results) {
			if (!retrievedProducts.has(product.id)) {
				retrievedProducts.set(product.id, product);
			}
		}
	}

	const detailedProducts = new Map<
		number,
		Awaited<ReturnType<typeof getAssistantProductInfo>>
	>();

	if (input.pageContext?.productId) {
		const pageProduct = await getAssistantProductInfo(
			input.pageContext.productId,
		);
		if (pageProduct) {
			detailedProducts.set(pageProduct.id, pageProduct);
		}
	}

	for (const productId of retrievedProducts.keys()) {
		const product = await getAssistantProductInfo(productId);
		if (product) {
			detailedProducts.set(product.id, product);
		}
	}

	return {
		latestUserMessage,
		retrievedProducts: [...retrievedProducts.values()],
		detailedProducts: [...detailedProducts.values()].filter(
			(product): product is NonNullable<typeof product> => product !== null,
		),
	};
}

function buildCatalogContext(
	products: Awaited<
		ReturnType<typeof retrieveAssistantContext>
	>["detailedProducts"],
) {
	if (products.length === 0) {
		return "No matching products were found in the catalog.";
	}

	return products
		.map((product) =>
			[
				`Product ID: ${product.id}`,
				`Name: ${product.name}`,
				`Brand: ${product.brand ?? "Unknown"}`,
				`Category: ${product.category ?? "Unknown"}`,
				`Price: ${product.price}`,
				`Status: ${product.status}`,
				`Stock: ${product.stock}`,
				`Amount: ${product.amount}`,
				`Potency: ${product.potency}`,
				`Daily intake: ${product.dailyIntake}`,
				`Description: ${product.description}`,
				`Ingredients: ${product.ingredients.join(", ")}`,
			].join("\n"),
		)
		.join("\n\n---\n\n");
}

function buildConversationPrompt(
	messages: Array<{ role: "user" | "assistant"; content: string }>,
	pageContext?: StoreAssistantPageContext,
) {
	const history = messages
		.map((message) => {
			const role = message.role === "user" ? "User" : "Assistant";
			return `${role}: ${message.content.trim()}`;
		})
		.join("\n\n");

	const pageSummary = pageContext
		? [
				pageContext.path ? `Path: ${pageContext.path}` : null,
				pageContext.productId
					? `Product ID on page: ${pageContext.productId}`
					: null,
				pageContext.searchQuery
					? `Current search query: ${pageContext.searchQuery}`
					: null,
			]
				.filter(Boolean)
				.join("\n")
		: "";

	return [
		pageSummary ? `Storefront context:\n${pageSummary}` : null,
		"Conversation history:",
		history,
	]
		.filter(Boolean)
		.join("\n\n");
}

function normalizeAssistantResponse(
	response: z.infer<typeof assistantResponseSchema>,
	availableProductIds: Set<number>,
): StoreAssistantResponse {
	const uniqueProductIds = Array.from(
		new Set(
			response.productIds.filter((productId) =>
				availableProductIds.has(productId),
			),
		),
	).slice(0, 5);

	let displayType: StoreAssistantDisplayType = response.displayType;
	let productIds = uniqueProductIds;

	if (displayType === "single-product") {
		productIds = productIds.slice(0, 1);
		if (productIds.length === 0) displayType = "none";
	}

	if (displayType === "product-carousel") {
		if (productIds.length <= 1) {
			displayType = productIds.length === 1 ? "single-product" : "none";
			productIds = productIds.slice(0, 1);
		}
	}

	if (displayType === "none") {
		productIds = [];
	}

	return {
		answer: response.answer.trim(),
		displayType,
		productIds,
	};
}

const systemPrompt = `You are the shopping assistant for a Mongolian vitamin and supplements storefront.

Goals:
- Help users decide what product to buy based on their needs.
- Default to Mongolian unless the user writes in English.
- Be concise, direct, and commercially useful.
- Prefer one best recommendation when enough evidence exists.

Rules:
- Only mention products that exist in the provided catalog context.
- Prefer in-stock products.
- If the user needs options or comparisons, you may show 2 to 5 products.
- Ask at most 1 to 3 short clarifying questions when needed.
- Do not diagnose, treat, or make medical promises.
- Reframe medical questions into gentle product guidance.
- Return structured output only based on the provided catalog context.

Display rules:
- Use "none" when no product card should be shown.
- Use "single-product" when recommending one product.
- Use "product-carousel" when comparing or presenting multiple products.
- productIds must match products that exist in the provided catalog context.
- If there is no strong match, ask a concise follow-up question and use "none".`;

export const aiAssistant = router({
	chat: publicProcedure
		.input(
			v.object({
				messages: v.pipe(
					v.array(messageSchema),
					v.minLength(1),
					v.maxLength(20),
				),
				locale: v.optional(v.string()),
				pageContext: v.optional(pageContextSchema),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const prompt = buildConversationPrompt(
					input.messages,
					input.pageContext,
				);
				const retrieval = await retrieveAssistantContext({
					messages: input.messages,
					pageContext: input.pageContext,
				});
				const availableProductIds = new Set(
					retrieval.detailedProducts.map((product) => product.id),
				);
				const catalogContext = buildCatalogContext(retrieval.detailedProducts);

				const { output } = await generateText({
					model: google("gemini-2.5-flash"),
					system: systemPrompt,
					prompt: `${prompt}

Latest user message:
${retrieval.latestUserMessage || "N/A"}

Catalog context:
${catalogContext}`,
					output: Output.object({ schema: assistantResponseSchema }),
				});

				return normalizeAssistantResponse(output, availableProductIds);
			} catch (error) {
				ctx.log.error("store.aiAssistant.chat_failed", error, {
					messageCount: input.messages.length,
					pageContext: input.pageContext,
					errorMessage: error instanceof Error ? error.message : String(error),
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get assistant response",
					cause: error,
				});
			}
		}),
});
