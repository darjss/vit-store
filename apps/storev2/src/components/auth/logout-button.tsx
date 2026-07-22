import { useMutation } from "@tanstack/solid-query";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { LogoutIcon as IconLogout } from "@solar-icons/solid/linear";
import { Button } from "../ui/button";

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
			<Button
				type="button"
				variant="destructive"
				size="sm"
				onClick={handleLogout}
				disabled={logoutMutation.isPending}
				class={cn("w-full", props.class)}
			>
				<IconLogout class="h-4 w-4" />
				<span class="text-sm">
					{logoutMutation.isPending ? "Гарч байна..." : "Гарах"}
				</span>
			</Button>
		</div>
	);
};

export default LogoutButton;
