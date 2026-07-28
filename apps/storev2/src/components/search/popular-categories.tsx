import { useQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { FolderIcon as IconFolder } from "@solar-icons/solid/linear";

const PopularCategories = () => {
	const query = useQuery(
		() => ({
			queryKey: ["popular-categories"],
			queryFn: () => api.v2.category.getAllCategoriesWithStock.query(),
			staleTime: 1000 * 60 * 30,
		}),
		() => queryClient,
	);

	const topCategories = () =>
		(query.data ?? [])
			.filter((category) => category.productCount > 0)
			.slice(0, 8);

	return (
		<>
			<Show when={query.isError}>
				<div
					class="mt-6 rounded-xl border border-border bg-card p-4"
					role="alert"
				>
					<p class="font-semibold text-sm">Ангиллыг ачаалж чадсангүй</p>
					<p class="mt-1 text-muted-foreground text-xs">
						Үйлчилгээнд түр саатал гарлаа. Дахин оролдоно уу.
					</p>
					<button
						type="button"
						onClick={() => query.refetch()}
						class="mt-2 min-h-11 font-semibold text-xs underline underline-offset-2"
					>
						Дахин оролдох
					</button>
				</div>
			</Show>
			<Show when={topCategories().length > 0}>
				<div class="mt-6">
					<p class="mb-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
						Түгээмэл ангилал
					</p>
					<div class="flex flex-wrap gap-2">
						<For each={topCategories()}>
							{(category) => (
								<a
									href={`/products/category/${category.slug}/1/`}
									class="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-semibold text-foreground text-xs shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
								>
									<IconFolder class="h-4 w-4 shrink-0" />
									<span>{category.name}</span>
									<span class="font-semibold text-muted-foreground/55">
										{category.productCount}
									</span>
								</a>
							)}
						</For>
					</div>
				</div>
			</Show>
		</>
	);
};

export default PopularCategories;
