import { BoxIcon } from "@solar-icons/solid/linear/box";
import { useParams } from "@tanstack/solid-router";

import { EmptyState } from "@vit/ui";

// Track 3 owns this directory. Placeholder until the product detail lands.
export function ProductDetailPage() {
	const params = useParams({ from: "/_app/products/$productId" });
	return (
		<div class="space-y-6">
			<header>
				<h1 class="font-extrabold text-2xl tracking-tight">Бараа</h1>
				<p class="mt-1 font-mono text-[13px] text-ink-2">
					{params().productId}
				</p>
			</header>
			<EmptyState
				icon={<BoxIcon />}
				title="Барааны дэлгэрэнгүй энд гарна"
				description="Зураг, үнэ, нөөц, засвар — бүх мэдээлэл энэ хуудсанд нэгдэнэ."
			/>
		</div>
	);
}
