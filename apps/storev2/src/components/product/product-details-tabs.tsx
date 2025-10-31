import { Show, createSignal, For } from "solid-js";
import { cn } from "@/lib/utils";

interface ProductDetailsTabsProps {
	hasDescription: boolean;
	hasIngredients: boolean;
	hasSpecs: boolean;
	descriptionContent?: string | null;
	ingredientsContent?: string[] | null;
	specsContent: {
		amount?: string | null;
		potency?: string | null;
		dailyIntake?: number | null;
		weightGrams?: number | null;
	};
}

export default function ProductDetailsTabs(props: ProductDetailsTabsProps) {
	const [activeTab, setActiveTab] = createSignal<
		"description" | "ingredients" | "specs"
	>("description");

	return (
		<div class="w-full space-y-4 sm:space-y-6">
			{/* Tab Navigation */}
			<div class="flex flex-wrap gap-2 sm:gap-3 border-b-4 border-black pb-4">
				<Show when={props.hasDescription}>
					<button
						type="button"
						onClick={() => setActiveTab("description")}
						class={cn(
							"rounded-sm border-3 border-black px-4 py-2 sm:px-6 sm:py-3 font-black text-sm sm:text-base uppercase transition-all",
							activeTab() === "description"
								? "bg-primary shadow-[4px_4px_0_0_#000] translate-x-0 translate-y-0"
								: "bg-white shadow-[3px_3px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px]",
						)}
					>
						📝 Тайлбар
					</button>
				</Show>

				<Show when={props.hasIngredients}>
					<button
						type="button"
						onClick={() => setActiveTab("ingredients")}
						class={cn(
							"rounded-sm border-3 border-black px-4 py-2 sm:px-6 sm:py-3 font-black text-sm sm:text-base uppercase transition-all",
							activeTab() === "ingredients"
								? "bg-primary shadow-[4px_4px_0_0_#000] translate-x-0 translate-y-0"
								: "bg-white shadow-[3px_3px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px]",
						)}
					>
						🧪 Найрлага
					</button>
				</Show>

				<Show when={props.hasSpecs}>
					<button
						type="button"
						onClick={() => setActiveTab("specs")}
						class={cn(
							"rounded-sm border-3 border-black px-4 py-2 sm:px-6 sm:py-3 font-black text-sm sm:text-base uppercase transition-all",
							activeTab() === "specs"
								? "bg-primary shadow-[4px_4px_0_0_#000] translate-x-0 translate-y-0"
								: "bg-white shadow-[3px_3px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px]",
						)}
					>
						📊 Үзүүлэлт
					</button>
				</Show>
			</div>

			{/* Tab Content */}
			<div class="rounded-sm border-4 border-black bg-white p-6 sm:p-8 shadow-[6px_6px_0_0_#000] sm:shadow-[8px_8px_0_0_#000]">
				<Show when={activeTab() === "description" && props.hasDescription}>
					<div class="prose prose-lg max-w-none">
						<div class="text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
							{props.descriptionContent}
						</div>
					</div>
				</Show>

				<Show when={activeTab() === "ingredients" && props.hasIngredients}>
					<div class="space-y-4">
						<h3 class="text-xl sm:text-2xl font-black border-b-3 border-black pb-2 mb-4">
							Найрлагын жагсаалт
						</h3>
						<ul class="space-y-2">
							<For each={props.ingredientsContent}>
								{(ingredient) => (
									<li class="flex items-start gap-3 text-base sm:text-lg">
										<span class="font-black">•</span>
										<span>{ingredient}</span>
									</li>
								)}
							</For>
						</ul>
					</div>
				</Show>

				<Show when={activeTab() === "specs" && props.hasSpecs}>
					<div class="space-y-3 sm:space-y-4">
						<h3 class="text-xl sm:text-2xl font-black border-b-3 border-black pb-2 mb-4">
							Бүтээгдэхүүний үзүүлэлт
						</h3>

						<div class="grid gap-3 sm:gap-4">
							<Show when={props.specsContent.amount}>
								<div class="flex items-start gap-4 rounded-sm border-2 border-black bg-muted p-4">
									<span class="text-2xl">📦</span>
									<div>
										<div class="font-black text-sm uppercase text-black/60">
											Хэмжээ
										</div>
										<div class="font-bold text-lg">
											{props.specsContent.amount}
										</div>
									</div>
								</div>
							</Show>

							<Show when={props.specsContent.potency}>
								<div class="flex items-start gap-4 rounded-sm border-2 border-black bg-muted p-4">
									<span class="text-2xl">💪</span>
									<div>
										<div class="font-black text-sm uppercase text-black/60">
											Идэвхжил
										</div>
										<div class="font-bold text-lg">
											{props.specsContent.potency}
										</div>
									</div>
								</div>
							</Show>

							<Show when={props.specsContent.dailyIntake}>
								<div class="flex items-start gap-4 rounded-sm border-2 border-black bg-muted p-4">
									<span class="text-2xl">📅</span>
									<div>
										<div class="font-black text-sm uppercase text-black/60">
											Өдрийн тун
										</div>
										<div class="font-bold text-lg">
											{props.specsContent.dailyIntake} ширхэг/өдөр
										</div>
									</div>
								</div>
							</Show>

							<Show when={props.specsContent.weightGrams}>
								<div class="flex items-start gap-4 rounded-sm border-2 border-black bg-muted p-4">
									<span class="text-2xl">⚖️</span>
									<div>
										<div class="font-black text-sm uppercase text-black/60">
											Жин
										</div>
										<div class="font-bold text-lg">
											{props.specsContent.weightGrams}г
										</div>
									</div>
								</div>
							</Show>
						</div>
					</div>
				</Show>
			</div>
		</div>
	);
}
