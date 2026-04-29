import { Package, PackageX, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProductType } from "@/lib/types";
import { cn, getStockColor } from "@/lib/utils";

function ProductStatusBadge({
	isOutOfStock,
	statusLabel,
}: {
	isOutOfStock: boolean;
	statusLabel: string;
}) {
	const badgeClassName = cn(
		"inline-flex shrink-0 items-center self-start rounded-base border-2 px-2.5 py-1 font-semibold text-[11px] leading-none shadow-none sm:text-xs",
		isOutOfStock
			? "border-destructive/50 bg-destructive/10 text-destructive"
			: "border-emerald-600/45 bg-emerald-500/10 text-emerald-950",
	);

	return (
		<Badge className={badgeClassName}>
			{isOutOfStock ? (
				<PackageX className="mr-1 h-3.5 w-3.5" />
			) : (
				<Sparkles className="mr-1 h-3.5 w-3.5" />
			)}
			{statusLabel}
		</Badge>
	);
}

export function ProductSummary({
	product,
	primaryImage,
	brandName,
	categoryName,
	isOutOfStock,
	statusLabel,
	onOpen,
}: {
	product: ProductType;
	primaryImage: string;
	brandName?: string;
	categoryName?: string;
	isOutOfStock: boolean;
	statusLabel: string;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
			className="flex w-full flex-row text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		>
			<div className="flex h-20 w-20 shrink-0 items-center justify-center border-border border-r-2 bg-background p-2">
				<div className="h-full w-full overflow-hidden rounded-base border-2 border-border bg-background p-2">
					<img
						src={primaryImage || "/placeholder.jpg"}
						alt={product.name}
						className="h-full w-full object-contain"
						loading="lazy"
					/>
				</div>
			</div>

			<div className="flex flex-1 flex-col p-3">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 flex-1">
						<h3 className="line-clamp-2 font-bold text-sm leading-snug sm:text-base">
							{product.name}
						</h3>
						<div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs sm:text-sm">
							{brandName && <span>{brandName}</span>}
							{brandName && categoryName && <span className="text-border">|</span>}
							{categoryName && <span>{categoryName}</span>}
						</div>
					</div>
					<ProductStatusBadge isOutOfStock={isOutOfStock} statusLabel={statusLabel} />
				</div>

				<div className="mt-1.5 flex items-center gap-3">
					<div className="font-bold text-sm tabular-nums sm:text-base">
						₮{product.price.toLocaleString()}
					</div>
					<div
						className={cn(
							"flex items-center gap-1 rounded-full px-2.5 py-1",
							isOutOfStock
								? "border border-[#7a1f1f] bg-[#ffe3e3] text-[#7a1f1f]"
								: getStockColor(product.stock),
						)}
					>
						{isOutOfStock ? <PackageX className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
						<span className="font-bold text-xs tabular-nums sm:text-sm">
							{isOutOfStock ? "0" : product.stock}
						</span>
						<span className="text-[10px] sm:text-xs">
							{isOutOfStock ? "дууссан" : "үлдэгдэл"}
						</span>
					</div>
				</div>
			</div>
		</button>
	);
}
