import { useMutation } from "@tanstack/solid-query";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import IconLogout from "~icons/ri/logout-box-line";

const LogoutButton = (props: { class?: string }) => {
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
				class={cn(
					"flex w-full items-center justify-center gap-2 border-[3px] border-border bg-destructive px-4 py-2 font-bold text-destructive-foreground uppercase tracking-wide shadow-hard-lg transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:pointer-events-none disabled:opacity-50",
					props.class,
				)}
			>
				<IconLogout class="h-4 w-4" />
				<span class="text-sm">
					{logoutMutation.isPending ? "Гарч байна..." : "Гарах"}
				</span>
			</button>
		</div>
	);
};

export default LogoutButton;
