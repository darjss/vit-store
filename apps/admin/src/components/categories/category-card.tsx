import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import type { CategorySelectType } from "../../../../server/src/db/schema";
import RowAction from "../row-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import CategoryForm from "./category-form";

const CategoryCard = (category: CategorySelectType) => {
    const context = useRouteContext({ from: "/_dash/categories" });
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const deleteMutation = useMutation({
        ...trpc.category.deleteCategory.mutationOptions(),
        onSuccess: () => {
            context.queryClient.invalidateQueries(
                trpc.category.getAllCategories.queryOptions(),
            );
        },
    });
    const deleteHelper = async (id: number) => {
        deleteMutation.mutate({ id });
    };

    return (
        <>
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ангилал засах</DialogTitle>
                    </DialogHeader>
                    <CategoryForm
                        category={category}
                        onSuccess={() => setIsEditDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <Card className="group relative overflow-hidden border-2 border-border bg-background shadow-shadow transition-all duration-200 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[6px_6px_0px_0px_var(--border)]">
                <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-base border-2 border-border bg-secondary-background font-heading text-foreground/60 text-xs uppercase">
                            {category.name[0]}
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate font-heading text-sm leading-none">
                                {category.name}
                            </h3>
                        </div>
                        <div className="ml-auto">
                            <RowAction
                                id={category.id}
                                setIsEditDialogOpen={setIsEditDialogOpen}
                                deleteMutation={deleteHelper}
                                isDeletePending={deleteMutation.isPending}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </>
    );
};

export default CategoryCard;


