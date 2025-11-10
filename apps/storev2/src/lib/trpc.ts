import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";

// Custom error class for server-side unauthorized handling
export class UnauthorizedError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "UnauthorizedError";
	}
}

// Helper function to check if response contains UNAUTHORIZED error
const checkUnauthorized = async (response: Response): Promise<boolean> => {
	// Check HTTP status code
	if (response.status === 401) {
		return true;
	}

	// For batched requests, status might be 200 but errors are in the body
	// Clone response to read body without consuming it
	const clonedResponse = response.clone();
	try {
		const data = await clonedResponse.json();
		// tRPC batch responses are arrays
		if (Array.isArray(data)) {
			return data.some((item: unknown) => {
				const error = (
					item as { error?: { data?: { code?: string }; code?: string } }
				)?.error;
				return (
					error?.data?.code === "UNAUTHORIZED" || error?.code === "UNAUTHORIZED"
				);
			});
		}
		// Single response
		const singleData = data as {
			error?: { data?: { code?: string }; code?: string };
		};
		if (singleData?.error) {
			return (
				singleData.error.data?.code === "UNAUTHORIZED" ||
				singleData.error.code === "UNAUTHORIZED"
			);
		}
	} catch {
		// If parsing fails, just check status code
		return false;
	}

	return false;
};

const getBackendUrl = () => {
	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;
	console.log(apiUrlFromEnv);
	return apiUrlFromEnv
		? `${apiUrlFromEnv}/trpc/store`
		: "http://localhost:3000/trpc/store";
};

export const createServerClient = (
	cookies?: string,
	serverBinding?: { fetch: typeof fetch },
	redirectFn?: (path: string) => Response,
) => {
	const url = serverBinding ? "https://internal/trpc/store" : getBackendUrl();

	return createTRPCClient<StoreRouter>({
		links: [
			httpBatchLink({
				url,
				transformer: SuperJSON,
				fetch: async (url, options) => {
					const fetchFn = serverBinding?.fetch
						? serverBinding.fetch.bind(serverBinding)
						: fetch;

					const response = await fetchFn(url, {
						...options,
						credentials: "include",
						headers: {
							...(options?.headers as Record<string, string>),
							...(cookies ? { cookie: cookies } : {}),
						},
					});

					// Check for unauthorized response
					if (await checkUnauthorized(response)) {
						// If redirect function is provided, use it; otherwise throw error
						if (redirectFn) {
							redirectFn("/login");
						} else {
							throw new UnauthorizedError("Unauthorized");
						}
					}

					return response;
				},
			}),
		],
	});
};

// Client-side tRPC client
export const api = createTRPCClient<StoreRouter>({
	links: [
		httpBatchLink({
			url: getBackendUrl(),
			transformer: SuperJSON,
			fetch: async (url, options) => {
				console.log("fetching", url);
				const headers: Record<string, string> = {
					...(options?.headers as Record<string, string>),
				};

				if (typeof window !== "undefined") {
					headers.Origin = window.location.origin;
				}

				const response = await fetch(url, {
					...options,
					credentials: "include",
					headers,
				});

				// Check for unauthorized response
				if (await checkUnauthorized(response)) {
					// Prevent redirect loops - don't redirect if already on login page
					if (
						typeof window !== "undefined" &&
						window.location.pathname !== "/login"
					) {
						// Dynamically import navigate to avoid SSR issues
						const { navigate } = await import("astro:transitions/client");
						navigate("/login", { history: "replace" });
					}
				}

				return response;
			},
		}),
	],
});
