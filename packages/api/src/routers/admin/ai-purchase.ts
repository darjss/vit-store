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
import type { Context } from "~/lib/context";
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
type InvoiceExtractionOutput = z.infer<typeof invoiceExtractionSchema>;
type InvoiceLineItem = InvoiceExtractionOutput["items"][number];

function parseOrderedAt(value: string | null) {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dedupeItems(items: InvoiceLineItem[]) {
	const seen = new Set<string>();
	const deduped: InvoiceLineItem[] = [];
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
	const { output: rawOutput } = await generateText({
		model: opencode("kimi-k2.5"),
		output: Output.object({ schema: invoiceExtractionSchema }),
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `You are extracting purchase invoice data from one or more screenshot images for provider ${input.provider}.`,
					},
					...input.images.map((image) => ({
						type: "image" as const,
						image: image.url,
					})),
				],
			},
		],
	});
	const output = parseLlmOutput(invoiceExtractionSchema, rawOutput);
	const dedupedItems = dedupeItems(output.items ?? []);
	const rankedCandidatesByIndex = new Map<
		number,
		Awaited<ReturnType<typeof rankInvoiceLineCandidates>>
	>();

	for (const [index, item] of dedupedItems.entries()) {
		rankedCandidatesByIndex.set(index, await rankInvoiceLineCandidates(item));
	}

	const ambiguousCandidates = new Map<
		number,
		Awaited<ReturnType<typeof rankInvoiceLineCandidates>>[number]["candidate"][]
	>();
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

	const aiReranks = await rerankAmbiguousMatches(dedupedItems, ambiguousCandidates);

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
			slug: createSlug(brandName.trim(), null, "Unknown", "Unknown"),
			logoUrl: DEFAULT_BRAND_LOGO_URL,
		})
		.returning({ id: BrandsTable.id });

	return created[0]?.id ?? null;
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
			slug: createSlug(draft.name, draft.brand ?? null, draft.amount, draft.potency),
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

// Resolve R2 object keys (staged by the Messenger webhook under
// messenger-inbound/) into data: URLs the vision model can ingest. The chat
// path receives R2 keys, not fetchable CDN urls — the dashboard path passes
// real urls. Server-side resolution keeps the agent sandbox network-isolated.
async function resolveR2ImageKeysToUrls(
	ctx: Context,
	keys: string[],
): Promise<{ url: string }[]> {
	const out: { url: string }[] = [];
	for (const key of keys) {
		try {
			const object = await ctx.r2.get(key);
			if (object === null) continue;
			const bytes = new Uint8Array(await object.arrayBuffer());
			const contentType =
				object.httpMetadata?.contentType?.startsWith("image/")
					? object.httpMetadata.contentType
					: "image/jpeg";
			out.push({ url: `data:${contentType};base64,${bytesToBase64(bytes)}` });
		} catch (error) {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "aiPurchase.resolveR2ImageKeysToUrls",
				key,
			});
		}
	}
	return out;
}

// Chunked base64 encoder: String.fromCharCode(...bytes) stack-overflows on
// large screenshots, so encode in 32KB slices.
function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
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
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "aiPurchase.extractPurchaseFromImages" },
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to extract purchase invoice",
						cause: error,
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
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "aiPurchase.saveExtractedPurchase" },
					);
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
	};
}

export function buildAiPurchaseRouter<P extends typeof baseProcedure>(proc: P) {
	return router(commonPurchaseProcedures(proc));
}

export const aiPurchase = buildAiPurchaseRouter(adminProcedure);

// Bot variant: the two common procedures plus a chat-only
// `extractPurchaseFromImageKeys` that resolves R2-staged inbound image keys
// server-side. The dashboard path keeps using `extractPurchaseFromImages`
// with real urls; the chat path receives R2 keys from the webhook staging.
export const aiPurchaseBot = router({
	...commonPurchaseProcedures(botProcedure),
	extractPurchaseFromImageKeys: botProcedure
		.input(
			v.object({
				provider: v.picklist(purchaseProvider),
				imageKeys: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const images = await resolveR2ImageKeysToUrls(ctx, input.imageKeys);
				if (images.length === 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"No staged images could be resolved from the provided keys. They may have expired.",
					});
				}
				const [brands, categories] = await Promise.all([
					brandQueries.admin.getAllBrands(),
					categoryQueries.admin.getAllCategories(),
				]);
				return await inferInvoiceData(
					{ provider: input.provider, images },
					brands,
					categories,
				);
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{ event: "aiPurchase.extractPurchaseFromImageKeys" },
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to extract purchase invoice from images",
					cause: error,
				});
			}
		}),
});
