import { BoxIcon } from "@solar-icons/solid/linear/box";

import { EmptyState } from "@/tmp-ui";

// Track 3 owns this directory. Placeholder until the products feature lands.
export function ProductsPage() {
	return (
		<div class="space-y-6">
			<header>
				<h1 class="font-extrabold text-2xl tracking-tight">Бараа</h1>
				<p class="mt-1 text-[13px] text-ink-2">
					Барааны жагсаалт, хайлт, шүүлт, нөөц удирдлага.
				</p>
			</header>
			<EmptyState
				icon={<BoxIcon />}
				title="Барааны жагсаалт энд гарна"
				description="Хайх, шүүх, нөөц нэмэх, засах — бүх барааны үйлдэл энэ хуудсанд нэгдэнэ."
			/>
		</div>
	);
}
