import { QueryClient } from "@tanstack/solid-query";
import { showToast } from "@/components/ui/toast";

export const queryClient = new QueryClient({
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
