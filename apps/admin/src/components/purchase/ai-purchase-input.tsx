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

type AIInvoiceInputProps = {
	onExtracted: (data: ExtractedPurchaseData) => void;
	onCancel: () => void;
};

export function AIPurchaseInput({
	onExtracted,
	onCancel,
}: AIInvoiceInputProps) {
	const [provider, setProvider] = useState<
		"amazon" | "iherb" | "naturebell" | "unknown"
	>("amazon");
	const [images, setImages] = useState<{ url: string }[]>([]);

	const extractMutation = useMutation({
		...trpc.aiPurchase.extractPurchaseFromImages.mutationOptions(),
		onSuccess: onExtracted,
	});

	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-hard">
			<div className="flex items-center justify-between border-border border-b-2 bg-primary px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center border-2 border-primary-foreground/30 bg-primary-foreground/10">
						<Sparkles className="h-4 w-4 text-primary-foreground" />
					</div>
					<div>
						<h3 className="font-bold font-heading text-primary-foreground">
							AI invoice import
						</h3>
						<p className="text-primary-foreground/70 text-xs">
							Upload purchase screenshots and review the extracted data
						</p>
					</div>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onCancel}
					className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<CardContent className="space-y-4 p-4">
				<div className="space-y-2">
					<Label>Provider</Label>
					<Select
						value={provider}
						onValueChange={(value) => setProvider(value as typeof provider)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="amazon">Amazon</SelectItem>
							<SelectItem value="iherb">iHerb</SelectItem>
							<SelectItem value="naturebell">Naturebell</SelectItem>
							<SelectItem value="unknown">Unknown</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-3 rounded-base border-2 border-border bg-muted/20 p-4">
					<div className="flex items-center gap-2">
						<FileImage className="h-4 w-4" />
						<p className="font-medium">Invoice screenshots</p>
					</div>
					<p className="text-muted-foreground text-sm">
						Upload one or more screenshots. Overlapping screenshots are okay.
					</p>
					<UploadButton
						category="invoice"
						onSuccess={(url) =>
							setImages((current) =>
								current.some((image) => image.url === url)
									? current
									: [...current, { url }],
							)
						}
					/>
					{images.length ? (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
							{images.map((image, index) => (
								<div
									key={image.url}
									className="group relative rounded-base border-2 border-border bg-background p-2"
								>
									<img
										src={image.url}
										alt={`invoice screenshot ${index + 1}`}
										className="aspect-square w-full rounded-sm object-cover"
									/>
									<Button
										type="button"
										size="icon"
										variant="outline"
										className="absolute top-3 right-3 h-7 w-7 opacity-0 transition group-hover:opacity-100"
										onClick={() =>
											setImages((current) =>
												current.filter((_, itemIndex) => itemIndex !== index),
											)
										}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
						</div>
					) : null}
				</div>

				{extractMutation.isError ? (
					<div className="rounded-base border-2 border-destructive bg-destructive/10 p-3 text-destructive text-sm">
						<div className="mb-1 flex items-center gap-2 font-medium">
							<AlertCircle className="h-4 w-4" />
							Invoice extraction failed
						</div>
						<p>{extractMutation.error.message}</p>
					</div>
				) : null}

				<Button
					type="button"
					disabled={extractMutation.isPending || images.length === 0}
					className="gap-2"
					onClick={() =>
						extractMutation.mutate({
							provider,
							images,
						})
					}
				>
					{extractMutation.isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Sparkles className="h-4 w-4" />
					)}
					Scan invoice
				</Button>
			</CardContent>
		</Card>
	);
}

type AIPurchasePreviewProps = {
	data: ExtractedPurchaseData;
	onConfirm: () => void;
	onEdit: () => void;
	onCancel: () => void;
};

export function AIPurchasePreview({
	data,
	onConfirm,
	onEdit,
	onCancel,
}: AIPurchasePreviewProps) {
	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 bg-secondary px-4 py-3 text-secondary-foreground">
				<h3 className="font-bold font-heading">AI preview</h3>
				<p className="text-secondary-foreground/70 text-xs">
					Review the extracted invoice header and line-item matches before
					editing.
				</p>
			</div>
			<CardContent className="space-y-6 p-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Order #</p>
						<p className="font-medium">
							{data.header.externalOrderNumber || "Not found"}
						</p>
					</div>
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Tracking</p>
						<p className="font-medium">
							{data.header.trackingNumber || "Not found"}
						</p>
					</div>
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Shipping</p>
						<p className="font-medium">{data.header.shippingCost ?? 0}</p>
					</div>
					<div className="rounded-base border p-3">
						<p className="text-muted-foreground text-xs uppercase">Status</p>
						<p className="font-medium">{data.extractionStatus}</p>
					</div>
				</div>

				<div className="space-y-3">
					{data.items.map((item, index) => (
						<div
							key={`${item.description}-${index}`}
							className="rounded-base border p-4"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="rounded-full border px-2 py-1 text-xs uppercase">
									{item.matchStatus}
								</span>
								{item.sourceCode ? (
									<span className="rounded-full border px-2 py-1 text-xs">
										{item.sourceCode}
									</span>
								) : null}
							</div>
							<p className="mt-2 font-medium">{item.description}</p>
							<p className="text-muted-foreground text-sm">
								Qty {item.quantity} · Unit {item.unitPrice} · Total{" "}
								{item.lineTotal ?? item.quantity * item.unitPrice}
							</p>
							{item.matchedProduct ? (
								<p className="mt-2 text-sm">
									Matched:{" "}
									<span className="font-medium">
										{item.matchedProduct.name}
									</span>
								</p>
							) : null}
							{item.warnings.length ? (
								<ul className="mt-2 space-y-1 text-amber-700 text-sm">
									{item.warnings.map((warning, warningIndex) => (
										<li key={`${warning}-${warningIndex}`}>{warning}</li>
									))}
								</ul>
							) : null}
						</div>
					))}
				</div>

				<div className="flex flex-wrap gap-3">
					<Button type="button" onClick={onConfirm}>
						Continue to form
					</Button>
					<Button type="button" variant="outline" onClick={onEdit}>
						Edit in form
					</Button>
					<Button type="button" variant="outline" onClick={onCancel}>
						Rescan
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
