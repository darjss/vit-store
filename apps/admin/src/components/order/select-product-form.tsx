import { useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { Loader2, Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { useCallback, useState } from "react";
import { type UseFormReturn, useFieldArray } from "react-hook-form";
import type { ProductSearchForOrderType } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";

const SelectProductForm = ({ form }: { form: UseFormReturn<any> }) => {
	const [inputValue, setInputValue] = useState("");
	const [debouncedSearchValue, setDebouncedSearchValue] = useState("");

	const debouncedSearch = useCallback(
		debounce((value: string) => {
			setDebouncedSearchValue(value);
		}, 300),
		[],
	);

	const { data, isFetching } = useQuery({
		...trpc.product.searchProductsInstant.queryOptions({
			query: debouncedSearchValue,
			limit: 10,
		}),
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
		enabled: !!debouncedSearchValue,
	});

	const { fields, append, remove, update } = useFieldArray({
		control: form.control,
		name: "products",
	});

	const handleQuantityChange = (index: number, type: "add" | "minus") => {
		const currentValue = form.getValues(`products.${index}.quantity`);
		const newQuantity =
			type === "add" ? currentValue + 1 : Math.max(1, currentValue - 1);
		update(index, { ...fields[index], quantity: newQuantity });
	};

	const handleSelectProduct = (product: ProductSearchForOrderType) => {
		const existingIndex = fields.findIndex(
			(field: any) => field.productId === product.id,
		);

		if (existingIndex >= 0) {
			handleQuantityChange(existingIndex, "add");
		} else {
			append({
				productId: product.id,
				quantity: 1,
				price: product.price,
				name: product.name,
				imageUrl: product.images[0]?.url,
				stock: product.stock,
			});
		}
		setInputValue("");
		setDebouncedSearchValue("");
	};

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);
		debouncedSearch(value);
	};

	const getTotalPrice = () => {
		return fields.reduce((total, _, index) => {
			const product = form.getValues(`products.${index}`);
			return total + product.price * product.quantity;
		}, 0);
	};

	const getTotalItems = () => {
		return fields.reduce((total, _, index) => {
			const product = form.getValues(`products.${index}`);
			return total + product.quantity;
		}, 0);
	};

	return (
		<div className="space-y-3">
			{/* Search Section */}
			<div className="relative">
				<div className="relative">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Бүтээгдэхүүнийг нэрээр хайх..."
						className="border-2 border-border pl-10"
						value={inputValue}
						onChange={handleSearchChange}
					/>
				</div>
				{isFetching && (
					<div className="mt-2 flex items-center text-muted-foreground text-xs">
						<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
						Хайж байна...
					</div>
				)}
				{data !== undefined && data?.length > 0 && inputValue && (
					<Card className="absolute right-0 left-0 z-[100] mt-1 border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
						<ScrollArea className="max-h-[260px]">
							<div className="p-1">
								{data.map((product) => (
									<button
										key={product.id}
										className="flex w-full items-center gap-2.5 p-2 text-left transition-colors hover:bg-accent"
										onClick={() => handleSelectProduct(product)}
										type="button"
									>
										<div className="h-10 w-10 flex-shrink-0 overflow-hidden border-2 border-border bg-muted">
											<img
												src={product.images[0]?.url || "/placeholder.svg"}
												alt={product.name}
												className="h-full w-full object-cover"
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-bold text-xs">
												{product.name}
											</p>
											<div className="mt-0.5 flex items-center gap-2">
												<span className="font-bold text-foreground text-xs tabular-nums">
													{formatCurrency(product.price)}
												</span>
												<span className="text-[10px] text-muted-foreground">
													үлдэгдэл: {product.stock}
												</span>
											</div>
										</div>
									</button>
								))}
							</div>
						</ScrollArea>
					</Card>
				)}
				{data?.length === 0 && inputValue && !isFetching && (
					<Card className="absolute right-0 left-0 z-[100] mt-1 border-2 border-border">
						<CardContent className="p-3 text-center text-muted-foreground text-xs">
							"{inputValue}" олдсонгүй
						</CardContent>
					</Card>
				)}
			</div>

			{/* Selected Products */}
			{fields.length > 0 && (
				<div className="space-y-2.5">
					{/* Summary bar */}
					<div className="flex flex-wrap items-center justify-between gap-2 border-2 border-border bg-muted/50 px-3 py-2">
						<div className="flex items-center gap-2">
							<ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
							<span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
								Сонгосон
							</span>
							<span className="flex h-5 min-w-5 items-center justify-center border-2 border-border bg-background px-1 font-bold text-[10px] tabular-nums">
								{getTotalItems()}
							</span>
						</div>
						<span className="font-bold text-sm tabular-nums">
							{formatCurrency(getTotalPrice())}
						</span>
					</div>

					{/* Product list */}
					<div className="space-y-2">
						{fields.map((field, index) => {
							const product = form.getValues(`products.${index}`);
							const itemTotal = product.price * product.quantity;

							return (
								<div
									key={field.id}
									className="border-2 border-border bg-background"
								>
									{/* Top row: image + name + remove */}
									<div className="flex items-center gap-2.5 p-2.5 pb-2">
										<div className="h-11 w-11 flex-shrink-0 overflow-hidden border-2 border-border bg-muted">
											<img
												src={product.imageUrl || "/placeholder.svg"}
												alt={product.name}
												className="h-full w-full object-cover"
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-bold text-xs leading-tight sm:text-sm">
												{product.name}
											</p>
											<div className="mt-0.5 flex items-center gap-1.5">
												<span className="text-[11px] text-muted-foreground tabular-nums">
													{formatCurrency(product.price)} /ш
												</span>
												<span className="text-border">|</span>
												<span className="text-[11px] text-muted-foreground">
													үлдэгдэл: {product.stock}
												</span>
											</div>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => remove(index)}
											className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										>
											<X className="h-3.5 w-3.5" />
										</Button>
									</div>

									{/* Bottom row: quantity controls + line total */}
									<div className="flex items-center justify-between border-border border-t border-dashed px-2.5 py-2">
										<div className="flex items-center gap-1">
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => handleQuantityChange(index, "minus")}
												className="h-7 w-7 border-2 border-border"
												disabled={product.quantity <= 1}
											>
												<Minus className="h-3 w-3" />
											</Button>
											<div className="flex h-7 w-10 items-center justify-center border-2 border-border bg-muted">
												<span className="font-bold text-xs tabular-nums">
													{product.quantity}
												</span>
											</div>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => handleQuantityChange(index, "add")}
												className="h-7 w-7 border-2 border-border"
												disabled={product.quantity >= product.stock}
											>
												<Plus className="h-3 w-3" />
											</Button>
										</div>
										<span className="font-bold text-sm tabular-nums">
											{formatCurrency(itemTotal)}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Empty State */}
			{fields.length === 0 && (
				<div className="flex flex-col items-center justify-center border-2 border-border border-dashed py-8">
					<ShoppingCart className="mb-2 h-8 w-8 text-muted-foreground/50" />
					<p className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
						Бүтээгдэхүүн сонгогдоогүй
					</p>
					<p className="mt-0.5 text-[11px] text-muted-foreground/70">
						Бүтээгдэхүүн хайж захиалгад нэмнэ үү
					</p>
				</div>
			)}
		</div>
	);
};

export default SelectProductForm;
