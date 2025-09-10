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
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="neutral"
					size="icon"
					className="h-8 w-8 rounded-base border border-border bg-main shadow-none transition-colors duration-200 hover:border-foreground hover:bg-main/10 data-[state=open]:border-foreground data-[state=open]:bg-main/10"
				>
					<MoreVertical className="h-4 w-4" />
					<span className="sr-only">Open menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-32 border-2 border-border shadow-shadow"
			>
				<DropdownMenuItem
					className="cursor-pointer gap-2 py-2 hover:bg-main/10 focus:bg-main/10"
					onSelect={(e) => {
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
				>
					<AlertDialogTrigger asChild>
						<DropdownMenuItem
							className="cursor-pointer gap-2 py-2 text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground"
							onSelect={(e) => {
								e.preventDefault();
								setIsDelteAlertOpen(true);
							}}
						>
							<Trash2 className="h-4 w-4" />
							<span>Delete</span>
						</DropdownMenuItem>
					</AlertDialogTrigger>
					<AlertDialogContent className="border-2 border-border shadow-shadow">
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
								<Button variant="neutral" className="flex-1">
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
