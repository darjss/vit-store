export type SearchTakeoverRequestState = "loading" | "error" | "results";

type QueryStatus = "pending" | "error" | "success";
type FetchStatus = "fetching" | "paused" | "idle";

interface SearchTakeoverRequestSnapshot {
	status: QueryStatus;
	fetchStatus: FetchStatus;
	isLoadingError: boolean;
	isRefetchError: boolean;
	hasCurrentData: boolean;
}

export const getSearchTakeoverRequestState = (
	snapshot: SearchTakeoverRequestSnapshot,
): SearchTakeoverRequestState => {
	if (snapshot.hasCurrentData) return "results";
	if (snapshot.isLoadingError) return "error";
	if (
		snapshot.status === "pending" ||
		snapshot.fetchStatus !== "idle" ||
		snapshot.isRefetchError
	) {
		return "loading";
	}

	// Current-query data can briefly be absent while the observer changes keys.
	return "loading";
};
