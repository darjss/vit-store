import { MutationCache, QueryCache, QueryClient } from "@tanstack/solid-query";
import { showToast } from "@/components/ui/toast";
import { captureException } from "./analytics";

const getErrorDetails = (error: unknown) => {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	return {
		name: typeof error,
		message: String(error),
	};
};

const getBrowserContext = () => {
	if (typeof window === "undefined") return {};

	return {
		pageUrl: window.location.href,
		userAgent: window.navigator.userAgent,
		isOnline: window.navigator.onLine,
		devicePixelRatio: window.devicePixelRatio,
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
	};
};

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			captureException(error, {
				...getErrorDetails(error),
				...getBrowserContext(),
				source: "tanstack-query",
				queryHash: query.queryHash,
				queryKey: query.queryKey,
				queryMeta: query.meta,
			});
		},
	}),
	mutationCache: new MutationCache({
		onError: (error, _variables, _context, mutation) => {
			captureException(error, {
				...getErrorDetails(error),
				...getBrowserContext(),
				source: "tanstack-mutation",
				mutationKey: mutation.options.mutationKey,
				mutationMeta: mutation.options.meta,
			});
		},
	}),
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5,
			gcTime: 1000 * 60 * 60,
		},
		mutations: {
			onError: (error) => {
				showToast({
					title: "Алдаа гарлаа",
					description:
						error.message || "Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.",
					duration: 5000,
					variant: "error",
				});
			},
		},
	},
});
