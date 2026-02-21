import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { AIExtractedData } from "@vit/shared";
import { Bot, PenLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AIProductInput,
	AIProductPreview,
} from "@/components/product/ai-product-input";
import ProductForm from "@/components/product/product-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type AIState =
	| { mode: "input" }
	| { mode: "preview"; data: ExtractedProductData }
	| { mode: "form"; data: AIExtractedData };

function RouteComponent() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual");
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
			amount: aiState.data.amount,
			potency: aiState.data.potency,
			dailyIntake: aiState.data.dailyIntake,
			weightGrams: aiState.data.weightGrams,
			seoTitle: aiState.data.seoTitle,
			seoDescription: aiState.data.seoDescription,
			tags: aiState.data.tags,
			ingredients: aiState.data.ingredients,
			images: aiState.data.images,
		};

		setAiState({ mode: "form", data: formData });
	};

	const handleEditFromPreview = () => {
		handleConfirmPreview(); // Same action - goes to form for editing
	};

	const handleCancelAI = () => {
		setAiState({ mode: "input" });
	};

	const handleSwitchToManual = () => {
		setActiveTab("manual");
		setAiState({ mode: "input" });
	};

	return (
		<div className="space-y-4">
			{/* Tab Switcher */}
			<Tabs
				value={activeTab}
				onValueChange={(v) => setActiveTab(v as "manual" | "ai")}
			>
				<TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto sm:grid-cols-none">
					<TabsTrigger value="manual" className="gap-2">
						<PenLine className="h-4 w-4" />
						<span>Гараар нэмэх</span>
					</TabsTrigger>
					<TabsTrigger value="ai" className="gap-2">
						<Bot className="h-4 w-4" />
						<span>AI-аар нэмэх</span>
					</TabsTrigger>
				</TabsList>

				{/* Manual Tab Content */}
				<TabsContent value="manual" className="mt-4">
					<ProductForm onSuccess={handleSuccess} />
				</TabsContent>

				{/* AI Tab Content */}
				<TabsContent value="ai" className="mt-4">
					{aiState.mode === "input" && (
						<div className="space-y-4">
							<AIProductInput
								onExtracted={handleAIExtracted}
								onCancel={handleSwitchToManual}
							/>
						</div>
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
							{/* Back to AI input button */}
							<button
								type="button"
								onClick={handleCancelAI}
								className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
							>
								<Bot className="h-4 w-4" />
								<span>Дахин AI татах</span>
							</button>

							<ProductForm
								aiData={aiState.data}
								onSuccess={handleSuccess}
								showAIFields
							/>
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
