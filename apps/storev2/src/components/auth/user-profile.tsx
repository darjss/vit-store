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
				<svg
					class="h-5 w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
					/>
				</svg>
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
								<svg
									class="h-5 w-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
									/>
								</svg>
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
						<svg
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
							/>
						</svg>
						<span>Миний профайл</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						as="button"
						onClick={handleLogout}
						disabled={logoutMutation.isPending}
						class="flex w-full items-center gap-2 text-left transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						<svg
							class="h-5 w-5"
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
						<span>{logoutMutation.isPending ? "Гарч байна..." : "Гарах"}</span>
					</DropdownMenuItem>
				</Show>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default UserProfile;
