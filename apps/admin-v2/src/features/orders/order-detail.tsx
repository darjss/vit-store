import { BillListIcon } from "@solar-icons/solid/linear/bill-list";
import { useParams } from "@tanstack/solid-router";

import { EmptyState } from "@vit/ui";

// Track 4 owns this directory. Placeholder until the order detail lands.
export function OrderDetailPage() {
	const params = useParams({ from: "/_app/orders/$orderId" });
	return (
		<div class="space-y-6">
			<header>
				<h1 class="font-extrabold text-2xl tracking-tight">Захиалга</h1>
				<p class="mt-1 font-mono text-[13px] text-ink-2">{params().orderId}</p>
			</header>
			<EmptyState
				icon={<BillListIcon />}
				title="Захиалгын дэлгэрэнгүй энд гарна"
				description="Бараа, хаяг, төлбөр, төлөвийн үйлдлүүд энэ хуудсанд нэгдэнэ."
			/>
		</div>
	);
}
