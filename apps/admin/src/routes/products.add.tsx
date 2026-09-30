import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { AIExtractedData, ExtractedProductData } from "@vit/shared";
import { ArrowLeft, Bot, PenLine, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AIProductInput, AIProductPreview } from "@/components/product/ai-product-input";
import ProductForm from "@/components/product/product-form";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/products/add")({
	component: RouteComponent,
});

type AIState =
	| { mode: "input" }
	| { data: ExtractedProductData; mode: "preview" }
	| { data: AIExtractedData; mode: "form" };

// ponytail: legacy admin add product page — split AI/manual flows later; complexity ceiling 16
// oxlint-disable-next-line complexity
function RouteComponent() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [activeTab, setActiveTab] = useState<"manual" | "ai">("ai");
	const [aiState, setAiState] = useState<AIState>({ mode: "input" });

	const handleSuccess = () => {
		toast.success("Бүтээгдэхүүн амжилттай нэмэгдлээ");
		queryClient.invalidateQueries(trpc.product.getPaginatedProducts.queryOptions({}));
		navigate({ to: "/products" });
	};

	const handleAIExtracted = (data: ExtractedProductData) => {
		setAiState({ data, mode: "preview" });
	};

	const handleConfirmPreview = () => {
		if (aiState.mode !== "preview") {
			return;
		}

		const formData: AIExtractedData = {
			amount: aiState.data.amount,
			brand: aiState.data.brand,
			brandId: aiState.data.brandId,
			categoryId: aiState.data.categoryId,
			dailyIntake: aiState.data.dailyIntake,
			description: aiState.data.description,
			images: aiState.data.images,
			ingredients: aiState.data.ingredients,
			name: aiState.data.name,
			name_mn: aiState.data.name_mn,
			potency: aiState.data.potency,
			price: aiState.data.calculatedPriceMnt ?? undefined,
			seoDescription: aiState.data.seoDescription,
			seoTitle: aiState.data.seoTitle,
			tags: aiState.data.tags,
			weightGrams: aiState.data.weightGrams,
		};

		setAiState({ data: formData, mode: "form" });
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
					<div className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
						<Link
							className="hover:text-foreground flex items-center gap-1.5 transition-colors"
							to="/products"
						>
							<ArrowLeft className="h-3.5 w-3.5" />
							Бүтээгдэхүүн
						</Link>
						<span>/</span>
						<span className="text-foreground">Шинэ нэмэх</span>
					</div>
					<h1 className="font-heading text-2xl sm:text-3xl">Бүтээгдэхүүн нэмэх</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Гараар эсвэл AI ашиглан бүтээгдэхүүн нэмнэ үү
					</p>
				</div>

				{/* Mode Switcher */}
				<div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<button
						className={`group border-border relative border-2 p-4 text-left transition-all sm:p-5 ${
							activeTab === "manual"
								? "bg-primary shadow-hard"
								: "bg-card hover:bg-muted/30 hover:translate-y-0.5"
						}`}
						onClick={() => setActiveTab("manual")}
						type="button"
					>
						<div className="flex items-start gap-3">
							<div
								className={`border-border flex h-10 w-10 shrink-0 items-center justify-center border-2 ${
									activeTab === "manual"
										? "bg-primary-foreground text-primary"
										: "bg-muted text-muted-foreground"
								}`}
							>
								<PenLine className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p
									className={`font-heading font-bold ${
										activeTab === "manual" ? "text-primary-foreground" : "text-foreground"
									}`}
								>
									Гараар нэмэх
								</p>
								<p
									className={`mt-0.5 text-sm ${
										activeTab === "manual" ? "text-primary-foreground/70" : "text-muted-foreground"
									}`}
								>
									Бүх мэдээллийг өөрөө оруулах
								</p>
							</div>
						</div>
						{activeTab === "manual" && (
							<div className="bg-primary-foreground absolute top-2 right-2 h-2 w-2" />
						)}
					</button>

					<button
						className={`group border-border relative border-2 p-4 text-left transition-all sm:p-5 ${
							activeTab === "ai"
								? "bg-secondary text-secondary-foreground shadow-hard"
								: "bg-card hover:bg-muted/30 hover:translate-y-0.5"
						}`}
						onClick={() => setActiveTab("ai")}
						type="button"
					>
						<div className="flex items-start gap-3">
							<div
								className={`border-border flex h-10 w-10 shrink-0 items-center justify-center border-2 ${
									activeTab === "ai"
										? "bg-secondary-foreground text-secondary"
										: "bg-muted text-muted-foreground"
								}`}
							>
								<Sparkles className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p
									className={`font-heading font-bold ${
										activeTab === "ai" ? "text-secondary-foreground" : "text-foreground"
									}`}
								>
									AI-аар нэмэх
								</p>
								<p
									className={`mt-0.5 text-sm ${
										activeTab === "ai" ? "text-secondary-foreground/70" : "text-muted-foreground"
									}`}
								>
									Amazon-оос автомат татах
								</p>
							</div>
						</div>
						{activeTab === "ai" && (
							<div className="bg-secondary-foreground absolute top-2 right-2 h-2 w-2" />
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
								<AIProductInput onCancel={handleSwitchToManual} onExtracted={handleAIExtracted} />
							)}

							{aiState.mode === "preview" && (
								<AIProductPreview
									data={aiState.data}
									onCancel={handleCancelAI}
									onConfirm={handleConfirmPreview}
									onEdit={handleEditFromPreview}
								/>
							)}

							{aiState.mode === "form" && (
								<div className="space-y-4">
									<button
										className="border-border bg-muted/30 font-heading text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1.5 border-2 px-3 py-1.5 text-sm transition-colors"
										onClick={handleCancelAI}
										type="button"
									>
										<Bot className="h-3.5 w-3.5" />
										<span>Дахин AI татах</span>
									</button>

									<ProductForm aiData={aiState.data} onSuccess={handleSuccess} showAIFields />
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
