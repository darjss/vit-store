import { useMutation } from "@tanstack/react-query";
import type { ExtractedProductData } from "@vit/shared";
import {
	AlertCircle,
	Loader2,
	Search,
	Sparkles,
	X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	ExtractionProgressPanel,
	markStepComplete,
	markStepError,
	resetSteps,
	setStepActive,
	type ExtractionStep,
} from "@/components/product/extraction-progress-panel";
import { trpc } from "@/utils/trpc";

interface AIProductInputProps {
	onExtracted: (data: ExtractedProductData) => void;
	onCancel: () => void;
}

export { AIProductPreview } from "@/components/product/ai-product-preview";

export function AIProductInput({ onExtracted, onCancel }: AIProductInputProps) {
	const [query, setQuery] = useState("");
	const [steps, setSteps] = useState<ExtractionStep[]>(resetSteps);
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const startMutation = useMutation(trpc.aiProduct.startExtraction.mutationOptions());
	const scrapeMutation = useMutation(
		trpc.aiProduct.scrapeAndAnalyze.mutationOptions(),
	);
	const translateMutation = useMutation(
		trpc.aiProduct.translateProduct.mutationOptions(),
	);
	const finalizeMutation = useMutation(
		trpc.aiProduct.finalizeExtraction.mutationOptions(),
	);

	const runExtraction = async (trimmedQuery: string) => {
		setIsLoading(true);
		setErrorMessage(null);
		let currentSteps = resetSteps();

		try {
			currentSteps = setStepActive(currentSteps, "searching");
			setSteps(currentSteps);

			const start = await startMutation.mutateAsync({ query: trimmedQuery });
			currentSteps = markStepComplete(currentSteps, "searching");
			currentSteps = setStepActive(currentSteps, "extracting");
			setSteps(currentSteps);

			await scrapeMutation.mutateAsync({ sessionId: start.sessionId });
			currentSteps = markStepComplete(currentSteps, "extracting");
			currentSteps = setStepActive(currentSteps, "translating");
			setSteps(currentSteps);

			await translateMutation.mutateAsync({ sessionId: start.sessionId });
			currentSteps = markStepComplete(currentSteps, "translating");
			currentSteps = setStepActive(currentSteps, "uploading");
			setSteps(currentSteps);

			const result = await finalizeMutation.mutateAsync({
				sessionId: start.sessionId,
			});
			currentSteps = markStepComplete(currentSteps, "uploading");
			setSteps(currentSteps);
			onExtracted(result);
		} catch (error) {
			const activeStep = currentSteps.find((step) => step.status === "active");
			if (activeStep) {
				setSteps(markStepError(currentSteps, activeStep.id));
			}
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Бүтээгдэхүүн татахад алдаа гарлаа. Дахин оролдоно уу.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!query.trim() || isLoading) return;
		void runExtraction(query.trim());
	};

	const handleRetry = () => {
		setErrorMessage(null);
		setSteps(resetSteps());
		startMutation.reset();
		scrapeMutation.reset();
		translateMutation.reset();
		finalizeMutation.reset();
	};

	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-hard">
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

				{isLoading && <ExtractionProgressPanel steps={steps} />}

				{errorMessage && (
					<div className="space-y-3 rounded-none border-2 border-destructive bg-destructive/10 p-4">
						<div className="flex items-start gap-2">
							<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
							<div className="min-w-0 flex-1">
								<p className="font-bold text-destructive text-sm">
									Алдаа гарлаа
								</p>
								<p className="mt-1 text-destructive/80 text-xs">{errorMessage}</p>
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRetry}
							className="border-destructive text-destructive hover:bg-destructive/10"
						>
							Дахин оролдох
						</Button>
					</div>
				)}

				{!isLoading && !errorMessage && (
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
