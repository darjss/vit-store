import { BoxIcon } from "@solar-icons/solid/linear/box";
import { useInfiniteQuery } from "@tanstack/solid-query";
import { Button, EmptyState } from "@vit/ui";
import { createEffect, createMemo, For, onCleanup, Show } from "solid-js";

import { type ProductListFilters, productListQueryOptions } from "../queries";
import type { ProductListSearch } from "../search";
import { ErrorState, ProductListSkeleton } from "./page-states";
import { ProductCard } from "./product-card";

interface ProductListProps {
	filters: () => ProductListFilters;
	search: () => ProductListSearch;
	onCreate: () => void;
	onClearFilters: () => void;
}

export function ProductList(props: ProductListProps) {
	const query = useInfiniteQuery(() =>
		productListQueryOptions(props.filters()),
	);

	const products = createMemo(
		() => query.data?.pages.flatMap((page) => page.products) ?? [],
	);
	const total = createMemo(
		() =>
			query.data?.pages.reduce((sum, page) => sum + page.products.length, 0) ??
			0,
	);

	const hasActiveFilters = () =>
		props.search().brandId !== undefined ||
		props.search().categoryId !== undefined ||
		props.search().status !== undefined ||
		props.search().sortField !== undefined ||
		(props.search().searchTerm ?? "") !== "";

	let sentinel: HTMLDivElement | undefined;
	createEffect(() => {
		const node = sentinel;
		if (!node || !query.hasNextPage || query.isFetchingNextPage) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (
					entries[0]?.isIntersecting &&
					query.hasNextPage &&
					!query.isFetchingNextPage
				) {
					void query.fetchNextPage();
				}
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		onCleanup(() => observer.disconnect());
	});

	return (
		<div class="space-y-4">
			<Show when={query.isPending} fallback={null}>
				<ProductListSkeleton />
			</Show>

			<Show when={query.isError} fallback={null}>
				<ErrorState onRetry={() => void query.refetch()} />
			</Show>

			<Show
				when={!query.isPending && !query.isError && products().length === 0}
				fallback={null}
			>
				<Show
					when={hasActiveFilters()}
					fallback={
						<EmptyState
							icon={<BoxIcon />}
							title="Бараа байхгүй"
							description="Эхний бараагаа нэмээд дэлгүүрээ нээнэ үү."
							action={
								<Button onClick={props.onCreate}>Шинэ бараа нэмэх</Button>
							}
						/>
					}
				>
					<EmptyState
						icon={<BoxIcon />}
						title="Шүүлтэд тохирох бараа олдсонгүй"
						description="Шүүлтүүр эсвэл хайлтаа өөрчилж үзнэ үү."
						action={
							<Button variant="secondary" onClick={props.onClearFilters}>
								Шүүлтүүр цэвэрлэх
							</Button>
						}
					/>
				</Show>
			</Show>

			<Show when={!query.isPending && !query.isError && products().length > 0}>
				<div class="grid grid-cols-1 gap-2.5">
					<For each={products()}>
						{(product) => <ProductCard product={product} />}
					</For>
				</div>

				<Show when={query.isFetchingNextPage} fallback={null}>
					<output class="block py-2">
						<p class="text-center text-ink-2 text-sm">Ачаалж байна…</p>
					</output>
				</Show>

				<div ref={sentinel} class="h-1 w-full" aria-hidden="true" />

				<Show when={!query.hasNextPage}>
					<p class="py-3 text-center text-ink-2 text-sm">
						Нийт {total()} бараа
					</p>
				</Show>
			</Show>
		</div>
	);
}
