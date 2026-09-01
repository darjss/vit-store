import { Package, PackageX, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
		"rounded-base inline-flex shrink-0 items-center self-start border-2 px-2.5 py-1 text-[11px] leading-none font-semibold shadow-none sm:text-xs",
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
	brandName,
	categoryName,
	currentPrice,
	currentStock,
	isOutOfStock,
	onOpen,
	onRequestActivateConfirm,
	primaryImage,
	product,
	statusLabel,
}: {
	brandName?: string;
	categoryName?: string;
	/** Price to display, including an in-flight optimistic edit. */
	currentPrice: number;
	currentStock: number;
	isOutOfStock: boolean;
	onOpen: () => void;
	/** When set, status badge opens a tooltip-style panel with an action to start activation (confirm in parent). */
	onRequestActivateConfirm?: () => void;
	primaryImage: string;
	product: ProductType;
	statusLabel: string;
}) {
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const canShowActivate = onRequestActivateConfirm !== undefined;

	const statusBadge = <ProductStatusBadge isOutOfStock={isOutOfStock} statusLabel={statusLabel} />;

	const statusControl = canShowActivate ? (
		<TooltipProvider delayDuration={200}>
			<Tooltip onOpenChange={setTooltipOpen} open={tooltipOpen}>
				<TooltipTrigger asChild>
					<span
						className="inline-flex shrink-0 cursor-pointer"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						role="presentation"
					>
						{statusBadge}
					</span>
				</TooltipTrigger>
				<TooltipContent
					className="border-border max-w-[16rem] border-2 p-3 text-xs"
					onClick={(e) => e.stopPropagation()}
					side="left"
					sideOffset={6}
				>
					<p className="font-medium">Төлөв</p>
					<p className="text-muted-foreground mb-2 leading-snug">
						Идэвхтэй болгоход дэлгүүрт харагдана.
					</p>
					<Button
						className="rounded-base border-border h-8 w-full border-2"
						onClick={(e) => {
							e.stopPropagation();
							setTooltipOpen(false);
							onRequestActivateConfirm?.();
						}}
						size="sm"
						type="button"
					>
						Идэвхжүүлэх
					</Button>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	) : (
		statusBadge
	);

	return (
		<div
			className="focus-visible:ring-ring flex w-full cursor-pointer flex-col text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-row"
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Image */}
			<div className="border-border bg-background relative w-full border-b-2 sm:w-44 sm:shrink-0 sm:border-r-2 sm:border-b-0">
				<div className="aspect-square w-full overflow-hidden sm:aspect-auto sm:h-full">
					<img
						alt={product.name}
						className="h-full w-full object-contain p-3 sm:p-2"
						loading="lazy"
						src={primaryImage || "/placeholder.jpg"}
					/>
				</div>
			</div>

			{/* Info */}
			<div className="flex flex-1 flex-col justify-between p-3">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 flex-1">
						<h3 className="line-clamp-2 text-sm leading-snug font-bold sm:text-base">
							{product.name}
						</h3>
						<div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
							{brandName && <span>{brandName}</span>}
							{brandName && categoryName && <span className="text-border">|</span>}
							{categoryName && <span>{categoryName}</span>}
						</div>
					</div>
					{statusControl}
				</div>

				<div className="mt-1.5 flex items-center gap-3">
					<div className="text-sm font-bold tabular-nums sm:text-base">
						₮{currentPrice.toLocaleString()}
					</div>
					<div
						className={cn(
							"flex items-center gap-1 rounded-full px-2.5 py-1",
							isOutOfStock
								? "border border-[#7a1f1f] bg-[#ffe3e3] text-[#7a1f1f]"
								: getStockColor(currentStock),
						)}
					>
						{isOutOfStock ? (
							<PackageX className="h-3.5 w-3.5" />
						) : (
							<Package className="h-3.5 w-3.5" />
						)}
						<span className="text-xs font-bold tabular-nums sm:text-sm">
							{isOutOfStock ? "0" : currentStock}
						</span>
						<span className="text-[10px] sm:text-xs">{isOutOfStock ? "дууссан" : "үлдэгдэл"}</span>
					</div>
				</div>
			</div>
		</div>
	);
}
