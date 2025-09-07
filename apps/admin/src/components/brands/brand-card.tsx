import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import type { BrandSelectType } from "../../../../server/src/db/schema";
import RowAction from "../row-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import BrandForm from "./brand-form";

const BrandCard = (brand: BrandSelectType) => {
	const context = useRouteContext({ from: "/_dash/brands" });
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const deleteMutation = useMutation({
		...trpc.brands.deleteBrand.mutationOptions(),
		onSuccess: () => {
			context.queryClient.invalidateQueries(
				trpc.brands.getAllBrands.queryOptions(),
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
						<DialogTitle>Брэнд засах</DialogTitle>
					</DialogHeader>
					<BrandForm
						brand={brand}
						onSuccess={() => setIsEditDialogOpen(false)}
					/>
				</DialogContent>
			</Dialog>

			<Card className="group relative overflow-hidden border-2 border-border bg-background shadow-shadow transition-all duration-200 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[6px_6px_0px_0px_var(--border)]">
				<CardContent className="p-0">
					<div className="relative flex aspect-square items-center justify-center border-border border-b-2 bg-secondary-background">
						{brand.logoUrl ? (
							<Image
								src={brand.logoUrl}
								alt={brand.name}
								height={120}
								width={120}
								layout="constrained"
								className="h-full w-full object-contain p-4"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center font-heading text-4xl text-foreground/60 uppercase">
								{brand.name[0]}
							</div>
						)}
					</div>

					<div className="relative p-3">
						<div className="absolute top-2 right-2">
							<RowAction
								id={brand.id}
								setIsEditDialogOpen={setIsEditDialogOpen}
								deleteMutation={deleteHelper}
								isDeletePending={deleteMutation.isPending}
							/>
						</div>

						<h3 className="pr-8 font-heading text-foreground leading-tight">
							{brand.name}
						</h3>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default BrandCard;
