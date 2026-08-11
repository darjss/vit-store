import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@vit/ui";
import { createSignal, type JSX } from "solid-js";

import { ConfirmDialog } from "./confirm-dialog";

interface FormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: JSX.Element;
	/**
	 * Render prop receives a dirty-change reporter the form calls whenever its
	 * draft diverges from the saved baseline.
	 */
	children: (reportDirty: (dirty: boolean) => void) => JSX.Element;
}

/**
 * Dialog shell for the product form. Guards closing while the form is dirty:
 * Escape/overlay/close first ask for confirmation instead of silently
 * discarding unsaved changes.
 */
export function FormDialog(props: FormDialogProps) {
	const [dirty, setDirty] = createSignal(false);
	const [confirmOpen, setConfirmOpen] = createSignal(false);

	const handleOpenChange = (next: boolean) => {
		if (!next && dirty()) {
			setConfirmOpen(true);
			return;
		}
		props.onOpenChange(next);
	};

	return (
		<>
			<Dialog open={props.open} onOpenChange={handleOpenChange}>
				<DialogContent class="max-h-[85dvh] max-w-xl overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{props.title}</DialogTitle>
					</DialogHeader>
					{props.children(setDirty)}
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={confirmOpen()}
				onOpenChange={setConfirmOpen}
				title="Хадгалаагүй өөрчлөлт байна"
				description="Форм дээр хадгалаагүй өөрчлөлт байна. Гарах уу?"
				confirmLabel="Гарах"
				variant="destructive"
				onConfirm={() => {
					setConfirmOpen(false);
					setDirty(false);
					props.onOpenChange(false);
				}}
			/>
		</>
	);
}
