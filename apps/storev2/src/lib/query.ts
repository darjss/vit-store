import { MutationCache, QueryCache, QueryClient } from "@tanstack/solid-query";
import { showToast } from "@/components/ui/toast";
import { captureException } from "./analytics";

const getErrorDetails = (error: unknown) => {
	if (error instanceof Error) {
		return {
			message: error.message,
			name: error.name,
			stack: error.stack,
		};
	}

	return {
		message: String(error),
		name: typeof error,
	};
};

const getBrowserContext = () => {
	if (typeof window === "undefined") {
		return {};
	}

	return {
		devicePixelRatio: window.devicePixelRatio,
		isOnline: window.navigator.onLine,
		pageUrl: window.location.href,
		userAgent: window.navigator.userAgent,
		viewportHeight: window.innerHeight,
		viewportWidth: window.innerWidth,
	};
};

export const queryClient = new QueryClient({
	defaultOptions: {
		mutations: {
			onError: (error) => {
				showToast({
					description: error.message || "Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.",
					duration: 5000,
					title: "Алдаа гарлаа",
					variant: "error",
				});
			},
		},
		queries: {
			gcTime: 1000 * 60 * 60,
			staleTime: 1000 * 60 * 5,
		},
	},
	mutationCache: new MutationCache({
		onError: (error, _variables, _context, mutation) => {
			captureException(error, {
				...getErrorDetails(error),
				...getBrowserContext(),
				mutationKey: mutation.options.mutationKey,
				mutationMeta: mutation.options.meta,
				source: "tanstack-mutation",
			});
		},
	}),
	queryCache: new QueryCache({
		onError: (error, query) => {
			captureException(error, {
				...getErrorDetails(error),
				...getBrowserContext(),
				queryHash: query.queryHash,
				queryKey: query.queryKey,
				queryMeta: query.meta,
				source: "tanstack-query",
			});
		},
	}),
});
