import { useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { Loader2, Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { useCallback, useState } from "react";
import { type UseFormReturn, useFieldArray } from "react-hook-form";
import type { ProductSearchForOrderType } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { Badge } from "../ui/badge";
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
		...trpc.product.searchProductByNameForOrder.queryOptions({
			searchTerm: debouncedSearchValue,
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
		<div className="space-y-4">
			{/* Search Section */}
			<div className="relative">
				<div className="relative">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Бүтээгдэхүүнийг нэрээр хайх..."
						className="pl-10"
						value={inputValue}
						onChange={handleSearchChange}
					/>
				</div>
				{isFetching && (
					<div className="mt-2 flex items-center text-muted-foreground text-sm">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Хайж байна...
					</div>
				)}
				{data !== undefined && data?.length > 0 && inputValue && (
					<Card className="absolute right-0 left-0 z-[100] mt-2 w-full shadow-lg">
						<ScrollArea className="max-h-[300px]">
							<div className="p-1">
								{data.map((product) => (
									<button
										key={product.id}
										className="flex w-full items-center gap-3 rounded-md p-3 text-left transition-colors hover:bg-accent"
										onClick={() => handleSelectProduct(product)}
										type="button"
									>
										<div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border bg-accent/50">
											<img
												src={product.images[0]?.url || "/placeholder.svg"}
												alt={product.name}
												className="h-full w-full object-cover"
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">
												{product.name}
											</p>
											<div className="flex items-center gap-2">
												<p className="font-semibold text-primary text-sm">
													{formatCurrency(product.price)}
												</p>
												<Badge variant="default" className="text-xs">
													үлдэгдэл: {product.stock}
												</Badge>
											</div>
										</div>
									</button>
								))}
							</div>
						</ScrollArea>
					</Card>
				)}
				{data?.length === 0 && inputValue && !isFetching && (
					<Card className="absolute right-0 left-0 z-[100] mt-2 w-full shadow-lg">
						<CardContent className="p-4 text-center text-muted-foreground text-sm">
							"{inputValue}" олдсонгүй
						</CardContent>
					</Card>
				)}
			</div>

			{/* Selected Products */}
			{fields.length > 0 && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="flex items-center gap-2 font-semibold text-base">
							<ShoppingCart className="h-5 w-5" />
							Сонгосон бүтээгдэхүүн
							<Badge variant="default">{getTotalItems()} ширхэг</Badge>
						</h3>
						<p className="font-bold text-foreground text-xl">
							Нийт: {formatCurrency(getTotalPrice())}
						</p>
					</div>

					<div className="space-y-3">
						{fields.map((field, index) => {
							const product = form.getValues(`products.${index}`);
							const itemTotal = product.price * product.quantity;

							return (
								<Card
									key={field.id}
									className="overflow-hidden transition-shadow hover:shadow-md"
								>
									<CardContent className="p-4">
										<div className="flex items-center gap-4">
											<div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border bg-accent/50">
												<img
													src={product.imageUrl || "/placeholder.svg"}
													alt={product.name}
													className="h-full w-full object-cover"
												/>
											</div>

											<div className="min-w-0 flex-1">
												<p className="truncate font-medium text-sm">
													{product.name}
												</p>
												<div className="mt-1 flex items-center gap-2">
													<p className="text-muted-foreground text-sm">
														{formatCurrency(product.price)} ш/нэг
													</p>
													<span className="text-muted-foreground">•</span>
													<Badge variant="outline" className="text-xs">
														үлдэгдэл: {product.stock}
													</Badge>
												</div>
											</div>

											<div className="flex items-center gap-3">
												<div className="flex items-center gap-1">
													<Button
														type="button"
														variant="outline"
														size="icon"
														onClick={() => handleQuantityChange(index, "minus")}
														className="h-8 w-8"
														disabled={product.quantity <= 1}
													>
														<Minus className="h-4 w-4" />
													</Button>
													<div className="flex h-8 w-12 items-center justify-center rounded-md border bg-accent/30">
														<span className="font-medium text-sm">
															{product.quantity}
														</span>
													</div>
													<Button
														type="button"
														variant="outline"
														size="icon"
														onClick={() => handleQuantityChange(index, "add")}
														className="h-8 w-8"
														disabled={product.quantity >= product.stock}
													>
														<Plus className="h-4 w-4" />
													</Button>
												</div>

												<div className="flex min-w-[80px] items-center justify-end gap-2">
													<span className="font-bold text-foreground text-sm">
														{formatCurrency(itemTotal)}
													</span>
													<Button
														type="button"
														variant="destructive"
														size="icon"
														onClick={() => remove(index)}
														className="h-8 w-8"
													>
														<X className="h-4 w-4" />
													</Button>
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							);
						})}
					</div>
				</div>
			)}

			{/* Empty State */}
			{fields.length === 0 && (
				<Card className="border-dashed">
					<CardContent className="flex flex-col items-center justify-center py-12">
						<ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
						<p className="text-center font-medium text-muted-foreground">
							Бүтээгдэхүүн сонгогдоогүй
						</p>
						<p className="text-center text-muted-foreground text-sm">
							Бүтээгдэхүүн хайж захиалгад нэмнэ үү
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
};

export default SelectProductForm;
