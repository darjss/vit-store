import { useMutation } from "@tanstack/solid-query";
import { createMemo, createSignal } from "solid-js";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconNotification from "~icons/ri/notification-3-fill";

function restockErrorMessage(error: unknown): string {
	const code =
		typeof error === "object" &&
		error !== null &&
		"data" in error &&
		typeof error.data === "object" &&
		error.data !== null &&
		"code" in error.data
			? String(error.data.code)
			: "UNKNOWN";
	switch (code) {
		case "UNAUTHORIZED":
			return "Нэвтэрч, баталгаажуулсан утасны дугаараа ашиглана уу.";
		case "TOO_MANY_REQUESTS":
			return "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.";
		case "BAD_REQUEST":
			return "Мэдээллээ шалгаад дахин оролдоно уу.";
		case "NOT_FOUND":
			return "Бараа олдсонгүй. Хуудсаа шинэчлээд дахин оролдоно уу.";
		default:
			return "Мэдэгдэл захиалахад алдаа гарлаа. Дараа дахин оролдоно уу.";
	}
}

interface RestockNotifySheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
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
			mutationFn: async () => {
				const contacts = [
					{
						channel: "sms" as const,
						contact: phone().replace(/\D/g, ""),
					},
				];
				await api.product.subscribeToRestock.mutate({
					productId: props.productId,
					contacts,
				});
			},
			onSuccess: () => {
				showToast({
					title: "Амжилттай",
					description: "Бараа орж ирэхэд танд мэдэгдэнэ.",
					variant: "success",
					duration: 4000,
				});
				props.onOpenChange(false);
			},
			onError: (error) => {
				showToast({
					title: "Алдаа",
					description: restockErrorMessage(error),
					variant: "error",
					duration: 5000,
				});
			},
		}),
		() => queryClient,
	);

	return (
		<Sheet open={props.open} onOpenChange={props.onOpenChange}>
			<SheetContent
				position="bottom"
				closeLabel="Мэдэгдлийн цонхыг хаах"
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
						onClick={() => mutation.mutate()}
					>
						<IconNotification class="mr-1" />
						{mutation.isPending ? "Илгээж байна..." : "Мэдэгдэл захиалах"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
