import { Link, useLocation } from "@tanstack/solid-router";
import { For } from "solid-js";

import { cn } from "@/lib/utils";
import { isNavActive, NAV_ITEMS } from "./nav-items";

// Variant B mobile navigation: fixed bottom bar, four labeled items.
export function BottomNav() {
	const location = useLocation();
	return (
		<nav
			aria-label="Үндсэн цэс"
			class="fixed inset-x-0 bottom-0 z-20 border-rule border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
		>
			<ul class="grid grid-cols-4">
				<For each={NAV_ITEMS}>
					{(item) => {
						const active = () => isNavActive(location().pathname, item.to);
						return (
							<li>
								<Link
									to={item.to}
									aria-current={active() ? "page" : undefined}
									class={cn(
										"flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 font-bold text-[11px] text-ink-2 transition-colors duration-150 hover:text-ink focus-visible:outline-ink",
										active() && "text-ink",
									)}
								>
									<span
										class={cn(
											"grid size-6 place-items-center rounded-xs border-[1.5px] border-current transition-colors duration-150 [&_svg]:size-4",
											active() && "border-ink bg-ink text-butter",
										)}
										aria-hidden="true"
									>
										{item.icon()}
									</span>
									<span>{item.label}</span>
								</Link>
							</li>
						);
					}}
				</For>
			</ul>
		</nav>
	);
}
