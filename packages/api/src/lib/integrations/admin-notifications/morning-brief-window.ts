import { getStartOfDay } from "~/lib/utils";

const HOUR_MS = 60 * 60 * 1000;
// 10:00 ULAT brief → include orders since previous calendar day 11:00 ULAT.
const HOURS_FROM_CUTOFF_TO_UB_MIDNIGHT = 13;

/** Paid pending orders created on or after this instant belong in the morning brief. */
export const morningBriefOrderSince = () =>
	new Date(
		getStartOfDay().getTime() - HOURS_FROM_CUTOFF_TO_UB_MIDNIGHT * HOUR_MS,
	);
