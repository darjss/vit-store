import { AlertDialogAction } from "@radix-ui/react-alert-dialog";
import { Edit2, MoreVertical, Trash2 } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import SubmitButton from "@/components/submit-button";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RowActionProps {
	id: number;
	setIsEditDialogOpen: Dispatch<SetStateAction<boolean>>;
	deleteMutation: (id: number) => void;
	isDeletePending: boolean;
}

const RowAction = ({
	id,
	setIsEditDialogOpen,
	deleteMutation,
	isDeletePending,
}: RowActionProps) => {
	const [isDeleteAlertOpen, setIsDelteAlertOpen] = useState(false);

	return (
		<DropdownMenu modal={false} data-no-nav>
			<DropdownMenuTrigger asChild>
				<Button
					variant="default"
					size="icon"
					onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
					onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
					onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => e.stopPropagation()}
				>
					<MoreVertical className="h-4 w-4" />
					<span className="sr-only">Open menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-32 border-2 border-border bg-background shadow-shadow"
				data-no-nav
				onClick={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<DropdownMenuItem
					className="cursor-pointer gap-2 py-2 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
					onSelect={(e) => {
						e.stopPropagation();
						e.preventDefault();
						setIsEditDialogOpen(true);
					}}
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						setIsEditDialogOpen(true);
					}}
				>
					<Edit2 className="h-4 w-4" />
					<span>Edit</span>
				</DropdownMenuItem>

				<DropdownMenuSeparator className="bg-border" />

				<AlertDialog
					open={isDeleteAlertOpen}
					onOpenChange={setIsDelteAlertOpen}
					data-no-nav 
				>
					<AlertDialogTrigger asChild>
						<DropdownMenuItem
							className="cursor-pointer gap-2 py-2 text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground"
							onSelect={(e) => {
								e.stopPropagation();
								e.preventDefault();
								setIsDelteAlertOpen(true);
							}}
						>
							<Trash2 className="h-4 w-4" />
							<span>Delete</span>
						</DropdownMenuItem>
					</AlertDialogTrigger>
					<AlertDialogContent className="border-2 border-border bg-background shadow-shadow">
						<AlertDialogHeader>
							<AlertDialogTitle className="font-heading text-lg">
								Confirm Delete
							</AlertDialogTitle>
							<p className="mt-2 text-foreground/70 text-sm">
								Are you sure you want to delete this item? This action cannot be
								undone.
							</p>
						</AlertDialogHeader>
						<AlertDialogFooter className="mt-6 flex gap-3">
							<AlertDialogCancel asChild>
								<Button variant="destructive" className="flex-1">
									Cancel
								</Button>
							</AlertDialogCancel>
							<AlertDialogAction asChild>
								<SubmitButton
									variant="destructive"
									isPending={isDeletePending}
									onClick={() => deleteMutation(id)}
									className="flex-1"
								>
									Delete
								</SubmitButton>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
export default RowAction;
