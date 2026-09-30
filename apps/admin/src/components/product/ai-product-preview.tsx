import type { ExtractedProductData } from "@vit/shared";
import { Image } from "@unpic/react";
import { AlertCircle, CheckCircle2, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AIProductPreviewProps {
	data: ExtractedProductData;
	onCancel: () => void;
	onConfirm: () => void;
	onEdit: () => void;
}

export function AIProductPreview({ data, onCancel, onConfirm, onEdit }: AIProductPreviewProps) {
	return (
		<Card className="border-border bg-card shadow-hard overflow-hidden border-2">
			<div className="border-border flex items-center justify-between border-b-2 bg-green-500 px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center border-2 border-white/30 bg-white/10">
						<CheckCircle2 className="h-4 w-4 text-white" />
					</div>
					<div>
						<h3 className="font-heading font-bold text-white">Амжилттай татлаа!</h3>
						<p className="text-xs text-white/70">Мэдээллийг шалгаад батлана уу</p>
					</div>
				</div>
				<Button
					className="h-8 w-8 text-white hover:bg-white/10"
					onClick={onCancel}
					size="icon"
					type="button"
					variant="ghost"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<CardContent className="space-y-4 p-4">
				{data.extractionStatus === "partial" && data.errors.length > 0 && (
					<div className="space-y-2 rounded-none border-2 border-yellow-500 bg-yellow-500/10 p-3">
						<div className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4 text-yellow-600" />
							<span className="text-sm font-bold text-yellow-700">Зарим мэдээлэл дутуу байна</span>
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
									className="border-border bg-muted relative h-20 w-20 shrink-0 overflow-hidden border-2"
									key={i}
								>
									<Image
										alt={`Бүтээгдэхүүн ${i + 1}`}
										className="h-full w-full object-cover"
										height={80}
										src={img.url}
										width={80}
									/>
								</div>
							))}
							{data.images.length > 5 && (
								<div className="border-border bg-muted/50 flex h-20 w-20 shrink-0 items-center justify-center border-2 border-dashed">
									<span className="text-muted-foreground text-sm font-bold">
										+{data.images.length - 5}
									</span>
								</div>
							)}
						</div>
					)}

					<div className="grid gap-2 sm:grid-cols-2">
						<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
							<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
								Нэр (EN)
							</p>
							<p className="text-sm font-medium">{data.name}</p>
						</div>
						<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
							<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
								Нэр (MN)
							</p>
							<p className="text-sm font-medium">{data.name_mn}</p>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
							<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
								Брэнд
							</p>
							<p className="truncate text-sm font-medium">
								{data.brand || "-"}
								{data.brandId && <span className="ml-1 text-xs text-green-600">✓</span>}
							</p>
						</div>
						<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
							<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
								Ангилал
							</p>
							<p className="truncate text-sm font-medium">
								{data.categoryId ? (
									<span className="text-green-600">авто ✓</span>
								) : (
									<span className="text-muted-foreground">—</span>
								)}
							</p>
						</div>
						<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
							<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
								Хэмжээ
							</p>
							<p className="truncate text-sm font-medium">{data.amount}</p>
						</div>
						<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
							<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
								Хүч
							</p>
							<p className="truncate text-sm font-medium">{data.potency}</p>
						</div>
					</div>

					{(data.amazonPriceUsd != null || data.calculatedPriceMnt != null) && (
						<div className="grid grid-cols-2 gap-2">
							<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
								<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
									Amazon үнэ (USD)
								</p>
								<p className="truncate text-sm font-medium">
									{data.amazonPriceUsd != null ? `$${data.amazonPriceUsd.toFixed(2)}` : "—"}
								</p>
							</div>
							<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
								<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
									Тооцсон үнэ (MNT)
								</p>
								<p className="truncate text-sm font-medium">
									{data.calculatedPriceMnt != null
										? `${data.calculatedPriceMnt.toLocaleString("en-US")}`
										: "—"}
								</p>
							</div>
						</div>
					)}

					<div className="border-border bg-muted/30 space-y-1 rounded-none border-2 p-2">
						<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
							Тайлбар
						</p>
						<p className="line-clamp-3 text-sm">{data.description}</p>
					</div>

					{data.sourceUrl && (
						<a
							className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
							href={data.sourceUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							<ExternalLink className="h-3 w-3" />
							<span className="truncate">{data.sourceUrl}</span>
						</a>
					)}
				</div>

				<div className="flex gap-2">
					<Button className="flex-1" onClick={onCancel} type="button" variant="outline">
						Болих
					</Button>
					<Button className="flex-1" onClick={onEdit} type="button" variant="secondary">
						Засах
					</Button>
					<Button className="flex-1" onClick={onConfirm} type="button">
						Баталж форм руу
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
