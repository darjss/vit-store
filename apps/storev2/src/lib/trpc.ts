import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";

class UnauthorizedError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "UnauthorizedError";
	}
}

const checkUnauthorized = async (response: Response): Promise<boolean> => {
	if (response.status === 401) {
		return true;
	}

	const clonedResponse = response.clone();
	try {
		const data = await clonedResponse.json();

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
		return false;
	}

	return false;
};

const getBackendUrl = () => {
	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;

	return apiUrlFromEnv
		? `${apiUrlFromEnv}/trpc/store`
		: "http://localhost:3000/trpc/store";
};

const getClientBackendUrl = () => {
	// Browser calls should stay same-origin. Facebook's in-app browser is much
	// more fragile with cross-origin fetches (it only surfaces "Load failed"),
	// so route client tRPC traffic through the Astro app and let the server proxy
	// it to the API worker.
	if (typeof window !== "undefined") {
		return "/api/trpc/";
	}

	return getBackendUrl();
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithServerRetry = async (
	fetchFn: typeof fetch,
	url: Parameters<typeof fetch>[0],
	options?: Parameters<typeof fetch>[1],
) => {
	const attempts = typeof window === "undefined" ? 3 : 1;
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fetchFn(url, options);
		} catch (error) {
			lastError = error;

			if (attempt === attempts) {
				break;
			}

			console.warn(
				`tRPC fetch failed; retrying (${attempt}/${attempts - 1})`,
				error,
			);
			await wait(500 * attempt);
		}
	}

	throw lastError;
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

					const response = await fetchWithServerRetry(fetchFn, url, {
						...options,
						credentials: "include",
						headers: {
							...(options?.headers as Record<string, string>),
							...(cookies ? { cookie: cookies } : {}),
						},
					});

					if (await checkUnauthorized(response)) {
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

const withTrailingSlashPath = (url: Parameters<typeof fetch>[0]) => {
	if (typeof window === "undefined" || typeof url !== "string") return url;

	const parsedUrl = new URL(url, window.location.origin);
	if (
		parsedUrl.pathname.startsWith("/api/trpc/") &&
		!parsedUrl.pathname.endsWith("/")
	) {
		parsedUrl.pathname = `${parsedUrl.pathname}/`;
		return parsedUrl.toString();
	}

	return url;
};

export const api = createTRPCClient<StoreRouter>({
	links: [
		httpBatchLink({
			url: getClientBackendUrl(),
			transformer: SuperJSON,
			fetch: async (url, options) => {
				const response = await fetchWithServerRetry(fetch, withTrailingSlashPath(url), {
					...options,
					credentials: "include",
					headers: options?.headers,
				});

				if (await checkUnauthorized(response)) {
					if (
						typeof window !== "undefined" &&
						window.location.pathname !== "/login"
					) {
						const { navigate } = await import("astro:transitions/client");
						navigate("/login", { history: "replace" });
					}
				}

				return response;
			},
		}),
	],
});
