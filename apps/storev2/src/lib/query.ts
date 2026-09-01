import { MutationCache, QueryCache, QueryClient } from "@tanstack/solid-query";
import * as v from "valibot";

import { showToast } from "@/components/ui/toast";
import { captureException } from "./analytics";
import { thrownErrorWireSchema, type ThrownErrorWire } from "./error-wire";
import { isServer } from "./runtime";

const getErrorDetails = (error: ThrownErrorWire) => {
	const parsed = v.parse(thrownErrorWireSchema, error);
	if (parsed instanceof Error) {
		return {
			message: parsed.message,
			name: parsed.name,
			stack: parsed.stack,
		};
	}

	return {
		message: String(parsed),
		name: parsed === null ? "null" : Array.isArray(parsed) ? "array" : "value",
	};
};

const getBrowserContext = () => {
	if (isServer) {
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
			captureException(v.parse(thrownErrorWireSchema, error), {
				...getErrorDetails(v.parse(thrownErrorWireSchema, error)),
				...getBrowserContext(),
				mutationKey: mutation.options.mutationKey,
				mutationMeta: mutation.options.meta,
				source: "tanstack-mutation",
			});
		},
	}),
	queryCache: new QueryCache({
		onError: (error, query) => {
			captureException(v.parse(thrownErrorWireSchema, error), {
				...getErrorDetails(v.parse(thrownErrorWireSchema, error)),
				...getBrowserContext(),
				queryHash: query.queryHash,
				queryKey: query.queryKey,
				queryMeta: query.meta,
				source: "tanstack-query",
			});
		},
	}),
});
