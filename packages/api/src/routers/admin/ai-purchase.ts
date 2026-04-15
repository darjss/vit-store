import { google } from "@ai-sdk/google";
import { TRPCError } from "@trpc/server";
import {
	brandQueries,
	categoryQueries,
	productQueries,
	purchaseQueries,
} from "@vit/api/queries";
import {
	type addPurchaseType,
	extractPurchaseFromImagesSchema,
	type extractPurchaseFromImagesType,
	saveExtractedPurchaseSchema,
	type saveExtractedPurchaseType,
} from "@vit/shared/schema";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";
import { z } from "zod";
import { db } from "../../db/client";
import {
	BrandsTable,
	ProductImagesTable,
	ProductsTable,
} from "../../db/schema";
import { adminProcedure, router } from "../../lib/trpc";
import { searchProducts } from "../../lib/upstash-search";

const DEFAULT_BRAND_LOGO_URL = "https://www.placeholder.com/logo.png";

const invoiceExtractionSchema = z.object({
	header: z.object({
		externalOrderNumber: z.string().nullable(),
		orderedAt: z.string().nullable(),
		trackingNumber: z.string().nullable(),
		shippingCost: z.number().nullable(),
		notes: z.string().nullable(),
		subtotal: z.number().nullable(),
		total: z.number().nullable(),
	}),
	items: z.array(
		z.object({
			sourceCode: z.string().nullable(),
			description: z.string(),
			quantity: z.number().int().positive(),
			unitPrice: z.number().nullable(),
			lineTotal: z.number().nullable(),
			expirationDate: z.string().nullable(),
			brand: z.string().nullable(),
			amount: z.string().nullable(),
			potency: z.string().nullable(),
			categoryGuess: z.string().nullable(),
			name_mn: z.string().nullable(),
			descriptionDraft: z.string().nullable(),
			warnings: z.array(z.string()).default([]),
		}),
	),
	extractionStatus: z.enum(["success", "partial", "failed"]),
	errors: z.array(z.string()),
	rawText: z.string().nullable(),
});

type CandidateProduct = {
	id: number;
	name: string;
	price: number;
	imageUrl: string | null;
	brand: string | null;
	retrievalScore: number;
};

const invoiceMatchRerankSchema = z.object({
	matches: z.array(
		z.object({
			lineIndex: z.number().int().nonnegative(),
			bestCandidateId: z.number().nullable(),
			confidence: z.enum(["high", "medium", "low"]),
			reason: z.string(),
		}),
	),
});

function normalizeText(value: string | null | undefined) {
	return (value ?? "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(value: string | null | undefined) {
	return normalizeText(value)
		.split(" ")
		.filter((token) => token.length > 1);
}

function scoreProductMatch(description: string, productName: string) {
	const descriptionTokens = tokenize(description);
	const productTokens = tokenize(productName);
	if (descriptionTokens.length === 0 || productTokens.length === 0) return 0;

	const descriptionSet = new Set(descriptionTokens);
	const productSet = new Set(productTokens);
	let overlap = 0;
	for (const token of descriptionSet) {
		if (productSet.has(token)) overlap += 1;
	}

	const union = new Set([...descriptionSet, ...productSet]).size;
	const jaccard = union > 0 ? overlap / union : 0;
	const containsBoost =
		normalizeText(productName).includes(normalizeText(description)) ||
		normalizeText(description).includes(normalizeText(productName))
			? 0.2
			: 0;

	return Math.min(jaccard + containsBoost, 1);
}

function stringIncludesNeedle(
	haystack: string | null | undefined,
	needle: string | null | undefined,
) {
	const normalizedHaystack = normalizeText(haystack);
	const normalizedNeedle = normalizeText(needle);
	if (!normalizedHaystack || !normalizedNeedle) return false;
	return normalizedHaystack.includes(normalizedNeedle);
}

function buildSearchQueries(
	item: z.infer<typeof invoiceExtractionSchema>["items"][number],
) {
	const queries = [
		item.description,
		[item.brand, item.description].filter(Boolean).join(" "),
		[item.description, item.amount, item.potency].filter(Boolean).join(" "),
		[item.sourceCode, item.description].filter(Boolean).join(" "),
	]
		.map((query) => query.trim())
		.filter(Boolean);

	return Array.from(new Set(queries)).slice(0, 4);
}

async function retrieveCandidateProducts(
	item: z.infer<typeof invoiceExtractionSchema>["items"][number],
) {
	const queries = buildSearchQueries(item);
	if (queries.length === 0) return [];

	const searchResults = await Promise.all(
		queries.map((query) => searchProducts(query, 5)),
	);

	const merged = new Map<number, CandidateProduct>();

	for (const [queryIndex, results] of searchResults.entries()) {
		for (const [resultIndex, result] of results.entries()) {
			const retrievalScore = Math.max(
				0,
				1 - queryIndex * 0.12 - resultIndex * 0.08,
			);
			const existing = merged.get(result.id);
			if (!existing || retrievalScore > existing.retrievalScore) {
				merged.set(result.id, {
					id: result.id,
					name: result.name,
					price: result.price,
					imageUrl: result.image || null,
					brand: result.brand || null,
					retrievalScore,
				});
			}
		}
	}

	return [...merged.values()];
}

function scoreRetrievedCandidate(
	item: z.infer<typeof invoiceExtractionSchema>["items"][number],
	candidate: CandidateProduct,
) {
	let score =
		scoreProductMatch(item.description, candidate.name) * 0.65 +
		candidate.retrievalScore * 0.2;

	if (stringIncludesNeedle(candidate.brand, item.brand)) score += 0.14;
	if (stringIncludesNeedle(candidate.name, item.amount)) score += 0.08;
	if (stringIncludesNeedle(candidate.name, item.potency)) score += 0.08;
	if (stringIncludesNeedle(candidate.name, item.sourceCode)) score += 0.24;
	if (
		normalizeText(candidate.name) === normalizeText(item.description) &&
		normalizeText(item.description)
	) {
		score += 0.18;
	}

	return Math.min(score, 1);
}

async function rerankAmbiguousMatches(
	items: Array<z.infer<typeof invoiceExtractionSchema>["items"][number]>,
	candidatesByIndex: Map<number, CandidateProduct[]>,
) {
	if (candidatesByIndex.size === 0)
		return new Map<
			number,
			{
				bestCandidateId: number | null;
				confidence: "high" | "medium" | "low";
				reason: string;
			}
		>();

	const payload = [...candidatesByIndex.entries()].map(
		([lineIndex, candidates]) => ({
			lineIndex,
			invoiceLine: {
				sourceCode: items[lineIndex]?.sourceCode ?? null,
				description: items[lineIndex]?.description ?? "",
				brand: items[lineIndex]?.brand ?? null,
				amount: items[lineIndex]?.amount ?? null,
				potency: items[lineIndex]?.potency ?? null,
				quantity: items[lineIndex]?.quantity ?? null,
			},
			candidates: candidates.map((candidate) => ({
				id: candidate.id,
				name: candidate.name,
				brand: candidate.brand,
				retrievalScore: candidate.retrievalScore,
			})),
		}),
	);

	const { output } = await generateText({
		model: google("gemini-2.5-flash"),
		output: Output.object({ schema: invoiceMatchRerankSchema }),
		prompt: `You are resolving invoice line items to existing catalog products.

Choose the best candidate only when the evidence is strong enough. Prefer exact or near-exact product identity. If none of the candidates clearly match, return null.

Use provider context, brand, amount, potency, and product naming clues. Avoid forcing weak matches.

Input:
${JSON.stringify(payload, null, 2)}`,
	});

	return new Map(
		(output.matches ?? []).map((match) => [
			match.lineIndex,
			{
				bestCandidateId: match.bestCandidateId,
				confidence: match.confidence,
				reason: match.reason,
			},
		]),
	);
}

function parseOrderedAt(value: string | null) {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dedupeItems(
	items: Array<z.infer<typeof invoiceExtractionSchema>["items"][number]>,
) {
	const seen = new Set<string>();
	const deduped: typeof items = [];
	for (const item of items) {
		const key = [
			normalizeText(item.sourceCode),
			normalizeText(item.description),
			item.quantity,
			item.unitPrice ?? "",
			item.lineTotal ?? "",
		].join("|");
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(item);
	}
	return deduped;
}

async function inferInvoiceData(
	input: extractPurchaseFromImagesType,
	brands: { id: number; name: string }[],
	categories: { id: number; name: string }[],
) {
	const { output } = await generateText({
		model: google("gemini-2.5-flash"),
		output: Output.object({ schema: invoiceExtractionSchema }),
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `You are extracting purchase invoice data from one or more screenshot images for provider ${input.provider}.

Return structured data only from what is visible. Never invent hidden values.
Combine information across all screenshots.
If screenshots overlap, deduplicate the same invoice lines instead of repeating them.

Extract:
- header: external order number / PO number, invoice date, tracking number, shipping cost, subtotal, total, notes
- items: source/item code, description, quantity, unit price, total, expiration date if visible
- also infer lightweight product-draft hints per line when possible: brand, amount, potency, categoryGuess, Mongolian name, descriptionDraft

Rules:
- quantities must be integers
- money values should be numbers without currency symbols
- if line total is missing, leave it null
- if expiration date is missing, leave it null
- if uncertain, add a warning to that line
- extractionStatus should be "partial" if important fields are missing, "failed" if almost nothing usable is found
`,
					},
					...input.images.map((image) => ({
						type: "image" as const,
						image: image.url,
					})),
				],
			},
		],
	});

	const dedupedItems = dedupeItems(output.items ?? []);
	const rankedCandidatesByIndex = new Map<
		number,
		Array<{ candidate: CandidateProduct; score: number }>
	>();

	for (const [index, item] of dedupedItems.entries()) {
		const candidates = await retrieveCandidateProducts(item);
		const rankedCandidates = candidates
			.map((candidate) => ({
				candidate,
				score: scoreRetrievedCandidate(item, candidate),
			}))
			.filter((entry) => entry.score > 0.2)
			.sort((a, b) => b.score - a.score)
			.slice(0, 5);

		rankedCandidatesByIndex.set(index, rankedCandidates);
	}

	const ambiguousCandidates = new Map<number, CandidateProduct[]>();
	for (const [index, rankedCandidates] of rankedCandidatesByIndex.entries()) {
		const [top, second] = rankedCandidates;
		if (!top) continue;
		const clearlyMatched =
			top.score >= 0.82 && (!second || top.score - second.score >= 0.15);
		if (!clearlyMatched) {
			ambiguousCandidates.set(
				index,
				rankedCandidates.map((entry) => entry.candidate),
			);
		}
	}

	const aiReranks = await rerankAmbiguousMatches(
		dedupedItems,
		ambiguousCandidates,
	);

	return {
		header: {
			provider: input.provider,
			externalOrderNumber: output.header?.externalOrderNumber ?? null,
			orderedAt: parseOrderedAt(output.header?.orderedAt ?? null),
			trackingNumber: output.header?.trackingNumber ?? null,
			shippingCost: output.header?.shippingCost ?? 0,
			notes: output.header?.notes ?? null,
			subtotal: output.header?.subtotal ?? null,
			total: output.header?.total ?? null,
		},
		items: dedupedItems.map((item, index) => {
			const rankedCandidates = rankedCandidatesByIndex.get(index) ?? [];
			const matched = rankedCandidates[0];
			const second = rankedCandidates[1];
			const exactBrand = brands.find(
				(brand) => normalizeText(brand.name) === normalizeText(item.brand),
			);
			const category = categories.find(
				(entry) =>
					normalizeText(entry.name) === normalizeText(item.categoryGuess),
			);

			const aiRerank = aiReranks.get(index);
			const autoMatched =
				matched &&
				matched.score >= 0.82 &&
				(!second || matched.score - second.score >= 0.15)
					? matched.candidate
					: null;
			const aiMatched =
				!autoMatched && aiRerank?.bestCandidateId
					? (rankedCandidates.find(
							(entry) => entry.candidate.id === aiRerank.bestCandidateId,
						)?.candidate ?? null)
					: null;

			const resolvedMatch = autoMatched ?? aiMatched;
			const matchStatus = resolvedMatch
				? "matched"
				: rankedCandidates.length > 0
					? "ambiguous"
					: "unmatched";

			const matchedProduct = resolvedMatch
				? {
						id: resolvedMatch.id,
						name: resolvedMatch.name,
						price: resolvedMatch.price,
						imageUrl: resolvedMatch.imageUrl,
					}
				: null;

			return {
				sourceCode: item.sourceCode,
				description: item.description,
				quantity: item.quantity,
				unitPrice: item.unitPrice ?? 0,
				lineTotal:
					item.lineTotal ??
					(item.unitPrice != null ? item.unitPrice * item.quantity : null),
				expirationDate: item.expirationDate,
				matchStatus,
				productId: matchedProduct?.id ?? null,
				matchedProduct,
				candidateMatches: rankedCandidates.map(({ candidate }) => ({
					id: candidate.id,
					name: candidate.name,
					price: candidate.price,
					imageUrl: candidate.imageUrl,
				})),
				newProductDraft: {
					name: item.description,
					name_mn: item.name_mn,
					description: item.descriptionDraft ?? item.description,
					brand: item.brand,
					brandId: exactBrand?.id ?? null,
					categoryId: category?.id ?? null,
					amount: item.amount ?? "Unknown",
					potency: item.potency ?? "Unknown",
					images: [],
					sourceCode: item.sourceCode,
					rawText: item.description,
				},
				warnings: [
					...(item.warnings ?? []),
					...(aiRerank && !resolvedMatch
						? [`AI review: ${aiRerank.reason}`]
						: []),
				],
			};
		}),
		extractionStatus: output.extractionStatus,
		errors: output.errors ?? [],
		rawText: output.rawText ?? null,
	};
}

async function ensureBrandId(
	tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
	brandId: number | null | undefined,
	brandName: string | null | undefined,
) {
	if (brandId) return brandId;
	if (!brandName?.trim()) return null;

	const existing = await tx.query.BrandsTable.findFirst({
		where: and(
			eq(BrandsTable.name, brandName.trim()),
			isNull(BrandsTable.deletedAt),
		),
		columns: { id: true },
	});
	if (existing) return existing.id;

	const created = await tx
		.insert(BrandsTable)
		.values({
			name: brandName.trim(),
			logoUrl: DEFAULT_BRAND_LOGO_URL,
		})
		.returning({ id: BrandsTable.id });
	return created[0]?.id ?? null;
}

function createSlug(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function createProductFromDraft(
	tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
	item: saveExtractedPurchaseType["items"][number],
) {
	if (item.productId) return item.productId;
	const draft = item.newProductDraft;
	if (!draft) {
		throw new Error(`Unresolved product for line: ${item.description}`);
	}

	const resolvedBrandId = await ensureBrandId(tx, draft.brandId, draft.brand);
	if (!resolvedBrandId || !draft.categoryId) {
		throw new Error(`Draft product is missing brand/category: ${draft.name}`);
	}

	const productResult = await tx
		.insert(ProductsTable)
		.values({
			name: draft.name,
			slug: createSlug(draft.name),
			description: draft.description || draft.name,
			status: "draft",
			discount: 0,
			amount: draft.amount,
			potency: draft.potency,
			stock: 0,
			price: 0,
			dailyIntake: 1,
			categoryId: draft.categoryId,
			brandId: resolvedBrandId,
			name_mn: draft.name_mn ?? null,
			ingredients: [],
			tags: draft.sourceCode ? [draft.sourceCode] : [],
			seoTitle: draft.name.slice(0, 256),
			seoDescription: (draft.description || draft.name).slice(0, 512),
			weightGrams: 0,
			expirationDate: item.expirationDate ?? null,
		})
		.returning({ id: ProductsTable.id });

	const productId = productResult[0]?.id;
	if (!productId) {
		throw new Error(`Failed to create product for line: ${draft.name}`);
	}

	if (draft.images?.length) {
		await tx.insert(ProductImagesTable).values(
			draft.images.map((image, index) => ({
				productId,
				url: image.url,
				isPrimary: index === 0,
			})),
		);
	}

	return productId;
}

export const aiPurchase = router({
	extractPurchaseFromImages: adminProcedure
		.input(extractPurchaseFromImagesSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const [brands, categories] = await Promise.all([
					brandQueries.admin.getAllBrands(),
					categoryQueries.admin.getAllCategories(),
				]);
				return await inferInvoiceData(input, brands, categories);
			} catch (error) {
				ctx.log.error("aiPurchase.extractPurchaseFromImages", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to extract purchase invoice",
					cause: error,
				});
			}
		}),

	saveExtractedPurchase: adminProcedure
		.input(saveExtractedPurchaseSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await db().transaction(async (tx) => {
					const resolvedItems: addPurchaseType["items"] = [];
					for (const item of input.items) {
						const productId = await createProductFromDraft(tx, item);
						resolvedItems.push({
							productId,
							quantityOrdered: item.quantity,
							unitCost: item.unitPrice,
						});
					}

					const created = await purchaseQueries.admin.createPurchase(tx, {
						provider: input.provider,
						externalOrderNumber: input.externalOrderNumber,
						trackingNumber: input.trackingNumber ?? null,
						shippingCost: input.shippingCost,
						notes: input.notes ?? null,
						orderedAt: input.orderedAt ?? null,
						shippedAt: input.shippedAt ?? null,
						forwarderReceivedAt: input.forwarderReceivedAt ?? null,
						receivedAt: null,
						cancelledAt: null,
						items: resolvedItems,
					});

					return {
						id: created.id,
						message: "Purchase imported successfully",
					};
				});
			} catch (error) {
				ctx.log.error("aiPurchase.saveExtractedPurchase", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to save extracted purchase",
					cause: error,
				});
			}
		}),
});
