import { useMutation } from "@tanstack/solid-query";
import { restockSubscriptionResultSchemas } from "@vit/shared";
import { createMemo, createSignal } from "solid-js";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	type SheetFocusRestore,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { presentRestockError } from "@/lib/error-presentations";
import { queryClient } from "@/lib/query";
import { resultMutationOptions } from "@/lib/result-query";
import { api } from "@/lib/trpc";
import { BellIcon as IconNotification } from "@solar-icons/solid/bold";

interface RestockNotifySheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	focusRestore: SheetFocusRestore;
	productId: number;
	productName?: string;
}

export default function RestockNotifySheet(props: RestockNotifySheetProps) {
	const [phone, setPhone] = createSignal("");

	const isValidPhone = createMemo(() =>
		/^[6-9]\d{7}$/.test(phone().replace(/\D/g, "")),
	);
	const canSubmit = createMemo(() => isValidPhone());

	const mutation = useMutation(
		() => ({
			...resultMutationOptions(
				() =>
					api.v2.product.subscribeToRestock.mutate({
						productId: props.productId,
						contacts: [
							{
								channel: "sms" as const,
								contact: phone().replace(/\D/g, ""),
							},
						],
					}),
				restockSubscriptionResultSchemas,
			),
			onSuccess: (result) =>
				result.match({
					ok: () => {
						showToast({
							title: "Амжилттай",
							description: "Бараа орж ирэхэд танд мэдэгдэнэ.",
							variant: "success",
							duration: 4000,
						});
						props.onOpenChange(false);
					},
					err: (error) => {
						const presentation = presentRestockError(error);
						showToast({
							title: presentation.title,
							description: presentation.description,
							variant: "error",
							duration: 5000,
						});
					},
				}),
		}),
		() => queryClient,
	);

	return (
		<Sheet open={props.open} onOpenChange={props.onOpenChange}>
			<SheetContent
				position="bottom"
				closeLabel="Мэдэгдлийн цонхыг хаах"
				focusRestore={props.focusRestore}
				class="flex max-h-[88vh] flex-col rounded-t-2xl border-border border-t bg-card p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
			>
				<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
					<SheetTitle class="font-bold font-display text-lg tracking-tight">
						Мэдэгдэл авах
					</SheetTitle>
					<SheetDescription class="text-muted-foreground text-sm">
						{props.productName
							? `${props.productName} дахин орвол утсаар мэдэгдэнэ.`
							: "Бараа дахин орвол утсаар мэдэгдэнэ."}
					</SheetDescription>
				</SheetHeader>

				<div class="space-y-4 px-5 py-4">
					<div class="space-y-2">
						<label class="font-medium text-sm" for="restock-phone">
							Утас
						</label>
						<input
							id="restock-phone"
							type="tel"
							inputMode="numeric"
							value={phone()}
							onInput={(e) => setPhone(e.currentTarget.value)}
							placeholder="88889999"
							class="h-12 w-full rounded-xl border border-border bg-background px-4 font-medium text-base shadow-soft-sm transition-[box-shadow,border-color] duration-200 ease-out focus-visible:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>

					<Button
						type="button"
						class="w-full"
						size="lg"
						disabled={!canSubmit() || mutation.isPending}
						onClick={() => mutation.mutate(undefined)}
					>
						<IconNotification class="mr-1" />
						{mutation.isPending ? "Илгээж байна..." : "Мэдэгдэл захиалах"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
