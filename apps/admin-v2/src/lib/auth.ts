import type { QueryClient } from "@tanstack/solid-query";
import { api } from "./trpc";

// Session boundary against packages/api/src/routers/admin/auth.ts.
// auth.me returns the admin session or null (publicProcedure + adminAuth).
export type AdminSession = Awaited<ReturnType<typeof api.auth.me.query>>;

export const adminSessionQueryKey = ["auth", "me"] as const;

export const adminSessionQueryOptions = {
	queryKey: adminSessionQueryKey,
	queryFn: () => api.auth.me.query(),
	staleTime: 1000 * 60 * 15,
	gcTime: 1000 * 60 * 30,
	retry: false,
} as const;

export const adminLogoutMutationOptions = {
	mutationFn: () => api.auth.logout.mutate(),
	retry: false,
} as const;

// Mirrors apps/admin/src/routes/_dash/route.tsx: read the cache, fetch once
// when cold, and return null when there is no session.
export async function ensureAdminSession(
	queryClient: QueryClient,
): Promise<AdminSession> {
	const cached = queryClient.getQueryData<AdminSession>(adminSessionQueryKey);
	if (cached) return cached;
	return queryClient.fetchQuery(adminSessionQueryOptions);
}
