import { generateText, Output } from "ai";
import { z } from "zod";
import { parseLlmOutput } from "~/lib/ai/llm-output";
import { opencode } from "~/lib/opencode-provider";
import { searchProducts } from "~/lib/product-search/client";

export function normalizeText(value: string | null | undefined) {
	return (value ?? "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function tokenize(value: string | null | undefined) {
	return normalizeText(value)
		.split(" ")
		.filter((token) => token.length > 1);
}

export function scoreProductMatch(description: string, productName: string) {
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

export type CandidateProduct = {
	id: number;
	name: string;
	price: number;
	imageUrl: string | null;
	brand: string | null;
	retrievalScore: number;
};

export type InvoiceLineForMatch = {
	sourceCode?: string | null;
	description: string;
	brand?: string | null;
	amount?: string | null;
	potency?: string | null;
	quantity?: number | null;
};

function buildSearchQueries(item: InvoiceLineForMatch) {
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

export async function retrieveCandidateProducts(item: InvoiceLineForMatch) {
	const queries = buildSearchQueries(item);
	if (queries.length === 0) return [];

	const searchResults = await Promise.all(
		queries.map((query) => searchProducts(query, 5)),
	);
	const merged = new Map<number, CandidateProduct>();

	for (const [queryIndex, results] of searchResults.entries()) {
		for (const [resultIndex, result] of results.entries()) {
			const retrievalScore = Math.max(0, 1 - queryIndex * 0.12 - resultIndex * 0.08);
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

export function scoreRetrievedCandidate(
	item: InvoiceLineForMatch,
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

export async function rerankAmbiguousMatches<
	T extends InvoiceLineForMatch,
>(
	items: T[],
	candidatesByIndex: Map<number, CandidateProduct[]>,
) {
	if (candidatesByIndex.size === 0) {
		return new Map<
			number,
			{
				bestCandidateId: number | null;
				confidence: "high" | "medium" | "low";
				reason: string;
			}
		>();
	}

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

	const { output: rawOutput } = await generateText({
		model: opencode("kimi-k2.5"),
		output: Output.object({ schema: invoiceMatchRerankSchema }),
		prompt: `You are resolving invoice line items to existing catalog products.

Choose the best candidate only when the evidence is strong enough. Prefer exact or near-exact product identity. If none of the candidates clearly match, return null.

Input:
${JSON.stringify(payload, null, 2)}`,
	});

	const output = parseLlmOutput(invoiceMatchRerankSchema, rawOutput);

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

export async function rankInvoiceLineCandidates<T extends InvoiceLineForMatch>(
	item: T,
) {
	const candidates = await retrieveCandidateProducts(item);
	return candidates
		.map((candidate) => ({
			candidate,
			score: scoreRetrievedCandidate(item, candidate),
		}))
		.filter((entry) => entry.score > 0.2)
		.sort((a, b) => b.score - a.score)
		.slice(0, 5);
}
