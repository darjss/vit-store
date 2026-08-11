import { LogoutIcon } from "@solar-icons/solid/linear/logout";
import { createMutation, createQuery } from "@tanstack/solid-query";
import { Link, useLocation, useNavigate } from "@tanstack/solid-router";
import { For } from "solid-js";

import {
	adminLogoutMutationOptions,
	adminSessionQueryKey,
	adminSessionQueryOptions,
} from "@/lib/auth";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { Button } from "@/tmp-ui";
import { isNavActive, NAV_ITEMS } from "./nav-items";

// Desktop expansion of variant B: brand + the same four sections in the same
// order, plus the session chip and logout. Hidden below md.
export function TopNav() {
	const location = useLocation();
	const navigate = useNavigate();
	const sessionQuery = createQuery(() => adminSessionQueryOptions);

	const logout = createMutation(() => ({
		...adminLogoutMutationOptions,
		onSuccess: () => {
			queryClient.setQueryData(adminSessionQueryKey, null);
			void navigate({ to: "/login" });
		},
	}));

	const username = () => sessionQuery.data?.user?.username ?? "Админ";

	return (
		<header class="sticky top-0 z-20 hidden border-rule border-b bg-surface/95 backdrop-blur md:block">
			<div class="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-8 px-6">
				<Link
					to="/"
					class="flex shrink-0 items-center gap-2.5 focus-visible:outline-ink"
					aria-label="Нүүр"
				>
					<span
						class="grid size-9 place-items-center rounded-[9px] bg-ink font-extrabold text-[13px] text-butter"
						aria-hidden="true"
					>
						AV
					</span>
					<span class="hidden font-extrabold text-sm lg:block">vit-admin</span>
				</Link>

				<nav aria-label="Үндсэн цэс" class="flex h-full items-center gap-1">
					<For each={NAV_ITEMS}>
						{(item) => {
							const active = () => isNavActive(location().pathname, item.to);
							return (
								<Link
									to={item.to}
									aria-current={active() ? "page" : undefined}
									class={cn(
										"relative flex h-full items-center gap-2 px-3 font-bold text-ink-2 text-sm transition-colors duration-150 hover:text-ink",
										active() && "text-ink",
									)}
								>
									<span class="[&_svg]:size-[18px]" aria-hidden="true">
										{item.icon()}
									</span>
									<span>{item.label}</span>
									<span
										class={cn(
											"absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-transparent transition-colors duration-150",
											active() && "bg-ink",
										)}
										aria-hidden="true"
									/>
								</Link>
							);
						}}
					</For>
				</nav>

				<div class="ml-auto flex items-center gap-3">
					<span class="max-w-40 truncate font-bold text-sm">{username()}</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => logout.mutate()}
						disabled={logout.isPending}
					>
						<LogoutIcon aria-hidden="true" />
						Гарах
					</Button>
				</div>
			</div>
		</header>
	);
}
