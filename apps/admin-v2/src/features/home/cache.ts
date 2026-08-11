/*
 * Home — central cache helpers.
 *
 * The home screen is read-only (UI + typed API calls only, no writes), so
 * there are no optimistic cache updates here. These helpers exist so any
 * track can refetch the home payload after order or product writes land
 * elsewhere; the 15s mounted refetch keeps the queue fresh on its own.
 */
import type { QueryClient } from "@tanstack/solid-query";

import { homeKeys } from "./queries";

/** Refetch the home payload (all time ranges) after a write elsewhere. */
export function invalidateHomeData(queryClient: QueryClient): void {
	void queryClient.invalidateQueries({ queryKey: homeKeys.all });
}
