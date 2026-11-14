import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { CategoryType } from "@/lib/types";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import RowAction from "../row-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import CategoryForm from "./category-form";

const CategoryCard = (category: CategoryType) => {
	const context = useRouteContext({ from: "/_dash/categories" });
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const deleteMutation = useMutation({
		...trpc.category.deleteCategory.mutationOptions(),
		onSuccess: () => {
			context.queryClient.invalidateQueries(trpc.category.getAllCategories.queryOptions());
		},
	});

	return (
		<>
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Ангилал засах</DialogTitle>
					</DialogHeader>
					<CategoryForm category={category} onSuccess={() => setIsEditDialogOpen(false)} />
				</DialogContent>
			</Dialog>

			<Card className="group border-border bg-background relative overflow-hidden border transition-all duration-200">
				<CardContent className="p-3">
					<div className="flex items-center gap-3">
						<div className="rounded-base border-border bg-secondary font-heading text-foreground/60 flex h-8 w-8 items-center justify-center border text-xs uppercase">
							{category.name[0]}
						</div>
						<div className="min-w-0">
							<h3 className="font-heading truncate text-sm leading-none">{category.name}</h3>
						</div>
						<div className="ml-auto">
							<RowAction
								deleteMutation={(id) => deleteMutation.mutate({ id })}
								id={category.id}
								isDeletePending={deleteMutation.isPending}
								setIsEditDialogOpen={setIsEditDialogOpen}
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default CategoryCard;
