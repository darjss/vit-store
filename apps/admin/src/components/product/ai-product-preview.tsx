import type { ExtractedProductData } from "@vit/shared";
import { Image } from "@unpic/react";
import {
	AlertCircle,
	CheckCircle2,
	ExternalLink,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AIProductPreviewProps {
	data: ExtractedProductData;
	onConfirm: () => void;
	onEdit: () => void;
	onCancel: () => void;
}

export function AIProductPreview({
	data,
	onConfirm,
	onEdit,
	onCancel,
}: AIProductPreviewProps) {
	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-hard">
			<div className="flex items-center justify-between border-border border-b-2 bg-green-500 px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center border-2 border-white/30 bg-white/10">
						<CheckCircle2 className="h-4 w-4 text-white" />
					</div>
					<div>
						<h3 className="font-bold font-heading text-white">
							Амжилттай татлаа!
						</h3>
						<p className="text-white/70 text-xs">
							Мэдээллийг шалгаад батлана уу
						</p>
					</div>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onCancel}
					className="h-8 w-8 text-white hover:bg-white/10"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<CardContent className="space-y-4 p-4">
				{data.extractionStatus === "partial" && data.errors.length > 0 && (
					<div className="space-y-2 rounded-none border-2 border-yellow-500 bg-yellow-500/10 p-3">
						<div className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4 text-yellow-600" />
							<span className="font-bold text-sm text-yellow-700">
								Зарим мэдээлэл дутуу байна
							</span>
						</div>
						<ul className="space-y-1 text-xs text-yellow-700">
							{data.errors.map((error, i) => (
								<li key={i}>• {error}</li>
							))}
						</ul>
					</div>
				)}

				<div className="space-y-3">
					{data.images.length > 0 && (
						<div className="flex gap-2 overflow-x-auto pb-2">
							{data.images.slice(0, 5).map((img, i) => (
								<div
									key={i}
									className="relative h-20 w-20 shrink-0 overflow-hidden border-2 border-border bg-muted"
								>
									<Image
										src={img.url}
										alt={`Product ${i + 1}`}
										width={80}
										height={80}
										className="h-full w-full object-cover"
									/>
								</div>
							))}
							{data.images.length > 5 && (
								<div className="flex h-20 w-20 shrink-0 items-center justify-center border-2 border-border border-dashed bg-muted/50">
									<span className="font-bold text-muted-foreground text-sm">
										+{data.images.length - 5}
									</span>
								</div>
							)}
						</div>
					)}

					<div className="grid gap-2 sm:grid-cols-2">
						<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
								Нэр (EN)
							</p>
							<p className="font-medium text-sm">{data.name}</p>
						</div>
						<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
								Нэр (MN)
							</p>
							<p className="font-medium text-sm">{data.name_mn}</p>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
								Брэнд
							</p>
							<p className="truncate font-medium text-sm">
								{data.brand || "-"}
								{data.brandId && (
									<span className="ml-1 text-green-600 text-xs">✓</span>
								)}
							</p>
						</div>
						<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
								Ангилал
							</p>
							<p className="truncate font-medium text-sm">
								{data.categoryId ? (
									<span className="text-green-600">auto ✓</span>
								) : (
									<span className="text-muted-foreground">—</span>
								)}
							</p>
						</div>
						<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
								Хэмжээ
							</p>
							<p className="truncate font-medium text-sm">{data.amount}</p>
						</div>
						<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
								Хүч
							</p>
							<p className="truncate font-medium text-sm">{data.potency}</p>
						</div>
					</div>

					{(data.amazonPriceUsd != null || data.calculatedPriceMnt != null) && (
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
								<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
									Amazon үнэ (USD)
								</p>
								<p className="truncate font-medium text-sm">
									{data.amazonPriceUsd != null
										? `$${data.amazonPriceUsd.toFixed(2)}`
										: "—"}
								</p>
							</div>
							<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
								<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
									Тооцсон үнэ (MNT)
								</p>
								<p className="truncate font-medium text-sm">
									{data.calculatedPriceMnt != null
										? `${data.calculatedPriceMnt.toLocaleString("en-US")}`
										: "—"}
								</p>
							</div>
						</div>
					)}

					<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
						<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
							Тайлбар
						</p>
						<p className="line-clamp-3 text-sm">{data.description}</p>
					</div>

					{data.sourceUrl && (
						<a
							href={data.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
						>
							<ExternalLink className="h-3 w-3" />
							<span className="truncate">{data.sourceUrl}</span>
						</a>
					)}
				</div>

				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						className="flex-1"
					>
						Болих
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={onEdit}
						className="flex-1"
					>
						Засах
					</Button>
					<Button type="button" onClick={onConfirm} className="flex-1">
						Баталж форм руу
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
