import { navigate } from "astro:transitions/client";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { Show } from "solid-js";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconLogin from "~icons/ri/login-box-line";
import IconLogout from "~icons/ri/logout-box-line";
import IconUser from "~icons/ri/user-line";

const UserProfile = () => {
	const userQuery = useQuery(
		() => ({
			queryKey: ["user"],
			queryFn: async () => {
				return await api.auth.me.query();
			},
			retry: false,
			throwOnError: false,
		}),
		() => queryClient,
	);

	const logoutMutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.auth.logout.mutate();
			},
			onSuccess: async () => {
				navigate("/", { history: "push" });
			},
		}),
		() => queryClient,
	);

	const handleLogout = () => {
		logoutMutation.mutate();
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				as="button"
				aria-label="Профайл"
				disabled={userQuery.isPending}
				class="flex items-center justify-center border-[3px] border-black bg-white p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-primary hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
			>
				<IconUser class="h-5 w-5" />
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<Show
					when={userQuery.data}
					fallback={
						<>
							<DropdownMenuLabel>Нэвтрэх</DropdownMenuLabel>
							<DropdownMenuItem
								as="button"
								onClick={() => navigate("/login")}
								class="flex items-center gap-2"
							>
								<IconLogin class="h-5 w-5" />
								<span>Нэвтрэх</span>
							</DropdownMenuItem>
						</>
					}
				>
					<DropdownMenuLabel>
						{userQuery.data?.phone.toString().slice(0, 4)}{" "}
						{userQuery.data?.phone.toString().slice(4)}
					</DropdownMenuLabel>
					<DropdownMenuItem
						as="button"
						onClick={() => navigate("/profile")}
						class="flex items-center gap-2"
					>
						<IconUser class="h-5 w-5" />
						<span>Миний профайл</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						as="button"
						onClick={handleLogout}
						disabled={logoutMutation.isPending}
						class="flex w-full items-center gap-2 text-left transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						<IconLogout class="h-5 w-5" />
						<span>{logoutMutation.isPending ? "Гарч байна..." : "Гарах"}</span>
					</DropdownMenuItem>
				</Show>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default UserProfile;
