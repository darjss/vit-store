import { HomeSmileIcon } from "@solar-icons/solid/linear/home-smile";

import { EmptyState } from "@/tmp-ui";

// Track 5 owns this directory. Placeholder until the home API shape lands.
export function HomePage() {
	return (
		<div class="space-y-6">
			<header>
				<h1 class="font-extrabold text-2xl tracking-tight">Нүүр</h1>
				<p class="mt-1 text-[13px] text-ink-2">
					Өнөөдрийн ажил, сүүлийн захиалга, бага үлдэгдэл бараа.
				</p>
			</header>
			<EmptyState
				icon={<HomeSmileIcon />}
				title="Ажлын жагсаалт энд гарна"
				description="Анхаарах ажил, хурдан үйлдлүүд, өнөөдрийн үзүүлэлтүүд энэ хуудсанд нэгдэнэ."
			/>
		</div>
	);
}
