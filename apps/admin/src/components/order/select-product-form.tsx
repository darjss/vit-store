import { useQuery } from "@tanstack/react-query";
import type { addOrderType } from "@vit/shared";
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

const SelectProductForm = ({ form }: { form: UseFormReturn<addOrderType> }) => {
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
			limit: 10,
			query: debouncedSearchValue,
		}),
		enabled: !!debouncedSearchValue,
		refetchOnWindowFocus: false,
		staleTime: 5 * 60 * 1000,
	});

	const { append, fields, remove, update } = useFieldArray({
		control: form.control,
		name: "products",
	});

	const handleQuantityChange = (index: number, type: "add" | "minus") => {
		const currentValue = form.getValues(`products.${index}.quantity`);
		const newQuantity = type === "add" ? currentValue + 1 : Math.max(1, currentValue - 1);
		update(index, { ...fields[index], quantity: newQuantity });
	};

	const handleSelectProduct = (product: ProductSearchForOrderType) => {
		const existingIndex = fields.findIndex((field) => field.productId === product.id);

		if (existingIndex >= 0) {
			handleQuantityChange(existingIndex, "add");
		} else {
			append({
				imageUrl: product.images[0]?.url,
				name: product.name,
				price: product.price,
				productId: product.id,
				quantity: 1,
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
					<Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
					<Input
						className="border-border border-2 pl-10"
						onChange={handleSearchChange}
						placeholder="Бүтээгдэхүүнийг нэрээр хайх..."
						value={inputValue}
					/>
				</div>
				{isFetching && (
					<div className="text-muted-foreground mt-2 flex items-center text-xs">
						<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
						Хайж байна...
					</div>
				)}
				{data !== undefined && data?.length > 0 && inputValue && (
					<Card className="border-border absolute right-0 left-0 z-[100] mt-1 border-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
						<ScrollArea className="max-h-[260px]">
							<div className="p-1">
								{data.map((product) => (
									<button
										className="hover:bg-accent flex w-full items-center gap-2.5 p-2 text-left transition-colors"
										key={product.id}
										onClick={() => handleSelectProduct(product)}
										type="button"
									>
										<div className="border-border bg-muted h-10 w-10 flex-shrink-0 overflow-hidden border-2">
											<img
												alt={product.name}
												className="h-full w-full object-cover"
												src={product.images[0]?.url || "/placeholder.svg"}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate text-xs font-bold">{product.name}</p>
											<div className="mt-0.5 flex items-center gap-2">
												<span className="text-foreground text-xs font-bold tabular-nums">
													{formatCurrency(product.price)}
												</span>
												<span className="text-muted-foreground text-[10px]">
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
					<Card className="border-border absolute right-0 left-0 z-[100] mt-1 border-2">
						<CardContent className="text-muted-foreground p-3 text-center text-xs">
							"{inputValue}" олдсонгүй
						</CardContent>
					</Card>
				)}
			</div>

			{/* Selected Products */}
			{fields.length > 0 && (
				<div className="space-y-2.5">
					{/* Summary bar */}
					<div className="border-border bg-muted/50 flex flex-wrap items-center justify-between gap-2 border-2 px-3 py-2">
						<div className="flex items-center gap-2">
							<ShoppingCart className="text-muted-foreground h-3.5 w-3.5" />
							<span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
								Сонгосон
							</span>
							<span className="border-border bg-background flex h-5 min-w-5 items-center justify-center border-2 px-1 text-[10px] font-bold tabular-nums">
								{getTotalItems()}
							</span>
						</div>
						<span className="text-sm font-bold tabular-nums">
							{formatCurrency(getTotalPrice())}
						</span>
					</div>

					{/* Product list */}
					<div className="space-y-2">
						{fields.map((field, index) => {
							const product = form.getValues(`products.${index}`);
							const itemTotal = product.price * product.quantity;

							return (
								<div className="border-border bg-background border-2" key={field.id}>
									{/* Top row: image + name + remove */}
									<div className="flex items-center gap-2.5 p-2.5 pb-2">
										<div className="border-border bg-muted h-11 w-11 flex-shrink-0 overflow-hidden border-2">
											<img
												alt={product.name}
												className="h-full w-full object-cover"
												src={product.imageUrl || "/placeholder.svg"}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate text-xs leading-tight font-bold sm:text-sm">
												{product.name}
											</p>
											<div className="mt-0.5 flex items-center gap-1.5">
												<span className="text-muted-foreground text-[11px] tabular-nums">
													{formatCurrency(product.price)} /ш
												</span>
												<span className="text-border">|</span>
												<span className="text-muted-foreground text-[11px]">
													үлдэгдэл: {product.stock}
												</span>
											</div>
										</div>
										<Button
											className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-7 w-7 shrink-0"
											onClick={() => remove(index)}
											size="icon"
											type="button"
											variant="ghost"
										>
											<X className="h-3.5 w-3.5" />
										</Button>
									</div>

									{/* Bottom row: quantity controls + line total */}
									<div className="border-border flex items-center justify-between border-t border-dashed px-2.5 py-2">
										<div className="flex items-center gap-1">
											<Button
												className="border-border h-7 w-7 border-2"
												disabled={product.quantity <= 1}
												onClick={() => handleQuantityChange(index, "minus")}
												size="icon"
												type="button"
												variant="outline"
											>
												<Minus className="h-3 w-3" />
											</Button>
											<div className="border-border bg-muted flex h-7 w-10 items-center justify-center border-2">
												<span className="text-xs font-bold tabular-nums">{product.quantity}</span>
											</div>
											<Button
												className="border-border h-7 w-7 border-2"
												disabled={product.stock !== undefined && product.quantity >= product.stock}
												onClick={() => handleQuantityChange(index, "add")}
												size="icon"
												type="button"
												variant="outline"
											>
												<Plus className="h-3 w-3" />
											</Button>
										</div>
										<span className="text-sm font-bold tabular-nums">
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
				<div className="border-border flex flex-col items-center justify-center border-2 border-dashed py-8">
					<ShoppingCart className="text-muted-foreground/50 mb-2 h-8 w-8" />
					<p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
						Бүтээгдэхүүн сонгогдоогүй
					</p>
					<p className="text-muted-foreground/70 mt-0.5 text-[11px]">
						Бүтээгдэхүүн хайж захиалгад нэмнэ үү
					</p>
				</div>
			)}
		</div>
	);
};

export default SelectProductForm;
