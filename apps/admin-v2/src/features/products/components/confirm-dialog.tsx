import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@vit/ui";
import type { JSX } from "solid-js";

interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: JSX.Element;
	description?: JSX.Element;
	confirmLabel: string;
	variant?: "primary" | "destructive";
	pending?: boolean;
	onConfirm: () => void;
}

/**
 * Shared confirm surface for consequential actions (activate, zero stock,
 * delete). The confirm button repeats the consequence (better-writing).
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="max-w-sm">
				<DialogHeader>
					<DialogTitle>{props.title}</DialogTitle>
					{props.description ? (
						<DialogDescription>{props.description}</DialogDescription>
					) : null}
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => props.onOpenChange(false)}
						disabled={props.pending}
					>
						Цуцлах
					</Button>
					<Button
						variant={
							props.variant === "destructive" ? "destructive" : "primary"
						}
						loading={props.pending}
						onClick={props.onConfirm}
					>
						{props.confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
