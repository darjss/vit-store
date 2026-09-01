import { Edit2, MoreVertical, Trash2 } from "lucide-react";
import { type Dispatch, type ReactNode, type SetStateAction, useState } from "react";
import SubmitButton from "@/components/submit-button";
import {
	AlertDialog,
	AlertDialogAction,
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
	deleteMutation: (id: number) => void;
	extraActions?: ReactNode;
	id: number;
	isDeletePending: boolean;
	setIsEditDialogOpen: Dispatch<SetStateAction<boolean>>;
}

const RowAction = ({
	deleteMutation,
	extraActions,
	id,
	isDeletePending,
	setIsEditDialogOpen,
}: RowActionProps) => {
	const [isDeleteAlertOpen, setIsDelteAlertOpen] = useState(false);

	return (
		<DropdownMenu data-no-nav modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
					onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
					onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => e.stopPropagation()}
					size="icon"
					variant="default"
				>
					<MoreVertical className="h-4 w-4" />
					<span className="sr-only">Цэс нээх</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="border-border bg-background shadow-shadow w-32 border-2"
				data-no-nav
				onClick={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<DropdownMenuItem
					className="hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground cursor-pointer gap-2 py-2"
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						setIsEditDialogOpen(true);
					}}
					onSelect={(e) => {
						e.stopPropagation();
						e.preventDefault();
						setIsEditDialogOpen(true);
					}}
				>
					<Edit2 className="h-4 w-4" />
					<span>Засах</span>
				</DropdownMenuItem>

				{extraActions ? <DropdownMenuSeparator className="bg-border" /> : null}
				{extraActions}

				<DropdownMenuSeparator className="bg-border" />

				<AlertDialog data-no-nav onOpenChange={setIsDelteAlertOpen} open={isDeleteAlertOpen}>
					<AlertDialogTrigger asChild>
						<DropdownMenuItem
							className="text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground cursor-pointer gap-2 py-2"
							onSelect={(e) => {
								e.stopPropagation();
								e.preventDefault();
								setIsDelteAlertOpen(true);
							}}
						>
							<Trash2 className="h-4 w-4" />
							<span>Устгах</span>
						</DropdownMenuItem>
					</AlertDialogTrigger>
					<AlertDialogContent className="border-border bg-background shadow-shadow border-2">
						<AlertDialogHeader>
							<AlertDialogTitle className="font-heading text-lg">
								Устгахыг баталгаажуулах
							</AlertDialogTitle>
							<p className="text-foreground/70 mt-2 text-sm">
								Та энэ зүйлийг устгахдаа итгэлтэй байна уу? Энэ үйлдлийг буцаах боломжгүй.
							</p>
						</AlertDialogHeader>
						<AlertDialogFooter className="mt-6 flex gap-3">
							<AlertDialogCancel asChild>
								<Button className="flex-1" variant="destructive">
									Болих
								</Button>
							</AlertDialogCancel>
							<AlertDialogAction asChild>
								<SubmitButton
									className="flex-1"
									isPending={isDeletePending}
									onClick={() => deleteMutation(id)}
									variant="destructive"
								>
									Устгах
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
