import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	CalendarDays,
	Eye,
	FileText,
	Package,
	PackageX,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import { cn, getStockColor } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_dash/review-products")({
	component: RouteComponent,
});

function RouteComponent() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const { data: products, isLoading } = useQuery({
		...trpc.product.getReviewProducts.queryOptions(),
	});

	const { mutate: setProductStock } = useMutation({
		...trpc.product.setProductStock.mutationOptions(),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: [["product", "getReviewProducts"]],
			});
		},
	});

	const { mutate: updateProductField } = useMutation({
		...trpc.product.updateProductField.mutationOptions(),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: [["product", "getReviewProducts"]],
			});
		},
	});

	const markOutOfStock = (id: number) => {
		setProductStock({ id, newStock: 0 });
	};

	const markDraft = (id: number) => {
		updateProductField({ id, field: "status", stringValue: "draft" });
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-heading text-2xl font-bold">
						Хянах бүтээгдэхүүнүүд
					</h1>
					<p className="text-muted-foreground text-sm">
						{isLoading
							? "Тоолж байна..."
							: `${products?.length ?? 0} ширхэг шинэчлээгүй бүтээгдэхүүн`}
					</p>
				</div>
			</div>

			{isLoading ? (
				<ReviewSkeleton />
			) : products && products.length > 0 ? (
				<div className="grid grid-cols-1 gap-3">
					{products.map((product: Record<string, unknown>) => {
						const p = product as {
							id: number;
							name: string;
							stock: number;
							status: string;
							price: number;
							updatedAt: Date | null;
							images: { url: string; isPrimary: boolean }[];
							brand: { name: string } | null;
							category: { name: string } | null;
						};
						return (
							<ReviewProductCard
								key={p.id}
								product={p}
								onMarkOutOfStock={() => markOutOfStock(p.id)}
								onMarkDraft={() => markDraft(p.id)}
								onViewDetails={() =>
									navigate({
										to: "/products/$id",
										params: { id: String(p.id) },
									})
								}
							/>
						);
					})}
				</div>
			) : (
				<div className="rounded-base border-2 border-border p-12 text-center text-muted-foreground">
					<PackageX className="mx-auto mb-3 h-12 w-12" />
					<p className="text-lg font-medium">Хянах бүтээгдэхүүн байхгүй</p>
					<p className="text-sm">Бүх идэвхтэй бүтээгдэхүүн шинэчлэгдсэн байна.</p>
				</div>
			)}
		</div>
	);
}

function ReviewProductCard({
	product,
	onMarkOutOfStock,
	onMarkDraft,
	onViewDetails,
}: {
	product: {
		id: number;
		name: string;
		stock: number;
		status: string;
		updatedAt: Date | null;
		images: { url: string; isPrimary: boolean }[];
		brand: { name: string } | null;
		category: { name: string } | null;
	};
	onMarkOutOfStock: () => void;
	onMarkDraft: () => void;
	onViewDetails: () => void;
}) {
	const [stockEditing, setStockEditing] = useState(false);
	const [stockValue, setStockValue] = useState(product.stock);
	const queryClient = useQueryClient();
	const { mutate: setProductStock, isPending: isStockPending } = useMutation({
		...trpc.product.setProductStock.mutationOptions(),
		onSuccess: () => {
			setStockEditing(false);
			void queryClient.invalidateQueries({
				queryKey: [["product", "getReviewProducts"]],
			});
		},
	});
	const { mutate: updateField, isPending: isFieldPending } = useMutation({
		...trpc.product.updateProductField.mutationOptions(),
		onSuccess: () => {
			setStockEditing(false);
			void queryClient.invalidateQueries({
				queryKey: [["product", "getReviewProducts"]],
			});
		},
	});

	const primaryImage =
		product.images.find((img) => img.isPrimary)?.url ||
		product.images[0]?.url ||
		"/placeholder.jpg";

	const isOutOfStock = product.stock <= 0 || product.status === "out_of_stock";
	const lastUpdated = product.updatedAt
		? formatRelativeDate(product.updatedAt)
		: "Хэзээ ч шинэчлээгүй";

	const handleSaveStock = () => {
		setProductStock({ id: product.id, newStock: stockValue });
	};

	const isPending = isStockPending || isFieldPending;

	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-none transition-all hover:shadow-none">
			<CardContent className="p-0">
				<div className="flex flex-col sm:flex-row">
					<div className="relative w-full border-border border-b-2 bg-background sm:w-28 sm:shrink-0 sm:border-b-0 sm:border-r-2">
						<div className="aspect-square w-full overflow-hidden sm:aspect-auto sm:h-full sm:max-h-28">
							<img
								src={primaryImage}
								alt={product.name}
								className="h-full w-full object-contain p-2"
								loading="lazy"
							/>
						</div>
					</div>

					<div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0 flex-1">
								<h3
									className="line-clamp-1 cursor-pointer font-bold text-sm hover:text-primary"
									onClick={onViewDetails}
								>
									{product.name}
								</h3>
								<div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
									{product.brand && <span>{product.brand.name}</span>}
									{product.brand && product.category && (
										<span className="text-border">|</span>
									)}
									{product.category && <span>{product.category.name}</span>}
								</div>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<div
								className={cn(
									"flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs",
									isOutOfStock
										? "border border-[#7a1f1f] bg-[#ffe3e3] text-[#7a1f1f]"
										: getStockColor(product.stock),
								)}
							>
								{isOutOfStock ? (
									<PackageX className="h-3 w-3" />
								) : (
									<Package className="h-3 w-3" />
								)}
								<span className="font-bold tabular-nums">
									{isOutOfStock ? 0 : product.stock}
								</span>
							</div>

							<div className="flex items-center gap-1 text-muted-foreground text-xs">
								<CalendarDays className="h-3 w-3" />
								<span>{lastUpdated}</span>
							</div>

							{product.stock <= 1 && (
								<div className="flex items-center gap-1 text-amber-600 text-xs">
									<AlertTriangle className="h-3 w-3" />
									<span>Үлдэгдэл {product.stock}</span>
								</div>
							)}
						</div>

						<div className="flex flex-wrap items-center gap-1.5">
							{stockEditing ? (
								<div className="flex items-center gap-1">
									<Input
										type="number"
										min="0"
										value={stockValue}
										onChange={(e) => {
											const val =
												e.target.value === ""
													? 0
													: Number.parseInt(e.target.value, 10);
											setStockValue(Number.isNaN(val) ? 0 : Math.max(0, val));
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleSaveStock();
											if (e.key === "Escape") {
												setStockValue(product.stock);
												setStockEditing(false);
											}
										}}
										className="h-7 w-20 border-2 border-border text-center text-xs"
										disabled={isPending}
									/>
									<Button
										size="sm"
										className="h-7 px-2 text-xs"
										onClick={handleSaveStock}
										disabled={isPending}
									>
										Хадг
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="h-7 px-2 text-xs"
										onClick={() => {
											setStockValue(product.stock);
											setStockEditing(false);
										}}
										disabled={isPending}
									>
										Цуц
									</Button>
								</div>
							) : (
								<Button
									variant="secondary"
									size="sm"
									onClick={() => setStockEditing(true)}
									className="h-7 rounded-base border-2 border-border px-2.5 text-xs"
								>
									<Package className="mr-1 h-3 w-3" />
									Үлдэгдэл
								</Button>
							)}

							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="destructive"
										size="sm"
										className="h-7 rounded-base border-2 border-border px-2.5 text-xs"
										disabled={isOutOfStock || isPending}
									>
										<PackageX className="mr-1 h-3 w-3" />
										Дууссан
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent className="border-2 border-border bg-background shadow-shadow">
									<AlertDialogHeader>
										<AlertDialogTitle className="font-heading text-lg">
											Үлдэгдэл тэглэх
										</AlertDialogTitle>
										<AlertDialogDescription>
											«{product.name}»-н үлдэгдлийг 0 болгох уу? Дэлгүүрт
											харагдахгүй болно.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter className="mt-6 flex gap-3">
										<AlertDialogCancel asChild>
											<Button variant="outline" className="flex-1">
												Цуцлах
											</Button>
										</AlertDialogCancel>
										<AlertDialogAction asChild>
											<Button
												className="flex-1"
												onClick={onMarkOutOfStock}
												disabled={isPending}
											>
												Тэглэх
											</Button>
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>

							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="h-7 rounded-base border-2 border-border px-2.5 text-xs"
										disabled={isPending}
									>
										<FileText className="mr-1 h-3 w-3" />
										Ноорог
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent className="border-2 border-border bg-background shadow-shadow">
									<AlertDialogHeader>
										<AlertDialogTitle className="font-heading text-lg">
											Ноорог болгох
										</AlertDialogTitle>
										<AlertDialogDescription>
											«{product.name}»-ийг ноорог төлөвт оруулах уу?
											Дэлгүүрт харагдахгүй болно.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter className="mt-6 flex gap-3">
										<AlertDialogCancel asChild>
											<Button variant="outline" className="flex-1">
												Цуцлах
											</Button>
										</AlertDialogCancel>
										<AlertDialogAction asChild>
											<Button
												variant="destructive"
												className="flex-1"
												onClick={onMarkDraft}
												disabled={isPending}
											>
												Ноорог болгох
											</Button>
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>

							<Button
								variant="ghost"
								size="sm"
								onClick={onViewDetails}
								className="h-7 px-2.5 text-xs"
							>
								<Eye className="mr-1 h-3 w-3" />
								Дэлгэрэнгүй
							</Button>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function formatRelativeDate(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "Саяхан";
	if (minutes < 60) return `${minutes}м өмнө`;
	if (hours < 24) return `${hours}ц өмнө`;
	if (days < 7) return `${days}ө өмнө`;
	return date.toLocaleDateString("mn-MN", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function ReviewSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-3">
			{Array.from({ length: 6 }).map((_, i) => (
				<div
					key={i}
					className="overflow-hidden rounded-base border-2 border-border bg-card shadow-none"
				>
					<div className="flex flex-col sm:flex-row">
						<div className="w-full border-border border-b-2 bg-background sm:w-28 sm:shrink-0 sm:border-b-0 sm:border-r-2">
							<div className="aspect-square w-full sm:aspect-auto sm:h-28">
								<Skeleton className="h-full w-full rounded-none" />
							</div>
						</div>
						<div className="flex flex-1 flex-col gap-2 p-3">
							<Skeleton className="h-5 w-3/4 rounded-base" />
							<Skeleton className="h-4 w-1/2 rounded-base" />
							<div className="flex gap-2">
								<Skeleton className="h-7 w-16 rounded-base" />
								<Skeleton className="h-7 w-20 rounded-base" />
								<Skeleton className="h-7 w-20 rounded-base" />
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
