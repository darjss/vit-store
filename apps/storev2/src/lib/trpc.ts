import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";

export class UnauthorizedError extends Error {
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

export const api = createTRPCClient<StoreRouter>({
	links: [
		httpBatchLink({
			url: getBackendUrl(),
			transformer: SuperJSON,
			fetch: async (url, options) => {
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
