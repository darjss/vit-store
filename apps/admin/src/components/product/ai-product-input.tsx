import { useMutation } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import {
	AlertCircle,
	CheckCircle2,
	ExternalLink,
	Loader2,
	Search,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

type ExtractedProductData = {
	originalTitle: string;
	originalDescription: string | null;
	originalFeatures: string[];
	originalIngredients: string[];
	name: string;
	name_mn: string;
	description: string;
	brand: string | null;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	tags: string[];
	ingredients: string[];
	images: { url: string }[];
	sourceUrl: string | null;
	extractionStatus: "success" | "partial" | "failed";
	errors: string[];
};

type ExtractionStep = {
	id: string;
	label: string;
	labelMn: string;
	status: "pending" | "active" | "complete" | "error";
};

interface AIProductInputProps {
	onExtracted: (data: ExtractedProductData) => void;
	onCancel: () => void;
}

const EXTRACTION_STEPS: ExtractionStep[] = [
	{
		id: "searching",
		label: "Searching Amazon",
		labelMn: "Amazon хайж байна",
		status: "pending",
	},
	{
		id: "extracting",
		label: "Extracting data",
		labelMn: "Мэдээлэл татаж байна",
		status: "pending",
	},
	{
		id: "uploading",
		label: "Uploading images",
		labelMn: "Зураг хуулж байна",
		status: "pending",
	},
	{
		id: "translating",
		label: "Translating to Mongolian",
		labelMn: "Монгол руу орчуулж байна",
		status: "pending",
	},
];

export function AIProductInput({ onExtracted, onCancel }: AIProductInputProps) {
	const [query, setQuery] = useState("");
	const [steps, setSteps] = useState<ExtractionStep[]>(EXTRACTION_STEPS);
	const [currentStepIndex, setCurrentStepIndex] = useState(-1);

	const extractMutation = useMutation(
		trpc.aiProduct.extractProduct.mutationOptions(),
	);

	useEffect(() => {
		if (extractMutation.isPending) {
			setSteps(EXTRACTION_STEPS.map((s) => ({ ...s, status: "pending" })));
			setCurrentStepIndex(0);

			const stepDurations = [3000, 8000, 5000, 4000];
			let elapsed = 0;

			stepDurations.forEach((duration, index) => {
				setTimeout(() => {
					setSteps((prev) =>
						prev.map((s, i) => ({
							...s,
							status:
								i < index ? "complete" : i === index ? "active" : "pending",
						})),
					);
					setCurrentStepIndex(index);
				}, elapsed);
				elapsed += duration;
			});
		}
	}, [extractMutation.isPending]);

	useEffect(() => {
		if (extractMutation.isSuccess && extractMutation.data) {
			setSteps((prev) => prev.map((s) => ({ ...s, status: "complete" })));
			setCurrentStepIndex(steps.length);

			setTimeout(() => {
				onExtracted(extractMutation.data);
			}, 500);
		}
	}, [
		extractMutation.isSuccess,
		extractMutation.data,
		onExtracted,
		steps.length,
	]);

	useEffect(() => {
		if (extractMutation.isError) {
			setSteps((prev) =>
				prev.map((s, i) => ({
					...s,
					status: i === currentStepIndex ? "error" : s.status,
				})),
			);
		}
	}, [extractMutation.isError, currentStepIndex]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!query.trim()) return;
		extractMutation.mutate({ query: query.trim() });
	};

	const isLoading = extractMutation.isPending;

	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-hard">
			{/* Header */}
			<div className="flex items-center justify-between border-border border-b-2 bg-primary px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center border-2 border-primary-foreground/30 bg-primary-foreground/10">
						<Sparkles className="h-4 w-4 text-primary-foreground" />
					</div>
					<div>
						<h3 className="font-bold font-heading text-primary-foreground">
							AI бүтээгдэхүүн
						</h3>
						<p className="text-primary-foreground/70 text-xs">
							Amazon-оос автоматаар татах
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
				<form onSubmit={handleSubmit} className="space-y-3">
					<div className="space-y-1.5">
						<label htmlFor="ai-product-query" className="font-bold text-sm">
							Amazon линк эсвэл бүтээгдэхүүний нэр
						</label>
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="ai-product-query"
									type="text"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="NOW Foods Vitamin D3 5000 IU..."
									className="pl-9"
									disabled={isLoading}
								/>
							</div>
							<Button
								type="submit"
								disabled={isLoading || !query.trim()}
								className="gap-2"
							>
								{isLoading ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Sparkles className="h-4 w-4" />
								)}
								<span className="hidden sm:inline">
									{isLoading ? "Татаж байна..." : "AI татах"}
								</span>
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							Amazon бүтээгдэхүүний URL буюу нэрийг оруулна уу
						</p>
					</div>
				</form>

				{isLoading && (
					<div className="space-y-3 rounded-none border-2 border-border bg-muted/30 p-4">
						<div className="flex items-center gap-2 text-sm">
							<Loader2 className="h-4 w-4 animate-spin text-primary" />
							<span className="font-bold">Ажиллаж байна...</span>
						</div>

						<div className="space-y-2">
							{steps.map((step, index) => (
								<div
									key={step.id}
									className={cn(
										"flex items-center gap-3 rounded-none border-2 p-2 transition-all",
										step.status === "active" && "border-primary bg-primary/10",
										step.status === "complete" &&
											"border-green-500 bg-green-500/10",
										step.status === "error" &&
											"border-destructive bg-destructive/10",
										step.status === "pending" &&
											"border-border bg-background opacity-50",
									)}
								>
									<div
										className={cn(
											"flex h-6 w-6 shrink-0 items-center justify-center border-2 font-bold font-heading text-xs",
											step.status === "active" &&
												"border-primary bg-primary text-primary-foreground",
											step.status === "complete" &&
												"border-green-600 bg-green-500 text-white",
											step.status === "error" &&
												"border-destructive bg-destructive text-destructive-foreground",
											step.status === "pending" &&
												"border-border bg-muted text-muted-foreground",
										)}
									>
										{step.status === "complete" ? (
											<CheckCircle2 className="h-3.5 w-3.5" />
										) : step.status === "error" ? (
											<AlertCircle className="h-3.5 w-3.5" />
										) : step.status === "active" ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											index + 1
										)}
									</div>
									<div className="min-w-0 flex-1">
										<p
											className={cn(
												"truncate font-medium text-sm",
												step.status === "active" && "text-primary",
												step.status === "complete" && "text-green-600",
												step.status === "error" && "text-destructive",
												step.status === "pending" && "text-muted-foreground",
											)}
										>
											{step.labelMn}
										</p>
									</div>
								</div>
							))}
						</div>

						<p className="text-muted-foreground text-xs">
							Энэ процесс 15-30 секунд үргэлжилнэ. Хүлээнэ үү...
						</p>
					</div>
				)}

				{extractMutation.isError && (
					<div className="space-y-3 rounded-none border-2 border-destructive bg-destructive/10 p-4">
						<div className="flex items-start gap-2">
							<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
							<div className="min-w-0 flex-1">
								<p className="font-bold text-destructive text-sm">
									Алдаа гарлаа
								</p>
								<p className="mt-1 text-destructive/80 text-xs">
									{extractMutation.error?.message ||
										"Бүтээгдэхүүн татахад алдаа гарлаа. Дахин оролдоно уу."}
								</p>
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => extractMutation.reset()}
							className="border-destructive text-destructive hover:bg-destructive/10"
						>
							Дахин оролдох
						</Button>
					</div>
				)}

				{!isLoading && !extractMutation.isError && (
					<div className="space-y-2 rounded-none border-2 border-border border-dashed bg-muted/20 p-3">
						<p className="font-bold text-muted-foreground text-xs uppercase tracking-wide">
							Зөвлөгөө
						</p>
						<ul className="space-y-1.5 text-muted-foreground text-xs">
							<li className="flex items-start gap-2">
								<span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
								<span>
									Amazon.com линк шууд хуулж тавьбал хамгийн сайн ажиллана
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
								<span>
									Бүтээгдэхүүний нэр, брэнд, хүч зэргийг тодорхой бичнэ үү
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
								<span>Англи хэлээр бичвэл илүү сайн хайлт хийнэ</span>
							</li>
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

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

				{/* Product Preview */}
				<div className="space-y-3">
					{/* Images */}
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

					<div className="grid grid-cols-3 gap-2">
						<div className="space-y-1 rounded-none border-2 border-border bg-muted/30 p-2">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
								Брэнд
							</p>
							<p className="truncate font-medium text-sm">
								{data.brand || "-"}
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
