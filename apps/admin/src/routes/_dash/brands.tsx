import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import BrandCard from "@/components/brands/brand-card";
import BrandForm from "@/components/brands/brand-form";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/brands")({
	component: RouteComponent,
	loader({ context: ctx }) {
		return ctx.queryClient.ensureQueryData(
			ctx.trpc.brands.getAllBrands.queryOptions(),
		);
	},
});

function RouteComponent() {
	const [isOpen, setIsOpen] = useState(false);
	const { data: brands } = useSuspenseQuery(
		trpc.brands.getAllBrands.queryOptions(),
	);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Dialog open={isOpen} onOpenChange={setIsOpen}>
					<DialogTrigger asChild>
						<Button className="gap-2">
							<Plus className="h-4 w-4" />
							<span className="hidden sm:inline">Брэнд нэмэх</span>
							<span className="sm:hidden">Нэмэх</span>
						</Button>
					</DialogTrigger>
					<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-md">
						<DialogHeader className="border-b px-6 pt-6 pb-4">
							<DialogTitle>Брэнд нэмэх</DialogTitle>
							<DialogDescription>Каталогт шинэ брэнд үүсгэх.</DialogDescription>
						</DialogHeader>
						<div className="max-h-[80vh] overflow-y-auto p-5 sm:p-6">
							<BrandForm onSuccess={() => setIsOpen(false)} />
						</div>
					</DialogContent>
				</Dialog>
			</div>

			{brands.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-muted-foreground text-sm">Брэнд олдсонгүй</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Эхлэхийн тулд анхны брэндээ нэмнэ үү
					</p>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
					{brands.map((brand) => (
						<BrandCard key={brand.id} {...brand} />
					))}
				</div>
			)}
		</div>
	);
}
