import { BoxIcon } from "@solar-icons/solid/linear/box";
import { createQuery } from "@tanstack/solid-query";
import { Button, EmptyState } from "@vit/ui";
import { createMemo, For, Show } from "solid-js";

import {
	type InstantSearchFilters,
	instantSearchQueryOptions,
} from "../queries";
import type { InstantSearchItem, ProductCardData } from "../types";
import { ErrorState, ProductListSkeleton } from "./page-states";
import { ProductCard } from "./product-card";

interface InstantSearchProps {
	filters: () => InstantSearchFilters;
	isTyping: () => boolean;
	onClear: () => void;
}

function toCardData(item: InstantSearchItem): ProductCardData {
	return {
		id: item.id,
		name: item.name,
		slug: item.slug,
		price: item.price,
		stock: item.stock,
		status: item.status as ProductCardData["status"],
		images: item.images.map((image) => ({ url: image.url })),
	};
}

export function InstantSearch(props: InstantSearchProps) {
	const query = createQuery(() => instantSearchQueryOptions(props.filters()));

	const searching = () =>
		query.isFetching ||
		props.isTyping() ||
		(query.isPending && query.fetchStatus !== "idle");

	const results = createMemo(() => query.data ?? []);

	return (
		<div class="space-y-3">
			<Show when={searching() && results().length === 0} fallback={null}>
				<output class="flex items-center gap-2 text-ink-2 text-sm">
					<span
						class="ui-spinner size-4 rounded-full border-2 border-ink-2 border-t-transparent"
						aria-hidden="true"
					/>
					Хайж байна…
				</output>
				<ProductListSkeleton count={3} />
			</Show>

			<Show when={!searching() && query.isError}>
				<ErrorState
					description="Хайлт ачаалах боломжгүй. Дахин оролдоно уу."
					onRetry={() => void query.refetch()}
				/>
			</Show>

			<Show when={!searching() && !query.isError && results().length > 0}>
				<div class="flex items-center justify-between gap-2">
					<p class="text-ink-2 text-sm">{results().length} үр дүн олдсон</p>
					<Button variant="ghost" size="compact" onClick={props.onClear}>
						Бүх барааг үзэх
					</Button>
				</div>
				<div class="grid gap-2.5">
					<For each={results()}>
						{(item) => <ProductCard product={toCardData(item)} />}
					</For>
				</div>
			</Show>

			<Show when={!searching() && !query.isError && results().length === 0}>
				<EmptyState
					icon={<BoxIcon />}
					title={`«${props.filters().query}» хайлтаар бараа олдсонгүй`}
					description="Нэрийг богиносгож эсвэл өөр үгээр хайж үзнэ үү."
					action={
						<Button variant="secondary" onClick={props.onClear}>
							Бүх барааг үзэх
						</Button>
					}
				/>
			</Show>
		</div>
	);
}
