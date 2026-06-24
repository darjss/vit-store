import type { ZoneCandidate } from "./checkout";

// Best-effort delivery-zone candidate ranker for the Messenger checkout.
//
// The authoritative resolver work (scripts/delivery-zone-eval.ts, #26) is a
// heavy offline pipeline: it geocodes addresses, mines per-zone token "aliases"
// from historical orders, and ranks with a model. That accuracy workstream is
// tested separately and is NOT yet at a confidence threshold — so, per ADR 0005
// and CONTEXT.md, the chatbot shows TOP CANDIDATES for the customer to confirm
// rather than silently choosing a zone.
//
// This ranker is the channel-safe slice of that idea: pure, dependency-free,
// no DB and no geocode round-trip in the worker hot path. It reuses the eval
// script's cheap signal — normalized token overlap — to score the LIVE zone
// list (`order.getDeliveryAddressZones`) against the customer's address text,
// optionally boosted by the offline-mined per-zone aliases when that artifact
// is available. Output feeds the confirmation prompt; the customer picks.

// Zone as returned by the delivery integration (`{ Id, zoneName }`).
export interface DeliveryZoneInput {
	zoneId: number;
	zoneName: string;
}

// Optional offline-mined knowledge: per-zone alias tokens with frequencies,
// the same shape `delivery-zone-eval.ts aliases` emits. When absent the ranker
// degrades to matching the zone NAME tokens alone.
export interface ZoneAlias {
	token: string;
	count: number;
}

export interface ZoneKnowledge {
	zoneId: number;
	orderCount: number;
	aliases: ZoneAlias[];
}

// Tokens shorter than this, pure numbers (байр/тоот/утас digits), and a few
// structural stopwords carry no zone signal — mirrors the eval script's filter.
const STOP = new Set([
	"байр",
	"toot",
	"тоот",
	"орц",
	"давхар",
	"floor",
	"утас",
	"utas",
	"хотхон",
	"hothon",
]);

const normalize = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

export const addressTokens = (s: string): string[] =>
	normalize(s)
		.split(" ")
		.filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t));

const MAX_CANDIDATES = 5;

// Ranks zones for an address. Score combines (a) overlap with the zone NAME
// tokens and (b) overlap with the offline alias tokens (weighted by frequency,
// capped per alias as the eval script does). Zones with zero signal are kept
// only to backfill up to a small candidate count so the customer always has
// something to confirm; a confident match floats to the top.
export const rankZoneCandidates = (
	addressText: string,
	zones: DeliveryZoneInput[],
	knowledge: ZoneKnowledge[] = [],
): ZoneCandidate[] => {
	const target = new Set(addressTokens(addressText));
	const knowledgeById = new Map(knowledge.map((k) => [k.zoneId, k]));

	const scored = zones.map((zone) => {
		const evidence: string[] = [];
		let score = 0;

		const nameOverlap = addressTokens(zone.zoneName).filter((t) =>
			target.has(t),
		);
		if (nameOverlap.length > 0) {
			score += nameOverlap.length * 3;
			evidence.push(`нэр таарч байна: ${nameOverlap.join(", ")}`);
		}

		const k = knowledgeById.get(zone.zoneId);
		if (k) {
			const aliasOverlap = k.aliases
				.filter((a) => target.has(a.token))
				.slice(0, 5);
			if (aliasOverlap.length > 0) {
				score += aliasOverlap.reduce((n, a) => n + Math.min(3, a.count), 0);
				evidence.push(
					`түүхэн захиалгатай таарч байна: ${aliasOverlap.map((a) => a.token).join(", ")}`,
				);
			}
			score += Math.log1p(k.orderCount) * 0.05;
		}

		return {
			zoneId: zone.zoneId,
			zoneName: zone.zoneName,
			score,
			evidence,
		} satisfies ZoneCandidate;
	});

	const matched = scored
		.filter((c) => c.score > 0)
		.sort((a, b) => b.score - a.score || a.zoneId - b.zoneId);

	// If nothing matched, surface the highest-order-count zones (or the first
	// few) so the customer can still confirm — never return an empty list when
	// zones exist.
	if (matched.length === 0) {
		return scored
			.sort((a, b) => b.score - a.score || a.zoneId - b.zoneId)
			.slice(0, MAX_CANDIDATES);
	}
	return matched.slice(0, MAX_CANDIDATES);
};
