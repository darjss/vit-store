import { useMutation } from "@tanstack/react-query";
import type { ExtractedProductData } from "@vit/shared";
import { AlertCircle, Loader2, Search, Sparkles, X } from "lucide-react";
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
	onCancel: () => void;
	onExtracted: (data: ExtractedProductData) => void;
}

export { AIProductPreview } from "@/components/product/ai-product-preview";

export function AIProductInput({ onCancel, onExtracted }: AIProductInputProps) {
	const [query, setQuery] = useState("");
	const [steps, setSteps] = useState<Array<ExtractionStep>>(resetSteps);
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const startMutation = useMutation(trpc.aiProduct.startExtraction.mutationOptions());
	const scrapeMutation = useMutation(trpc.aiProduct.scrapeAndAnalyze.mutationOptions());
	const translateMutation = useMutation(trpc.aiProduct.translateProduct.mutationOptions());
	const finalizeMutation = useMutation(trpc.aiProduct.finalizeExtraction.mutationOptions());

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
		if (!query.trim() || isLoading) {
			return;
		}
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
		<Card className="border-border bg-card shadow-hard overflow-hidden border-2">
			<div className="border-border bg-primary flex items-center justify-between border-b-2 px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="border-primary-foreground/30 bg-primary-foreground/10 flex h-8 w-8 items-center justify-center border-2">
						<Sparkles className="text-primary-foreground h-4 w-4" />
					</div>
					<div>
						<h3 className="font-heading text-primary-foreground font-bold">AI бүтээгдэхүүн</h3>
						<p className="text-primary-foreground/70 text-xs">Amazon-оос автоматаар татах</p>
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
				<form className="space-y-3" onSubmit={handleSubmit}>
					<div className="space-y-1.5">
						<label className="text-sm font-bold" htmlFor="ai-product-query">
							Amazon линк эсвэл бүтээгдэхүүний нэр
						</label>
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
								<Input
									className="pl-9"
									disabled={isLoading}
									id="ai-product-query"
									onChange={(e) => setQuery(e.target.value)}
									placeholder="NOW Foods Vitamin D3 5000 IU..."
									type="text"
									value={query}
								/>
							</div>
							<Button className="gap-2" disabled={isLoading || !query.trim()} type="submit">
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
					<div className="border-destructive bg-destructive/10 space-y-3 rounded-none border-2 p-4">
						<div className="flex items-start gap-2">
							<AlertCircle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
							<div className="min-w-0 flex-1">
								<p className="text-destructive text-sm font-bold">Алдаа гарлаа</p>
								<p className="text-destructive/80 mt-1 text-xs">{errorMessage}</p>
							</div>
						</div>
						<Button
							className="border-destructive text-destructive hover:bg-destructive/10"
							onClick={handleRetry}
							size="sm"
							type="button"
							variant="outline"
						>
							Дахин оролдох
						</Button>
					</div>
				)}

				{!isLoading && !errorMessage && (
					<div className="border-border bg-muted/20 space-y-2 rounded-none border-2 border-dashed p-3">
						<p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
							Зөвлөгөө
						</p>
						<ul className="text-muted-foreground space-y-1.5 text-xs">
							<li className="flex items-start gap-2">
								<span className="bg-muted-foreground mt-0.5 h-1 w-1 shrink-0 rounded-full" />
								<span>Amazon.com линк шууд хуулж тавьбал хамгийн сайн ажиллана</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="bg-muted-foreground mt-0.5 h-1 w-1 shrink-0 rounded-full" />
								<span>Бүтээгдэхүүний нэр, брэнд, хүч зэргийг тодорхой бичнэ үү</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="bg-muted-foreground mt-0.5 h-1 w-1 shrink-0 rounded-full" />
								<span>Англи хэлээр бичвэл илүү сайн хайлт хийнэ</span>
							</li>
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
