import { useQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { FolderIcon as IconFolder } from "@solar-icons/solid/linear";

const PopularCategories = () => {
	const query = useQuery(
		() => ({
			queryFn: () => api.category.getAllCategoriesWithStock.query(),
			queryKey: ["popular-categories"],
			staleTime: 1000 * 60 * 30,
		}),
		() => queryClient,
	);

	const topCategories = () => (query.data ?? []).filter((c) => c.productCount > 0).slice(0, 8);

	return (
		<Show when={topCategories().length > 0}>
			<div class="mt-6">
				<p class="text-muted-foreground mb-3 text-[11px] font-semibold tracking-wide uppercase">
					Түгээмэл ангилал
				</p>
				<div class="flex flex-wrap gap-2">
					<For each={topCategories()}>
						{(category) => (
							<a
								class="border-border bg-card text-foreground shadow-soft-sm hover:shadow-soft inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
								href={`/products/category/${category.slug}/1/`}
							>
								<IconFolder class="h-4 w-4 shrink-0" />
								<span>{category.name}</span>
								<span class="text-muted-foreground/55 font-semibold">{category.productCount}</span>
							</a>
						)}
					</For>
				</div>
			</div>
		</Show>
	);
};

export default PopularCategories;
