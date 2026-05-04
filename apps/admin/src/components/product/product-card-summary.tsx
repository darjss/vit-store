import { Package, PackageX, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
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
	currentStock,
	primaryImage,
	brandName,
	categoryName,
	isOutOfStock,
	statusLabel,
	onOpen,
	onRequestActivateConfirm,
}: {
	product: ProductType;
	currentStock: number;
	primaryImage: string;
	brandName?: string;
	categoryName?: string;
	isOutOfStock: boolean;
	statusLabel: string;
	onOpen: () => void;
	/** When set, status badge opens a tooltip-style panel with an action to start activation (confirm in parent). */
	onRequestActivateConfirm?: () => void;
}) {
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const canShowActivate = onRequestActivateConfirm !== undefined;

	const statusBadge = (
		<ProductStatusBadge isOutOfStock={isOutOfStock} statusLabel={statusLabel} />
	);

	const statusControl = canShowActivate ? (
		<TooltipProvider delayDuration={200}>
			<Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
				<TooltipTrigger asChild>
					<span
						className="inline-flex shrink-0 cursor-pointer"
						role="presentation"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						{statusBadge}
					</span>
				</TooltipTrigger>
				<TooltipContent
					side="left"
					className="max-w-[16rem] border-2 border-border p-3 text-xs"
					sideOffset={6}
					onClick={(e) => e.stopPropagation()}
				>
					<p className="font-medium">Төлөв</p>
					<p className="mb-2 text-muted-foreground leading-snug">
						Идэвхтэй болгоход дэлгүүрт харагдана.
					</p>
					<Button
						type="button"
						size="sm"
						className="h-8 w-full rounded-base border-2 border-border"
						onClick={(e) => {
							e.stopPropagation();
							setTooltipOpen(false);
							onRequestActivateConfirm?.();
						}}
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
			role="button"
			tabIndex={0}
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
			className="flex w-full cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row"
		>
			{/* Image */}
			<div className="relative w-full border-border border-b-2 bg-background sm:w-44 sm:shrink-0 sm:border-b-0 sm:border-r-2">
				<div className="aspect-square w-full overflow-hidden sm:aspect-auto sm:h-full">
					<img
						src={primaryImage || "/placeholder.jpg"}
						alt={product.name}
						className="h-full w-full object-contain p-3 sm:p-2"
						loading="lazy"
					/>
				</div>
			</div>

			{/* Info */}
			<div className="flex flex-1 flex-col justify-between p-3">
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
					{statusControl}
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
								: getStockColor(currentStock),
						)}
					>
						{isOutOfStock ? <PackageX className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
						<span className="font-bold text-xs tabular-nums sm:text-sm">
							{isOutOfStock ? "0" : currentStock}
						</span>
						<span className="text-[10px] sm:text-xs">
							{isOutOfStock ? "дууссан" : "үлдэгдэл"}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
