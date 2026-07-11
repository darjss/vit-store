export type SearchTakeoverRequestState = "loading" | "error" | "results";

interface SearchTakeoverRequestSnapshot {
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	hasCurrentData: boolean;
}

export const getSearchTakeoverRequestState = (
	snapshot: SearchTakeoverRequestSnapshot,
): SearchTakeoverRequestState => {
	if (snapshot.isError) return "error";
	if (snapshot.hasCurrentData) return "results";
	if (snapshot.isLoading || snapshot.isFetching) return "loading";

	// A settled request without data must never render as an empty panel.
	return "error";
};
