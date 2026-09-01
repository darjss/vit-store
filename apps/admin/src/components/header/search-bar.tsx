import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Props = {
	autoFocus?: boolean;
	onSelectOrder?: (orderId: number) => void;
	onSelectProduct?: (productId: number) => void;
	placeholder?: string;
};

const SearchBar = ({
	autoFocus = false,
	onSelectOrder,
	onSelectProduct,
	placeholder = "Хайх",
}: Props) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [inputValue, setInputValue] = useState("");
	const [debouncedValue, setDebouncedValue] = useState("");
	const [isFocused, setIsFocused] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedValue(inputValue.trim());
		}, 250);

		return () => clearTimeout(timer);
	}, [inputValue]);

	const productQuery = useQuery({
		...trpc.product.searchProductsInstant.queryOptions({
			limit: 5,
			query: debouncedValue,
		}),
		enabled: debouncedValue.length >= 1,
		staleTime: 60_000,
	});

	const orderQuery = useQuery({
		...trpc.order.searchOrderQuick.queryOptions({
			limit: 5,
			query: debouncedValue,
		}),
		enabled: debouncedValue.length >= 1,
		staleTime: 60_000,
	});

	const products = productQuery.data ?? [];
	const orders = orderQuery.data ?? [];
	const isSearching = productQuery.isFetching || orderQuery.isFetching;
	const shouldShowDropdown = isFocused && debouncedValue.length >= 1;

	const handleSubmit = () => {
		if (products.length > 0) {
			onSelectProduct?.(products[0].id);
			return;
		}

		if (orders.length > 0) {
			onSelectOrder?.(orders[0].id);
		}
	};

	const clearInput = () => {
		setInputValue("");
		setDebouncedValue("");
		inputRef.current?.focus();
	};

	const handleSelectProduct = (productId: number) => {
		onSelectProduct?.(productId);
		clearInput();
	};

	const handleSelectOrder = (orderId: number) => {
		onSelectOrder?.(orderId);
		clearInput();
	};

	return (
		<div className="group relative flex items-center">
			<div className="text-foreground/60 group-focus-within:text-foreground pointer-events-none absolute left-3">
				<Search className="h-4 w-4" />
			</div>

			<Input
				aria-label="Хайх"
				autoFocus={autoFocus}
				className="rounded-base h-10 w-full pr-10 pl-9"
				onBlur={() => setIsFocused(false)}
				onChange={(e) => setInputValue(e.target.value)}
				onFocus={() => setIsFocused(true)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						handleSubmit();
					}
					if (e.key === "Escape") {
						clearInput();
					}
				}}
				placeholder={placeholder}
				ref={inputRef}
				type="text"
				value={inputValue}
			/>

			<div className="absolute right-1 flex items-center gap-1">
				{inputValue ? (
					<button
						aria-label="Хайлт цэвэрлэх"
						className="rounded-base text-foreground/60 ring-offset-background hover:bg-primary hover:text-primary-foreground focus-visible:ring-ring flex h-8 w-8 items-center justify-center focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						onClick={clearInput}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				) : null}

				<Button
					aria-label="Хайх"
					className="h-8"
					onClick={handleSubmit}
					size="sm"
					type="button"
					variant="secondary"
				>
					<Search className="h-4 w-4" />
				</Button>
			</div>

			{shouldShowDropdown ? (
				<div className="rounded-base border-border bg-background shadow-shadow absolute top-[calc(100%+8px)] right-0 left-0 z-50 max-h-[360px] overflow-y-auto border-2 p-2">
					{isSearching ? (
						<div className="text-muted-foreground px-2 py-3 text-sm">Хайж байна...</div>
					) : (
						<>
							{products.length > 0 ? (
								<div className="mb-2">
									<p className="text-muted-foreground px-2 py-1 text-xs font-semibold uppercase">
										Бүтээгдэхүүн
									</p>
									{products.map((product) => (
										<button
											className="rounded-base hover:bg-accent flex w-full items-center gap-3 px-2 py-2 text-left"
											key={`product-${product.id}`}
											onClick={() => handleSelectProduct(product.id)}
											onMouseDown={(e) => e.preventDefault()}
											type="button"
										>
											<div className="rounded-base border-border bg-muted h-10 w-10 shrink-0 overflow-hidden border">
												<img
													alt={product.name}
													className="h-full w-full object-cover"
													src={product.images[0]?.url || "/placeholder.svg"}
												/>
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">{product.name}</p>
												<p className="text-muted-foreground text-xs">
													{formatCurrency(product.price)} • үлдэгдэл {product.stock}
												</p>
											</div>
										</button>
									))}
								</div>
							) : null}

							{orders.length > 0 ? (
								<div>
									<p className="text-muted-foreground px-2 py-1 text-xs font-semibold uppercase">
										Захиалга
									</p>
									{orders.map((order) => (
										<button
											className="rounded-base hover:bg-accent w-full px-2 py-2 text-left"
											key={`order-${order.id}`}
											onClick={() => handleSelectOrder(order.id)}
											onMouseDown={(e) => e.preventDefault()}
											type="button"
										>
											<p className="text-sm font-medium">#{order.orderNumber}</p>
											<p className="text-muted-foreground text-xs">
												{order.customerPhone} • {formatCurrency(order.total)}
											</p>
										</button>
									))}
								</div>
							) : null}

							{products.length === 0 && orders.length === 0 ? (
								<div className="text-muted-foreground px-2 py-3 text-sm">
									"{debouncedValue}" илэрц олдсонгүй
								</div>
							) : null}
						</>
					)}
				</div>
			) : null}
		</div>
	);
};

export default SearchBar;
