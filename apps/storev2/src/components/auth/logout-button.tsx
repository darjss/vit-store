import { useMutation } from "@tanstack/solid-query";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";

const LogoutButton = () => {
	const logoutMutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.auth.logout.mutate();
			},
			onSuccess: async () => {
				window.location.href = "/";
			},
		}),
		() => queryClient,
	);

	const handleLogout = () => {
		logoutMutation.mutate();
	};

	return (
		<div class="p-1">
			<button
				type="button"
				onClick={handleLogout}
				disabled={logoutMutation.isPending}
				class="flex w-full items-center justify-center gap-2 border-[3px] border-black bg-destructive px-4 py-2 font-bold text-destructive-foreground uppercase tracking-wide shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:pointer-events-none disabled:opacity-50"
			>
				<svg
					class="h-4 w-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
					/>
				</svg>
				<span class="text-sm">
					{logoutMutation.isPending ? "Гарч байна..." : "Гарах"}
				</span>
			</button>
		</div>
	);
};

export default LogoutButton;
