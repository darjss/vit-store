import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { formatExpirationMonthYear } from "@vit/shared";
import { Button, Input, showToast } from "@vit/ui";
import { createEffect, createSignal, Show } from "solid-js";

import { invalidateProductDetail, invalidateProductLists } from "../cache";
import { productErrorToMessage } from "../errors";
import { updateProductFieldMutationOptions } from "../mutations";
import type { ProductCardData } from "../types";

interface ExpirationEditorProps {
	product: Pick<ProductCardData, "id" | "expirationDate">;
}

/**
 * Inline expiration-date editor (legacy behavior): displays the month/year,
 * tap to edit with a month input. Saves via updateProductField.
 */
export function ExpirationEditor(props: ExpirationEditorProps) {
	const queryClient = useQueryClient();
	const [editing, setEditing] = createSignal(false);
	const [draft, setDraft] = createSignal<string>(
		props.product.expirationDate ?? "",
	);

	createEffect(() => {
		if (!editing()) setDraft(props.product.expirationDate ?? "");
	});

	const mutation = createMutation(() => ({
		...updateProductFieldMutationOptions(),
		onError: (error) => {
			showToast({
				title: "Дуусах хугацаа хадгалах боломжгүй",
				description: productErrorToMessage(error, "Алдаа гарлаа"),
				variant: "error",
			});
		},
		onSuccess: () => {
			setEditing(false);
			showToast({ title: "Дуусах хугацаа шинэчлэгдлээ", variant: "success" });
		},
		onSettled: () => {
			void invalidateProductDetail(queryClient, props.product.id);
			void invalidateProductLists(queryClient);
		},
	}));

	const startEdit = () => {
		setDraft(props.product.expirationDate ?? "");
		setEditing(true);
	};
	const cancelEdit = () => {
		setDraft(props.product.expirationDate ?? "");
		setEditing(false);
	};
	const save = () => {
		if (mutation.isPending) return;
		mutation.mutate({
			id: props.product.id,
			field: "expirationDate",
			stringValue: draft() || undefined,
		});
	};

	return (
		<Show
			when={editing()}
			fallback={
				<button
					type="button"
					onClick={startEdit}
					class="flex min-h-11 items-center gap-1 rounded-lg border-ink-2 border-b-[1.5px] border-dotted px-1 font-medium text-[13px] text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
				>
					<span>Дуусах:</span>
					<span>{formatExpirationMonthYear(props.product.expirationDate)}</span>
				</button>
			}
		>
			<div class="flex items-center gap-1.5">
				<Input
					type="month"
					value={draft()}
					disabled={mutation.isPending}
					aria-label="Дуусах хугацаа (сар/жил)"
					onInput={(event) => setDraft(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") save();
						if (event.key === "Escape") cancelEdit();
					}}
					class="h-11 w-36"
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
