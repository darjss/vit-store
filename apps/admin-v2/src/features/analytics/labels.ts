/*
 * Analytics vocabulary and formatting — Mongolian-first, approved copy from
 * the variant-B prototype (plans/admin-v2-ui-prototype/index.html).
 */
import type { AnalyticsRange } from "./queries";

/** Segmented control options (daily / weekly / monthly). */
export const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
	{ value: "daily", label: "Өдөр" },
	{ value: "weekly", label: "7 хоног" },
	{ value: "monthly", label: "Сар" },
];

export const RANGE_DESCRIPTIONS: Record<AnalyticsRange, string> = {
	daily: "Өнөөдрийн үзүүлэлтүүд",
	weekly: "Сүүлийн 7 хоног",
	monthly: "Сүүлийн 30 хоног",
};

/** Full-precision Mongolian currency ("161.000₮"). */
export const mnt = (value: number) =>
	`${new Intl.NumberFormat("mn-MN").format(Math.round(value))}₮`;

/**
 * Compact Mongolian currency for glance cards ("12.4 сая₮", "45.200₮").
 * Full precision below one million so small shops keep exact values; the
 * short form keeps the three glance cards aligned on 320px screens.
 */
export const compactMnt = (value: number) => `${compactNumber(value)}₮`;

/** Compact count ("12.4 сая", "345"). */
export function compactNumber(value: number): string {
	if (Math.abs(value) >= 1_000_000) {
		const millions = value / 1_000_000;
		return `${new Intl.NumberFormat("mn-MN", {
			maximumFractionDigits: 1,
		}).format(millions)} сая`;
	}
	return new Intl.NumberFormat("mn-MN").format(Math.round(value));
}

/** Plain count with Mongolian grouping ("1.234"). */
export const formatCount = (value: number) =>
	new Intl.NumberFormat("mn-MN").format(value);

/**
 * The snapshot's lastUpdated (a server ISO instant) shown in the business
 * timezone, Mongolian. The server generates it at snapshot time; rendering
 * it in Asia/Ulaanbaatar keeps the label aligned with the cache window.
 */
export function freshnessText(iso: string): string {
	return new Intl.DateTimeFormat("mn-MN", {
		timeZone: "Asia/Ulaanbaatar",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));
}

/**
 * Trend day label from a PostHog "YYYY-MM-DD" day string ("9 сарын 12").
 * Parsed as UTC midnight so formatting in Asia/Ulaanbaatar keeps the same
 * calendar day (UB is UTC+8; the snapshot window is UB-aligned).
 */
export function trendDayLabel(isoDay: string): string {
	const [year, month, day] = isoDay.split("-").map(Number);
	if (!year || !month || !day) return isoDay;
	return new Intl.DateTimeFormat("mn-MN", {
		timeZone: "Asia/Ulaanbaatar",
		month: "short",
		day: "numeric",
	}).format(new Date(Date.UTC(year, month - 1, day)));
}
