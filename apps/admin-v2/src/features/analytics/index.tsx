import { ChartIcon } from "@solar-icons/solid/linear/chart";

import { EmptyState } from "@vit/ui";

// Track 6 owns this directory. Placeholder until the analytics feature lands.
export function AnalyticsPage() {
	return (
		<div class="space-y-6">
			<header>
				<h1 class="font-extrabold text-2xl tracking-tight">Шинжилгээ</h1>
				<p class="mt-1 text-[13px] text-ink-2">
					Борлуулалт, захиалга, шилдэг бараа.
				</p>
			</header>
			<EmptyState
				icon={<ChartIcon />}
				title="Шинжилгээ энд гарна"
				description="Хугацааны шүүлт, гол үзүүлэлт, чиг хандлага, шилдэг бараа энэ хуудсанд нэгдэнэ."
			/>
		</div>
	);
}
