import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { CategorySelectType } from "@vit/api/db/schema";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/categories")({
	component: RouteComponent,
	loader: async ({ context: ctx }) => {
		await ctx.queryClient.ensureQueryData(
			ctx.trpc.category.getAllCategories.queryOptions(),
		);
	},
});

function RouteComponent() {
	const [isOpen, setIsOpen] = useState(false);

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
					<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-md">
						<DialogHeader className="border-b px-6 pt-6 pb-4">
							<DialogTitle>Ангилал нэмэх</DialogTitle>
							<DialogDescription>
								Каталогт шинэ ангилал үүсгэх.
							</DialogDescription>
						</DialogHeader>
						<div className="max-h-[80vh] overflow-y-auto p-6">
							<CategoryForm onSuccess={() => setIsOpen(false)} />
						</div>
					</DialogContent>
				</Dialog>
			</div>

			<Suspense
				fallback={
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
						{Array.from({ length: 12 }).map((_, index) => (
							<Skeleton
								key={index}
								className="aspect-square rounded-base border-2 border-border"
							/>
						))}
					</div>
				}
			>
				<CategoriesList />
			</Suspense>
		</div>
	);
}

function CategoriesList() {
	const { data: categories } = useSuspenseQuery(
		trpc.category.getAllCategories.queryOptions(),
	);

	if (categories.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-muted-foreground text-sm">Ангилал олдсонгүй</p>
				<p className="mt-1 text-muted-foreground text-xs">
					Эхлэхийн тулд анхны ангиллаа нэмнэ үү
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
			{categories.map((category) => (
				<CategoryCard key={category.id} {...(category as CategorySelectType)} />
			))}
		</div>
	);
}
