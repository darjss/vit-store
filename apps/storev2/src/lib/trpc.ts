import { createTRPCClient, httpLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";
import { safeNavigate } from "@/lib/safe-navigate";

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
		return "/trpc/store";
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
			httpLink({
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

					if (redirectFn && (await checkUnauthorized(response))) {
						redirectFn("/login");
					}

					return response;
				},
			}),
		],
	});
};

export const api = createTRPCClient<StoreRouter>({
	links: [
		httpLink({
			url: getClientBackendUrl(),
			transformer: SuperJSON,
			fetch: async (url, options) => {
				const response = await fetchWithServerRetry(fetch, url, {
					...options,
					credentials: "include",
					headers: options?.headers,
				});

				if (await checkUnauthorized(response)) {
					if (
						typeof window !== "undefined" &&
						window.location.pathname !== "/login"
					) {
						// Batched tRPC requests can resolve 401s concurrently; each
						// would otherwise kick off its own view transition and the
						// second throws InvalidStateError. safeNavigate coalesces
						// them and falls back to location.assign when the tab is
						// hidden.
						void safeNavigate("/login", { history: "replace" });
					}
				}

				return response;
			},
		}),
	],
});
