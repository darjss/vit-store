import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Props = {
	autoFocus?: boolean;
	placeholder?: string;
	onSelectProduct?: (productId: number) => void;
	onSelectOrder?: (orderId: number) => void;
};

const SearchBar = ({
	autoFocus = false,
	placeholder = "Search",
	onSelectProduct,
	onSelectOrder,
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
			query: debouncedValue,
			limit: 5,
		}),
		enabled: debouncedValue.length >= 1,
		staleTime: 60_000,
	});

	const orderQuery = useQuery({
		...trpc.order.searchOrderQuick.queryOptions({
			query: debouncedValue,
			limit: 5,
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
			<div className="pointer-events-none absolute left-3 text-foreground/60 group-focus-within:text-foreground">
				<Search className="h-4 w-4" />
			</div>

			<Input
				ref={inputRef}
				type="text"
				autoFocus={autoFocus}
				placeholder={placeholder}
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onFocus={() => setIsFocused(true)}
				onBlur={() => setIsFocused(false)}
				className="h-10 w-full rounded-base pr-10 pl-9"
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSubmit();
					if (e.key === "Escape") clearInput();
				}}
				aria-label="Search"
			/>

			<div className="absolute right-1 flex items-center gap-1">
				{inputValue ? (
					<button
						aria-label="Clear search"
						className="flex h-8 w-8 items-center justify-center rounded-base text-foreground/60 ring-offset-background hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						onClick={clearInput}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				) : null}

				<Button
					variant="secondary"
					size="sm"
					className="h-8"
					onClick={handleSubmit}
					aria-label="Submit search"
					type="button"
				>
					<Search className="h-4 w-4" />
				</Button>
			</div>

			{shouldShowDropdown ? (
				<div className="absolute top-[calc(100%+8px)] right-0 left-0 z-50 max-h-[360px] overflow-y-auto rounded-base border-2 border-border bg-background p-2 shadow-shadow">
					{isSearching ? (
						<div className="px-2 py-3 text-muted-foreground text-sm">
							Хайж байна...
						</div>
					) : (
						<>
							{products.length > 0 ? (
								<div className="mb-2">
									<p className="px-2 py-1 font-semibold text-muted-foreground text-xs uppercase">
										Бүтээгдэхүүн
									</p>
									{products.map((product) => (
										<button
											key={`product-${product.id}`}
											type="button"
											onMouseDown={(e) => e.preventDefault()}
											onClick={() => handleSelectProduct(product.id)}
											className="flex w-full items-center gap-3 rounded-base px-2 py-2 text-left hover:bg-accent"
										>
											<div className="h-10 w-10 shrink-0 overflow-hidden rounded-base border border-border bg-muted">
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
												<p className="text-muted-foreground text-xs">
													{formatCurrency(product.price)} • үлдэгдэл{" "}
													{product.stock}
												</p>
											</div>
										</button>
									))}
								</div>
							) : null}

							{orders.length > 0 ? (
								<div>
									<p className="px-2 py-1 font-semibold text-muted-foreground text-xs uppercase">
										Захиалга
									</p>
									{orders.map((order) => (
										<button
											key={`order-${order.id}`}
											type="button"
											onMouseDown={(e) => e.preventDefault()}
											onClick={() => handleSelectOrder(order.id)}
											className="w-full rounded-base px-2 py-2 text-left hover:bg-accent"
										>
											<p className="font-medium text-sm">
												#{order.orderNumber}
											</p>
											<p className="text-muted-foreground text-xs">
												{order.customerPhone} • {formatCurrency(order.total)}
											</p>
										</button>
									))}
								</div>
							) : null}

							{products.length === 0 && orders.length === 0 ? (
								<div className="px-2 py-3 text-muted-foreground text-sm">
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
