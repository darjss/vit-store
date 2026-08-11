import {
	createTRPCClient,
	httpBatchLink,
	httpLink,
	isNonJsonSerializable,
	splitLink,
} from "@trpc/client";
import type { AdminRouter } from "@vit/api";
import superjson from "superjson";

// alchemy injects VITE_SERVER_URL; the fallback covers `bun run dev:vite`.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";

async function isUnauthorized(response: Response): Promise<boolean> {
	if (response.status === 401) return true;
	const cloned = response.clone();
	try {
		const data = (await cloned.json()) as
			| { error?: { data?: { code?: string }; code?: string } }
			| Array<{ error?: { data?: { code?: string }; code?: string } }>;
		if (Array.isArray(data)) {
			return data.some(
				(item) =>
					item?.error?.data?.code === "UNAUTHORIZED" ||
					item?.error?.code === "UNAUTHORIZED",
			);
		}
		return (
			data?.error?.data?.code === "UNAUTHORIZED" ||
			data?.error?.code === "UNAUTHORIZED"
		);
	} catch {
		return false;
	}
}

// Session boundary: any 401 bounces the shell back to /login (mirrors the
// current admin's utils/trpc.ts).
function createAuthenticatedFetch(fetchFn: typeof fetch): typeof fetch {
	return async (url, options) => {
		const response = await fetchFn(url, options);
		if (
			(await isUnauthorized(response)) &&
			typeof window !== "undefined" &&
			window.location.pathname !== "/login"
		) {
			window.location.assign("/login");
		}
		return response;
	};
}

function fetchWithCredentials(
	url: Parameters<typeof fetch>[0],
	options?: Parameters<typeof fetch>[1],
): Promise<Response> {
	return fetch(url, {
		...options,
		credentials: "include",
		headers: {
			...options?.headers,
			Origin: window.location.origin,
		},
	});
}

export const api = createTRPCClient<AdminRouter>({
	links: [
		splitLink({
			condition: (op) => isNonJsonSerializable(op.input),
			true: httpLink({
				url: `${SERVER_URL}/trpc/admin`,
				fetch: createAuthenticatedFetch(fetchWithCredentials),
				transformer: {
					serialize: (data) => data,
					deserialize: superjson.deserialize,
				},
			}),
			false: httpBatchLink({
				url: `${SERVER_URL}/trpc/admin`,
				transformer: superjson,
				fetch: createAuthenticatedFetch(fetchWithCredentials),
			}),
		}),
	],
});
