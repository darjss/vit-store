import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { AIExtractedData } from "@vit/shared";
import { ArrowLeft, Bot, PenLine, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AIProductInput,
	AIProductPreview,
} from "@/components/product/ai-product-input";
import ProductForm from "@/components/product/product-form";
import { Button } from "@/components/ui/button";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/products/add")({
	component: RouteComponent,
});

type ExtractedProductData = {
	originalTitle: string;
	originalDescription: string | null;
	originalFeatures: string[];
	originalIngredients: string[];
	name: string;
	name_mn: string;
	description: string;
	brand: string | null;
	brandId: number | null;
	categoryId: number | null;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	tags?: string[];
	ingredients: string[];
	images: { url: string }[];
	sourceUrl: string | null;
	amazonPriceUsd: number | null;
	calculatedPriceMnt: number | null;
	extractionStatus: "success" | "partial" | "failed";
	errors: string[];
};

type AIState =
	| { mode: "input" }
	| { mode: "preview"; data: ExtractedProductData }
	| { mode: "form"; data: AIExtractedData };

function RouteComponent() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [activeTab, setActiveTab] = useState<"manual" | "ai">("ai");
	const [aiState, setAiState] = useState<AIState>({ mode: "input" });

	const handleSuccess = () => {
		toast.success("Бүтээгдэхүүн амжилттай нэмэгдлээ");
		queryClient.invalidateQueries(
			trpc.product.getPaginatedProducts.queryOptions({}),
		);
		navigate({ to: "/products" });
	};

	const handleAIExtracted = (data: ExtractedProductData) => {
		setAiState({ mode: "preview", data });
	};

	const handleConfirmPreview = () => {
		if (aiState.mode !== "preview") return;

		const formData: AIExtractedData = {
			name: aiState.data.name,
			name_mn: aiState.data.name_mn,
			description: aiState.data.description,
			brand: aiState.data.brand,
			brandId: aiState.data.brandId,
			categoryId: aiState.data.categoryId,
			amount: aiState.data.amount,
			potency: aiState.data.potency,
			dailyIntake: aiState.data.dailyIntake,
			weightGrams: aiState.data.weightGrams,
			price: aiState.data.calculatedPriceMnt ?? undefined,
			seoTitle: aiState.data.seoTitle,
			seoDescription: aiState.data.seoDescription,
			tags: aiState.data.tags,
			ingredients: aiState.data.ingredients,
			images: aiState.data.images,
		};

		setAiState({ mode: "form", data: formData });
	};

	const handleEditFromPreview = () => {
		handleConfirmPreview();
	};

	const handleCancelAI = () => {
		setAiState({ mode: "input" });
	};

	const handleSwitchToManual = () => {
		setActiveTab("manual");
		setAiState({ mode: "input" });
	};

	return (
		<div className="min-h-screen p-2 sm:p-4 md:p-6 lg:p-8">
			<div className="mx-auto w-full max-w-5xl">
				{/* Page Header */}
				<div className="mb-6 sm:mb-8">
					<div className="mb-4 flex items-center gap-2 text-muted-foreground text-sm">
						<Link
							to="/products"
							className="flex items-center gap-1.5 transition-colors hover:text-foreground"
						>
							<ArrowLeft className="h-3.5 w-3.5" />
							Бүтээгдэхүүн
						</Link>
						<span>/</span>
						<span className="text-foreground">Шинэ нэмэх</span>
					</div>
					<h1 className="font-heading text-2xl sm:text-3xl">
						Бүтээгдэхүүн нэмэх
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Гараар эсвэл AI ашиглан бүтээгдэхүүн нэмнэ үү
					</p>
				</div>

				{/* Mode Switcher */}
				<div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<button
						type="button"
						onClick={() => setActiveTab("manual")}
						className={`group relative border-2 border-border p-4 text-left transition-all sm:p-5 ${
							activeTab === "manual"
								? "bg-primary shadow-hard"
								: "bg-card hover:translate-y-0.5 hover:bg-muted/30"
						}`}
					>
						<div className="flex items-start gap-3">
							<div
								className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border ${
									activeTab === "manual"
										? "bg-primary-foreground text-primary"
										: "bg-muted text-muted-foreground"
								}`}
							>
								<PenLine className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p
									className={`font-bold font-heading ${
										activeTab === "manual"
											? "text-primary-foreground"
											: "text-foreground"
									}`}
								>
									Гараар нэмэх
								</p>
								<p
									className={`mt-0.5 text-sm ${
										activeTab === "manual"
											? "text-primary-foreground/70"
											: "text-muted-foreground"
									}`}
								>
									Бүх мэдээллийг өөрөө оруулах
								</p>
							</div>
						</div>
						{activeTab === "manual" && (
							<div className="absolute top-2 right-2 h-2 w-2 bg-primary-foreground" />
						)}
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("ai")}
						className={`group relative border-2 border-border p-4 text-left transition-all sm:p-5 ${
							activeTab === "ai"
								? "bg-secondary text-secondary-foreground shadow-hard"
								: "bg-card hover:translate-y-0.5 hover:bg-muted/30"
						}`}
					>
						<div className="flex items-start gap-3">
							<div
								className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border ${
									activeTab === "ai"
										? "bg-secondary-foreground text-secondary"
										: "bg-muted text-muted-foreground"
								}`}
							>
								<Sparkles className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p
									className={`font-bold font-heading ${
										activeTab === "ai"
											? "text-secondary-foreground"
											: "text-foreground"
									}`}
								>
									AI-аар нэмэх
								</p>
								<p
									className={`mt-0.5 text-sm ${
										activeTab === "ai"
											? "text-secondary-foreground/70"
											: "text-muted-foreground"
									}`}
								>
									Amazon-оос автомат татах
								</p>
							</div>
						</div>
						{activeTab === "ai" && (
							<div className="absolute top-2 right-2 h-2 w-2 bg-secondary-foreground" />
						)}
					</button>
				</div>

				{/* Content Area */}
				<div>
					{/* Manual Tab Content */}
					{activeTab === "manual" && <ProductForm onSuccess={handleSuccess} />}

					{/* AI Tab Content */}
					{activeTab === "ai" && (
						<>
							{aiState.mode === "input" && (
								<AIProductInput
									onExtracted={handleAIExtracted}
									onCancel={handleSwitchToManual}
								/>
							)}

							{aiState.mode === "preview" && (
								<AIProductPreview
									data={aiState.data}
									onConfirm={handleConfirmPreview}
									onEdit={handleEditFromPreview}
									onCancel={handleCancelAI}
								/>
							)}

							{aiState.mode === "form" && (
								<div className="space-y-4">
									<button
										type="button"
										onClick={handleCancelAI}
										className="flex items-center gap-1.5 border-2 border-border bg-muted/30 px-3 py-1.5 font-heading text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
									>
										<Bot className="h-3.5 w-3.5" />
										<span>Дахин AI татах</span>
									</button>

									<ProductForm
										aiData={aiState.data}
										onSuccess={handleSuccess}
										showAIFields
									/>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
