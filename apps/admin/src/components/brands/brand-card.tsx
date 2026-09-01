import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import type { BrandSelectType } from "@vit/api/db/schema";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import RowAction from "../row-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import BrandForm from "./brand-form";

const BrandCard = (brand: BrandSelectType) => {
	const context = useRouteContext({ from: "/_dash/brands" });
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const deleteMutation = useMutation({
		...trpc.brands.deleteBrand.mutationOptions(),
		onSuccess: () => {
			context.queryClient.invalidateQueries(trpc.brands.getAllBrands.queryOptions());
		},
	});

	return (
		<>
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Брэнд засах</DialogTitle>
					</DialogHeader>
					<BrandForm brand={brand} onSuccess={() => setIsEditDialogOpen(false)} />
				</DialogContent>
			</Dialog>

			<Card className="group border-border bg-background shadow-shadow relative overflow-hidden border-2 transition-all duration-200 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[6px_6px_0px_0px_var(--border)]">
				<CardContent className="p-0">
					<div className="border-border bg-background relative flex aspect-square items-center justify-center border-b-2">
						{brand.logoUrl ? (
							<Image
								alt={brand.name}
								className="h-full w-full object-contain p-4"
								height={120}
								layout="constrained"
								src={brand.logoUrl}
								width={120}
							/>
						) : (
							<div className="font-heading text-foreground/60 flex h-full w-full items-center justify-center text-4xl uppercase">
								{brand.name[0]}
							</div>
						)}
					</div>

					<div className="relative p-3">
						<div className="absolute top-2 right-2">
							<RowAction
								deleteMutation={(id) => deleteMutation.mutate({ id })}
								id={brand.id}
								isDeletePending={deleteMutation.isPending}
								setIsEditDialogOpen={setIsEditDialogOpen}
							/>
						</div>

						<h3 className="font-heading text-foreground pr-8 leading-tight">{brand.name}</h3>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default BrandCard;
