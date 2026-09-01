import { TRPCError } from "@trpc/server";
import { brandQueries, categoryQueries, purchaseQueries } from "@vit/api/queries";
import { purchaseProvider } from "@vit/shared";
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
import { db } from "~/db/client";
import { BrandsTable, ProductImagesTable, ProductsTable } from "~/db/schema";
import { parseLlmOutput } from "~/lib/ai/llm-output";
import {
	normalizeText,
	rankInvoiceLineCandidates,
	rerankAmbiguousMatches,
} from "~/lib/ai/product-match";
import { createSlug } from "~/lib/ai-product/brand-resolve";
import { DEFAULT_BRAND_LOGO_URL } from "~/lib/ai-product/constants";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
import { opencode } from "~/lib/opencode-provider";

const invoiceExtractionSchema = z.object({
	errors: z.array(z.string()),
	extractionStatus: z.enum(["success", "partial", "failed"]),
	header: z.object({
		externalOrderNumber: z.string().nullable(),
		notes: z.string().nullable(),
		orderedAt: z.string().nullable(),
		shippingCost: z.number().nullable(),
		subtotal: z.number().nullable(),
		total: z.number().nullable(),
		trackingNumber: z.string().nullable(),
	}),
	items: z.array(
		z.object({
			amount: z.string().nullable(),
			brand: z.string().nullable(),
			categoryGuess: z.string().nullable(),
			description: z.string(),
			descriptionDraft: z.string().nullable(),
			expirationDate: z.string().nullable(),
			lineTotal: z.number().nullable(),
			name_mn: z.string().nullable(),
			potency: z.string().nullable(),
			quantity: z.number().int().positive(),
			sourceCode: z.string().nullable(),
			unitPrice: z.number().nullable(),
			warnings: z.array(z.string()).default([]),
		}),
	),
	rawText: z.string().nullable(),
});
type InvoiceExtractionOutput = z.infer<typeof invoiceExtractionSchema>;
type InvoiceLineItem = InvoiceExtractionOutput["items"][number];

function parseOrderedAt(value: string | null) {
	if (!value) {
		return null;
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dedupeItems(items: Array<InvoiceLineItem>) {
	const seen = new Set<string>();
	const deduped: Array<InvoiceLineItem> = [];
	for (const item of items) {
		const key = [
			normalizeText(item.sourceCode),
			normalizeText(item.description),
			item.quantity,
			item.unitPrice ?? "",
			item.lineTotal ?? "",
		].join("|");
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(item);
	}
	return deduped;
}

type RankedInvoiceCandidates = Awaited<ReturnType<typeof rankInvoiceLineCandidates>>;

function buildAmbiguousCandidatesMap(
	rankedCandidatesByIndex: Map<number, RankedInvoiceCandidates>,
) {
	const ambiguousCandidates = new Map<
		number,
		Array<RankedInvoiceCandidates[number]["candidate"]>
	>();
	for (const [index, rankedCandidates] of rankedCandidatesByIndex.entries()) {
		const [top, second] = rankedCandidates;
		if (!top) {
			continue;
		}
		const clearlyMatched = top.score >= 0.82 && (!second || top.score - second.score >= 0.15);
		if (!clearlyMatched) {
			ambiguousCandidates.set(
				index,
				rankedCandidates.map((entry) => entry.candidate),
			);
		}
	}
	return ambiguousCandidates;
}

function resolveInvoiceLineMatch(
	rankedCandidates: RankedInvoiceCandidates,
	aiRerank: Awaited<ReturnType<typeof rerankAmbiguousMatches>> extends Map<number, infer V>
		? V
		: never,
) {
	const matched = rankedCandidates[0];
	const second = rankedCandidates[1];
	const autoMatched =
		matched && matched.score >= 0.82 && (!second || matched.score - second.score >= 0.15)
			? matched.candidate
			: null;
	const aiMatched =
		!autoMatched && aiRerank?.bestCandidateId
			? (rankedCandidates.find((entry) => entry.candidate.id === aiRerank.bestCandidateId)
					?.candidate ?? null)
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
				imageUrl: resolvedMatch.imageUrl,
				name: resolvedMatch.name,
				price: resolvedMatch.price,
			}
		: null;
	return { aiRerank, matchedProduct, matchStatus, resolvedMatch };
}

function buildInvoiceLineDraft(
	item: InvoiceLineItem,
	exactBrand: { id: number; name: string } | undefined,
	category: { id: number; name: string } | undefined,
) {
	return {
		amount: item.amount ?? "Unknown",
		brand: item.brand,
		brandId: exactBrand?.id ?? null,
		categoryId: category?.id ?? null,
		description: item.descriptionDraft ?? item.description,
		images: [],
		name: item.description,
		name_mn: item.name_mn,
		potency: item.potency ?? "Unknown",
		rawText: item.description,
		sourceCode: item.sourceCode,
	};
}

function mapMatchedInvoiceLine(
	item: InvoiceLineItem,
	index: number,
	rankedCandidatesByIndex: Map<number, RankedInvoiceCandidates>,
	aiReranks: Awaited<ReturnType<typeof rerankAmbiguousMatches>>,
	brands: Array<{ id: number; name: string }>,
	categories: Array<{ id: number; name: string }>,
) {
	const rankedCandidates = rankedCandidatesByIndex.get(index) ?? [];
	const exactBrand = brands.find(
		(brand) => normalizeText(brand.name) === normalizeText(item.brand),
	);
	const category = categories.find(
		(entry) => normalizeText(entry.name) === normalizeText(item.categoryGuess),
	);
	const { aiRerank, matchedProduct, matchStatus, resolvedMatch } = resolveInvoiceLineMatch(
		rankedCandidates,
		aiReranks.get(index),
	);

	return {
		candidateMatches: rankedCandidates.map(({ candidate }) => ({
			id: candidate.id,
			imageUrl: candidate.imageUrl,
			name: candidate.name,
			price: candidate.price,
		})),
		description: item.description,
		expirationDate: item.expirationDate,
		lineTotal: item.lineTotal ?? (item.unitPrice != null ? item.unitPrice * item.quantity : null),
		matchedProduct,
		matchStatus,
		newProductDraft: buildInvoiceLineDraft(item, exactBrand, category),
		productId: matchedProduct?.id ?? null,
		quantity: item.quantity,
		sourceCode: item.sourceCode,
		unitPrice: item.unitPrice ?? 0,
		warnings: [
			...(item.warnings ?? []),
			...(aiRerank && !resolvedMatch ? [`AI review: ${aiRerank.reason}`] : []),
		],
	};
}

function buildMatchedInvoiceHeader(
	provider: extractPurchaseFromImagesType["provider"],
	output: InvoiceExtractionOutput,
) {
	return {
		externalOrderNumber: output.header?.externalOrderNumber ?? null,
		notes: output.header?.notes ?? null,
		orderedAt: parseOrderedAt(output.header?.orderedAt ?? null),
		provider,
		shippingCost: output.header?.shippingCost ?? 0,
		subtotal: output.header?.subtotal ?? null,
		total: output.header?.total ?? null,
		trackingNumber: output.header?.trackingNumber ?? null,
	};
}

async function inferInvoiceData(
	input: extractPurchaseFromImagesType,
	brands: Array<{ id: number; name: string }>,
	categories: Array<{ id: number; name: string }>,
) {
	const { output: rawOutput } = await generateText({
		messages: [
			{
				content: [
					{
						text: `You are extracting purchase invoice data from one or more screenshot images for provider ${input.provider}.`,
						type: "text",
					},
					...input.images.map((image) => ({
						image: image.url,
						type: "image" as const,
					})),
				],
				role: "user",
			},
		],
		model: opencode("kimi-k2.5"),
		output: Output.object({ schema: invoiceExtractionSchema }),
	});
	const output = parseLlmOutput(invoiceExtractionSchema, rawOutput);
	return matchExtractedInvoiceData(input.provider, output, brands, categories);
}

export async function matchExtractedInvoiceData(
	provider: extractPurchaseFromImagesType["provider"],
	rawOutput: InvoiceExtractionOutput,
	brands: Array<{ id: number; name: string }>,
	categories: Array<{ id: number; name: string }>,
) {
	const output = rawOutput;
	const dedupedItems = dedupeItems(output.items ?? []);
	const rankedCandidatesByIndex = new Map<number, RankedInvoiceCandidates>();

	for (const [index, item] of dedupedItems.entries()) {
		rankedCandidatesByIndex.set(index, await rankInvoiceLineCandidates(item));
	}

	const ambiguousCandidates = buildAmbiguousCandidatesMap(rankedCandidatesByIndex);
	const aiReranks = await rerankAmbiguousMatches(dedupedItems, ambiguousCandidates);

	return {
		errors: output.errors ?? [],
		extractionStatus: output.extractionStatus,
		header: buildMatchedInvoiceHeader(provider, output),
		items: dedupedItems.map((item, index) =>
			mapMatchedInvoiceLine(item, index, rankedCandidatesByIndex, aiReranks, brands, categories),
		),
		rawText: output.rawText ?? null,
	};
}

async function ensureBrandId(
	tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
	brandId: number | null | undefined,
	brandName: string | null | undefined,
) {
	if (brandId) {
		return brandId;
	}
	if (!brandName?.trim()) {
		return null;
	}

	const existing = await tx.query.BrandsTable.findFirst({
		columns: { id: true },
		where: and(eq(BrandsTable.name, brandName.trim()), isNull(BrandsTable.deletedAt)),
	});
	if (existing) {
		return existing.id;
	}

	const created = await tx
		.insert(BrandsTable)
		.values({
			logoUrl: DEFAULT_BRAND_LOGO_URL,
			name: brandName.trim(),
			slug: createSlug(brandName.trim(), null, "Unknown", "Unknown"),
		})
		.returning({ id: BrandsTable.id });

	return created[0]?.id ?? null;
}

async function createProductFromDraft(
	tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
	item: saveExtractedPurchaseType["items"][number],
) {
	if (item.productId) {
		return item.productId;
	}
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
			amount: draft.amount,
			brandId: resolvedBrandId,
			categoryId: draft.categoryId,
			dailyIntake: 1,
			description: draft.description || draft.name,
			discount: 0,
			expirationDate: item.expirationDate ?? null,
			ingredients: [],
			name: draft.name,
			name_mn: draft.name_mn ?? null,
			potency: draft.potency,
			price: 0,
			seoDescription: (draft.description || draft.name).slice(0, 512),
			seoTitle: draft.name.slice(0, 256),
			slug: createSlug(draft.name, draft.brand ?? null, draft.amount, draft.potency),
			status: "draft",
			stock: 0,
			tags: draft.sourceCode ? [draft.sourceCode] : [],
			weightGrams: 0,
		})
		.returning({ id: ProductsTable.id });

	const productId = productResult[0]?.id;
	if (!productId) {
		throw new Error(`Failed to create product for line: ${draft.name}`);
	}

	if (draft.images?.length) {
		await tx.insert(ProductImagesTable).values(
			draft.images.map((image, index) => ({
				isPrimary: index === 0,
				productId,
				url: image.url,
			})),
		);
	}

	return productId;
}

function commonPurchaseProcedures<P extends typeof baseProcedure>(proc: P) {
	return {
		extractPurchaseFromImages: proc
			.input(extractPurchaseFromImagesSchema)
			.mutation(async ({ ctx, input }) => {
				try {
					const [brands, categories] = await Promise.all([
						brandQueries.admin.getAllBrands(),
						categoryQueries.admin.getAllCategories(),
					]);
					return await inferInvoiceData(input, brands, categories);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "aiPurchase.extractPurchaseFromImages",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to extract purchase invoice",
					});
				}
			}),

		saveExtractedPurchase: proc
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
							cancelledAt: null,
							externalOrderNumber: input.externalOrderNumber,
							forwarderReceivedAt: input.forwarderReceivedAt ?? null,
							items: resolvedItems,
							notes: input.notes ?? null,
							orderedAt: input.orderedAt ?? null,
							provider: input.provider,
							receivedAt: null,
							shippedAt: input.shippedAt ?? null,
							shippingCost: input.shippingCost,
							trackingNumber: input.trackingNumber ?? null,
						});

						return {
							id: created.id,
							message: "Purchase imported successfully",
						};
					});
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "aiPurchase.saveExtractedPurchase",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: error instanceof Error ? error.message : "Failed to save extracted purchase",
					});
				}
			}),
	};
}

export function buildAiPurchaseRouter<P extends typeof baseProcedure>(proc: P) {
	return router(commonPurchaseProcedures(proc));
}

export const aiPurchase = buildAiPurchaseRouter(adminProcedure);

// Bot variant: catalog matching after agent-side Workers AI vision extraction.
export const aiPurchaseBot = router({
	...commonPurchaseProcedures(botProcedure),
	matchExtractedInvoice: botProcedure
		.input(
			v.object({
				extraction: v.record(v.string(), v.unknown()),
				provider: v.picklist(purchaseProvider),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const parsed = parseLlmOutput(invoiceExtractionSchema, input.extraction);
				const [brands, categories] = await Promise.all([
					brandQueries.admin.getAllBrands(),
					categoryQueries.admin.getAllCategories(),
				]);
				return await matchExtractedInvoiceData(input.provider, parsed, brands, categories);
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "aiPurchase.matchExtractedInvoice",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to match extracted purchase invoice",
				});
			}
		}),
});
