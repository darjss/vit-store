import { useMutation } from "@tanstack/react-query";
import { AlertCircle, FileImage, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { UploadButton } from "@/components/upload-button";
import type { RouterOutputs } from "@/lib/types";
import { trpc } from "@/utils/trpc";

type ExtractedPurchaseData = RouterOutputs["aiPurchase"]["extractPurchaseFromImages"];

const matchStatusLabel: Record<string, string> = {
	ambiguous: "Эргэлзээтэй",
	matched: "Тохирсон",
	unmatched: "Тохироогүй",
};

const extractionStatusLabel: Record<string, string> = {
	failed: "Амжилтгүй",
	partial: "Хэсэгчилсэн",
	success: "Амжилттай",
};

type AIInvoiceInputProps = {
	onCancel: () => void;
	onExtracted: (data: ExtractedPurchaseData) => void;
};

export function AIPurchaseInput({ onCancel, onExtracted }: AIInvoiceInputProps) {
	const [provider, setProvider] = useState<"amazon" | "iherb" | "naturebell" | "unknown">("amazon");
	const [images, setImages] = useState<Array<{ url: string }>>([]);

	const extractMutation = useMutation({
		...trpc.aiPurchase.extractPurchaseFromImages.mutationOptions(),
		onSuccess: onExtracted,
	});

	return (
		<Card className="border-border bg-card shadow-hard overflow-hidden border-2">
			<div className="border-border bg-primary flex items-center justify-between border-b-2 px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="border-primary-foreground/30 bg-primary-foreground/10 flex h-8 w-8 items-center justify-center border-2">
						<Sparkles className="text-primary-foreground h-4 w-4" />
					</div>
					<div>
						<h3 className="font-heading text-primary-foreground font-bold">AI падаан оруулалт</h3>
						<p className="text-primary-foreground/70 text-xs">
							Худалдан авалтын зураг оруулж, ялгаж авсан мэдээллийг шалгах
						</p>
					</div>
				</div>
				<Button
					className="text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
					onClick={onCancel}
					size="icon"
					type="button"
					variant="ghost"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<CardContent className="space-y-4 p-4">
				<div className="space-y-2">
					<Label>Нийлүүлэгч</Label>
					<Select onValueChange={(value) => setProvider(value as typeof provider)} value={provider}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="amazon">Amazon</SelectItem>
							<SelectItem value="iherb">iHerb</SelectItem>
							<SelectItem value="naturebell">Naturebell</SelectItem>
							<SelectItem value="unknown">Тодорхойгүй</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="rounded-base border-border bg-muted/20 space-y-3 border-2 p-4">
					<div className="flex items-center gap-2">
						<FileImage className="h-4 w-4" />
						<p className="font-medium">Падааны зураг</p>
					</div>
					<p className="text-muted-foreground text-sm">
						Нэг буюу хэд хэдэн зураг оруулна уу. Давхцсан зураг ч болно.
					</p>
					<UploadButton
						category="invoice"
						onSuccess={(url) =>
							setImages((current) =>
								current.some((image) => image.url === url) ? current : [...current, { url }],
							)
						}
					/>
					{images.length ? (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
							{images.map((image, index) => (
								<div
									className="group rounded-base border-border bg-background relative border-2 p-2"
									key={image.url}
								>
									<img
										alt={`падааны зураг ${index + 1}`}
										className="aspect-square w-full rounded-sm object-cover"
										src={image.url}
									/>
									<Button
										className="absolute top-3 right-3 h-7 w-7 opacity-0 transition group-hover:opacity-100"
										onClick={() =>
											setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))
										}
										size="icon"
										type="button"
										variant="outline"
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
						</div>
					) : null}
				</div>

				{extractMutation.isError ? (
					<div className="rounded-base border-destructive bg-destructive/10 text-destructive border-2 p-3 text-sm">
						<div className="mb-1 flex items-center gap-2 font-medium">
							<AlertCircle className="h-4 w-4" />
							Падаанаас мэдээлэл ялгаж чадсангүй
						</div>
						<p>{extractMutation.error.message}</p>
					</div>
				) : null}

				<Button
					className="gap-2"
					disabled={extractMutation.isPending || images.length === 0}
					onClick={() =>
						extractMutation.mutate({
							images,
							provider,
						})
					}
					type="button"
				>
					{extractMutation.isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Sparkles className="h-4 w-4" />
					)}
					Падаан унших
				</Button>
			</CardContent>
		</Card>
	);
}

type AIPurchasePreviewProps = {
	data: ExtractedPurchaseData;
	onCancel: () => void;
	onConfirm: () => void;
	onEdit: () => void;
};

export function AIPurchasePreview({ data, onCancel, onConfirm, onEdit }: AIPurchasePreviewProps) {
	return (
		<Card className="border-border bg-card shadow-hard overflow-hidden border-2">
			<div className="border-border bg-secondary text-secondary-foreground border-b-2 px-4 py-3">
				<h3 className="font-heading font-bold">AI урьдчилан харах</h3>
				<p className="text-secondary-foreground/70 text-xs">
					Засварлахаас өмнө ялгаж авсан падааны толгой болон барааны таарцыг шалгана уу.
				</p>
			</div>
			<CardContent className="space-y-6 p-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Захиалгын дугаар</p>
						<p className="font-medium">{data.header.externalOrderNumber || "Олдсонгүй"}</p>
					</div>
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Трек код</p>
						<p className="font-medium">{data.header.trackingNumber || "Олдсонгүй"}</p>
					</div>
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Хүргэлт</p>
						<p className="font-medium">{data.header.shippingCost ?? 0}</p>
					</div>
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Төлөв</p>
						<p className="font-medium">
							{extractionStatusLabel[data.extractionStatus] ?? data.extractionStatus}
						</p>
					</div>
				</div>

				<div className="space-y-3">
					{data.items.map((item, index) => (
						<div className="rounded-base border p-4" key={`${item.description}-${index}`}>
							<div className="flex flex-wrap items-center gap-2">
								<span className="rounded-full border px-2 py-1 text-xs uppercase">
									{matchStatusLabel[item.matchStatus] ?? item.matchStatus}
								</span>
								{item.sourceCode ? (
									<span className="rounded-full border px-2 py-1 text-xs">{item.sourceCode}</span>
								) : null}
							</div>
							<p className="mt-2 font-medium">{item.description}</p>
							<p className="text-muted-foreground text-sm">
								Тоо {item.quantity} · Нэгж {item.unitPrice} · Дүн{" "}
								{item.lineTotal ?? item.quantity * item.unitPrice}
							</p>
							{item.matchedProduct ? (
								<p className="mt-2 text-sm">
									Тохирсон: <span className="font-medium">{item.matchedProduct.name}</span>
								</p>
							) : null}
							{item.warnings.length ? (
								<ul className="mt-2 space-y-1 text-sm text-amber-700">
									{item.warnings.map((warning, warningIndex) => (
										<li key={`${warning}-${warningIndex}`}>{warning}</li>
									))}
								</ul>
							) : null}
						</div>
					))}
				</div>

				<div className="flex flex-wrap gap-3">
					<Button onClick={onConfirm} type="button">
						Маягт руу үргэлжлүүлэх
					</Button>
					<Button onClick={onEdit} type="button" variant="outline">
						Маягтад засах
					</Button>
					<Button onClick={onCancel} type="button" variant="outline">
						Дахин унших
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
