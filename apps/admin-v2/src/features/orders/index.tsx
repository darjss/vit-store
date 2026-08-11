import { BillListIcon } from "@solar-icons/solid/linear/bill-list";

import { EmptyState } from "@vit/ui";

// Track 4 owns this directory. Placeholder until the orders feature lands.
export function OrdersPage() {
	return (
		<div class="space-y-6">
			<header>
				<h1 class="font-extrabold text-2xl tracking-tight">Захиалга</h1>
				<p class="mt-1 text-[13px] text-ink-2">
					Захиалгын жагсаалт, төлөв шилжүүлэх, хайлт.
				</p>
			</header>
			<EmptyState
				icon={<BillListIcon />}
				title="Захиалгын жагсаалт энд гарна"
				description="Төлөвийн дагуу хийх үйлдэл, хайлт, багц үйлдлүүд энэ хуудсанд нэгдэнэ."
			/>
		</div>
	);
}
