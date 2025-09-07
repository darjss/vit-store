import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import CategoryCard from "@/components/categories/category-card";
import CategoryForm from "@/components/categories/category-form";
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

export const Route = createFileRoute("/_dash/categories")({
	component: RouteComponent,
	loader({ context: ctx }) {
		return ctx.queryClient.ensureQueryData(
			ctx.trpc.category.getAllCategories.queryOptions(),
		);
	},
});

function RouteComponent() {
	const [isOpen, setIsOpen] = useState(false);
	const { data: categories } = useSuspenseQuery(
		trpc.category.getAllCategories.queryOptions(),
	);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Dialog open={isOpen} onOpenChange={setIsOpen}>
					<DialogTrigger asChild>
						<Button className="gap-2">
							<Plus className="h-4 w-4" />
							<span className="hidden sm:inline">Ангилал нэмэх</span>
							<span className="sm:hidden">Нэмэх</span>
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Ангилал нэмэх</DialogTitle>
							<DialogDescription>Каталогт шинэ ангилал үүсгэх.</DialogDescription>
						</DialogHeader>
						<div className="pt-2">
							<CategoryForm onSuccess={() => setIsOpen(false)} />
						</div>
					</DialogContent>
				</Dialog>
			</div>

			{categories.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-muted-foreground text-sm">Ангилал олдсонгүй</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Эхлэхийн тулд анхны ангиллаа нэмнэ үү
					</p>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
					{categories.map((category) => (
						<CategoryCard key={category.id} {...category} />
					))}
				</div>
			)}
		</div>
	);
}
