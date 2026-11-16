import { PackageX, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProductType } from "@/lib/types";
import { cn } from "@/lib/utils";

function ProductStatusBadge({
	isOutOfStock,
	statusLabel,
}: {
	isOutOfStock: boolean;
	statusLabel: string;
}) {
	const badgeClassName = cn(
		"inline-flex shrink-0 items-center border px-1.5 py-0.5 text-[11px] leading-none font-semibold shadow-none",
		isOutOfStock
			? "border-destructive/50 bg-destructive/10 text-destructive"
			: "border-emerald-600/45 bg-emerald-500/10 text-emerald-950",
	);

	return (
		<Badge className={badgeClassName}>
			{isOutOfStock ? <PackageX className="mr-1 h-3 w-3" /> : <Sparkles className="mr-1 h-3 w-3" />}
			{statusLabel}
		</Badge>
	);
}

export function ProductSummary({
	brandName,
	categoryName,
	isOutOfStock,
	onOpen,
	onRequestActivateConfirm,
	primaryImage,
	product,
	statusLabel,
}: {
	brandName?: string;
	categoryName?: string;
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
					className="border-border max-w-[16rem] border p-3 text-xs"
					onClick={(e) => e.stopPropagation()}
					side="left"
					sideOffset={6}
				>
					<p className="font-medium">Төлөв</p>
					<p className="text-muted-foreground mb-2 leading-snug">
						Идэвхтэй болгоход дэлгүүрт харагдана.
					</p>
					<Button
						className="rounded-base border-border h-8 w-full border"
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
			className="focus-visible:ring-ring flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:ring-2 focus-visible:outline-none"
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
			<img
				alt={product.name}
				className="size-20 shrink-0 border bg-white object-contain p-1"
				loading="lazy"
				src={primaryImage || "/placeholder.jpg"}
			/>
			<div className="min-w-0 flex-1">
				<h3 className="line-clamp-2 text-[15px] leading-snug font-medium">{product.name}</h3>
				<div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
					<span className="truncate">{[brandName, categoryName].filter(Boolean).join(" · ")}</span>
					{product.status !== "active" || isOutOfStock ? statusControl : null}
				</div>
			</div>
		</div>
	);
}
