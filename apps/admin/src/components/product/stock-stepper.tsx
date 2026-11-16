import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export function StockStepper({
	className,
	productId,
	stock,
}: {
	className?: string;
	productId: number;
	stock: number;
}) {
	const [draft, setDraft] = useState(stock);
	const queryClient = useQueryClient();
	const save = useMutation({
		...trpc.product.setProductStock.mutationOptions(),
		onError: () => toast.error("Үлдэгдэл хадгалахад алдаа гарлаа"),
		onSuccess: (_, { newStock }) => {
			toast.success(`Үлдэгдэл ${newStock} боллоо`);
			void queryClient.invalidateQueries(trpc.product.pathFilter());
		},
	});
	const changed = draft !== stock;
	const set = (next: number) => setDraft(Math.max(0, next));

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<div className="flex shrink-0 items-center border bg-white">
				<button
					aria-label="Хасах"
					className="flex size-10 items-center justify-center"
					onClick={() => set(draft - 1)}
					type="button"
				>
					<Minus className="size-4" />
				</button>
				<input
					aria-label="Үлдэгдэл"
					className="h-10 w-12 border-x text-center text-base font-semibold tabular-nums outline-none"
					inputMode="numeric"
					onChange={(e) => set(Number(e.target.value.replaceAll(/\D/g, "")) || 0)}
					value={draft}
				/>
				<button
					aria-label="Нэмэх"
					className="flex size-10 items-center justify-center"
					onClick={() => set(draft + 1)}
					type="button"
				>
					<Plus className="size-4" />
				</button>
			</div>
			{changed && (
				<Button
					className="h-10 px-3"
					disabled={save.isPending}
					onClick={() => save.mutate({ id: productId, newStock: draft })}
				>
					Хадгалах
				</Button>
			)}
		</div>
	);
}
