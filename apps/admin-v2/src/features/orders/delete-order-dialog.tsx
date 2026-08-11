/*
 * Delete confirmation — soft-deletes the order (restores stock server-side
 * when the order was paid). Repeats the consequence on the confirm button.
 */
import { Show } from "solid-js";

import {
	Button,
	Dialog,
	DialogCloseButton,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	InlineAlert,
} from "@vit/ui";

import { orderErrorMessage } from "./errors";

interface DeleteOrderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orderNumber: string;
	isPending: boolean;
	error?: unknown;
	onConfirm: () => void;
}

export function DeleteOrderDialog(props: DeleteOrderDialogProps) {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="max-w-sm">
				<DialogHeader>
					<DialogTitle>Захиалга устгах уу?</DialogTitle>
					<DialogDescription>
						#{props.orderNumber} захиалгыг устгахад итгэлтэй байна уу? Төлсөн
						захиалга бол нөөцөд буцаагдана. Энэ үйлдлийг буцаах боломжгүй.
					</DialogDescription>
				</DialogHeader>

				<Show when={props.error}>
					<InlineAlert tone="error">
						{orderErrorMessage(props.error)}
					</InlineAlert>
				</Show>

				<DialogFooter>
					<Button
						variant="ghost"
						disabled={props.isPending}
						onClick={() => props.onOpenChange(false)}
					>
						Болих
					</Button>
					<Button
						variant="destructive"
						loading={props.isPending}
						onClick={props.onConfirm}
					>
						{props.isPending ? "Устгаж байна…" : "Устгах"}
					</Button>
				</DialogFooter>
				<DialogCloseButton aria-label="Хаах" />
			</DialogContent>
		</Dialog>
	);
}
