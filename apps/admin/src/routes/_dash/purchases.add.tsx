import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PenLine, Sparkles } from "lucide-react";
import { Suspense, useState } from "react";
import {
	AIPurchaseInput,
	AIPurchasePreview,
} from "@/components/purchase/ai-purchase-input";
import PurchaseForm from "@/components/purchase/purchase-form";
import type { RouterOutputs } from "@/lib/types";

type ExtractedPurchaseData = RouterOutputs["aiPurchase"]["extractPurchaseFromImages"];

export const Route = createFileRoute("/_dash/purchases/add")({
	component: RouteComponent,
	loader: async ({ context: ctx }) => {
		await Promise.all([
			ctx.queryClient.ensureQueryData(
				ctx.trpc.product.getAllProducts.queryOptions(),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.category.getAllCategories.queryOptions(),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.brands.getAllBrands.queryOptions(),
			),
		]);
	},
});

type AIState =
	| { mode: "input" }
	| { mode: "preview"; data: ExtractedPurchaseData }
	| { mode: "form"; data: ExtractedPurchaseData };

function RouteComponent() {
	return (
		<Suspense fallback={<div className="p-6">Loading form...</div>}>
			<AddPurchasePage />
		</Suspense>
	);
}

function AddPurchasePage() {
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState<"manual" | "ai">("ai");
	const [aiState, setAiState] = useState<AIState>({ mode: "input" });

	return (
		<div className="min-h-screen p-2 sm:p-4 md:p-6 lg:p-8">
			<div className="mx-auto w-full max-w-6xl">
				<div className="mb-6 sm:mb-8">
					<div className="mb-4 flex items-center gap-2 text-muted-foreground text-sm">
						<Link
							to="/purchases"
							className="flex items-center gap-1.5 transition-colors hover:text-foreground"
						>
							<ArrowLeft className="h-3.5 w-3.5" />
							Purchases
						</Link>
						<span>/</span>
						<span className="text-foreground">Add</span>
					</div>
					<h1 className="font-heading text-2xl sm:text-3xl">Add Purchase</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Create a supplier purchase manually or import it from invoice
						screenshots.
					</p>
				</div>

				<div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<button
						type="button"
						onClick={() => {
							setActiveTab("manual");
							setAiState({ mode: "input" });
						}}
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
									Manual
								</p>
								<p
									className={`mt-0.5 text-sm ${
										activeTab === "manual"
											? "text-primary-foreground/70"
											: "text-muted-foreground"
									}`}
								>
									Enter the purchase and line items yourself
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
									AI Import
								</p>
								<p
									className={`mt-0.5 text-sm ${
										activeTab === "ai"
											? "text-secondary-foreground/70"
											: "text-muted-foreground"
									}`}
								>
									Upload invoice screenshots and review the extracted data
								</p>
							</div>
						</div>
						{activeTab === "ai" && (
							<div className="absolute top-2 right-2 h-2 w-2 bg-secondary-foreground" />
						)}
					</button>
				</div>

				<div className="rounded-base border-2 border-border bg-card p-4 shadow-shadow sm:p-6">
					{activeTab === "manual" ? (
						<PurchaseForm
							onSuccess={(purchaseId) =>
								navigate({
									to: "/purchases/$id",
									params: { id: String(purchaseId) },
								})
							}
						/>
					) : null}

					{activeTab === "ai" && aiState.mode === "input" ? (
						<AIPurchaseInput
							onExtracted={(data) => setAiState({ mode: "preview", data })}
							onCancel={() => setActiveTab("manual")}
						/>
					) : null}

					{activeTab === "ai" && aiState.mode === "preview" ? (
						<AIPurchasePreview
							data={aiState.data}
							onConfirm={() => setAiState({ mode: "form", data: aiState.data })}
							onEdit={() => setAiState({ mode: "form", data: aiState.data })}
							onCancel={() => setAiState({ mode: "input" })}
						/>
					) : null}

					{activeTab === "ai" && aiState.mode === "form" ? (
						<PurchaseForm
							aiData={aiState.data}
							onResetAI={() => setAiState({ mode: "input" })}
							onSuccess={(purchaseId) =>
								navigate({
									to: "/purchases/$id",
									params: { id: String(purchaseId) },
								})
							}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}
