import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { LOW_STOCK_THRESHOLD } from "@vit/shared";
import { Button, Input, showToast } from "@vit/ui";
import { createEffect, createSignal, Show } from "solid-js";
import { cn } from "@/lib/utils";
import { applyStockToCaches } from "../cache";
import { productErrorToMessage } from "../errors";
import { setProductStockMutationOptions } from "../mutations";
import type { ProductCardData } from "../types";

interface StockEditorProps {
	product: Pick<ProductCardData, "id" | "stock">;
}

/**
 * Inline stock editor (legacy behavior, rebuilt): tap the stock value, type
 * a new count, save. Optimistic across list, detail, and instant-search
 * caches with rollback on error.
 */
export function StockEditor(props: StockEditorProps) {
	const queryClient = useQueryClient();
	const [editing, setEditing] = createSignal(false);
	const [draft, setDraft] = createSignal<number>(props.product.stock);

	// Keep the draft in sync when the cached stock changes outside this editor.
	createEffect(() => {
		if (!editing()) setDraft(props.product.stock);
	});

	const mutation = createMutation(() => ({
		...setProductStockMutationOptions(),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: ["products"] });
			const rollback = applyStockToCaches(queryClient, vars.id, vars.newStock);
			return { rollback };
		},
		onError: (error, _vars, context) => {
			context?.rollback();
			showToast({
				title: "Үлдэгдэл хадгалах боломжгүй",
				description: productErrorToMessage(error, "Алдаа гарлаа"),
				variant: "error",
			});
		},
		onSuccess: () => {
			setEditing(false);
			showToast({ title: "Үлдэгдэл шинэчлэгдлээ", variant: "success" });
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ["products", "list"] });
			void queryClient.invalidateQueries({ queryKey: ["products", "instant"] });
		},
	}));

	const isLow = () =>
		props.product.stock > 0 && props.product.stock <= LOW_STOCK_THRESHOLD;

	const startEdit = () => {
		setDraft(props.product.stock);
		setEditing(true);
	};
	const cancelEdit = () => {
		setDraft(props.product.stock);
		setEditing(false);
	};
	const save = () => {
		if (mutation.isPending) return;
		if (draft() === props.product.stock) {
			setEditing(false);
			return;
		}
		mutation.mutate({ id: props.product.id, newStock: draft() });
	};

	return (
		<Show
			when={editing()}
			fallback={
				<button
					type="button"
					onClick={startEdit}
					class={cn(
						"flex min-h-11 items-center gap-1 rounded-lg border-ink-2 border-b-[1.5px] border-dotted px-1 font-bold text-[13px] text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
						isLow() && "border-coral text-coral-ink hover:text-coral-ink",
					)}
				>
					<span>Үлдэгдэл:</span>
					<span class="tabular-nums">{props.product.stock}</span>
				</button>
			}
		>
			<div class="flex items-center gap-1.5">
				<Input
					type="number"
					min="0"
					value={draft()}
					disabled={mutation.isPending}
					aria-label="Үлдэгдэл тоо"
					onInput={(event) => {
						const next = Number.parseInt(event.currentTarget.value, 10);
						setDraft(Number.isNaN(next) ? 0 : Math.max(0, next));
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") save();
						if (event.key === "Escape") cancelEdit();
					}}
					class="h-11 w-24 text-center"
				/>
				<Button size="compact" loading={mutation.isPending} onClick={save}>
					Хадгалах
				</Button>
				<Button
					size="compact"
					variant="outline"
					disabled={mutation.isPending}
					onClick={cancelEdit}
				>
					Цуцлах
				</Button>
			</div>
		</Show>
	);
}
