import { useMutation } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
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

const LOGIN_PHONE_KEY = "login-phone";

function readStoredPhone(): string {
	if (typeof localStorage === "undefined") return "";
	try {
		const raw = localStorage.getItem(LOGIN_PHONE_KEY);
		if (!raw) return "";
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed === "string") return parsed.replace(/\D/g, "");
		return String(raw).replace(/\D/g, "");
	} catch {
		return "";
	}
}

interface RestockNotifySheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	productId: number;
	productName?: string;
}

export default function RestockNotifySheet(props: RestockNotifySheetProps) {
	const [includeEmail, setIncludeEmail] = createSignal(false);
	const [phone, setPhone] = createSignal("");
	const [email, setEmail] = createSignal("");

	createEffect(() => {
		if (props.open && !phone()) {
			const stored = readStoredPhone();
			if (stored) setPhone(stored);
		}
	});

	const isValidPhone = createMemo(() =>
		/^[6-9]\d{7}$/.test(phone().replace(/\D/g, "")),
	);
	const isValidEmail = createMemo(() =>
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email().trim().toLowerCase()),
	);
	const canSubmit = createMemo(
		() => isValidPhone() && (!includeEmail() || isValidEmail()),
	);

	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				const contacts: Array<{
					channel: "sms" | "email";
					contact: string;
				}> = [
					{
						channel: "sms",
						contact: phone().replace(/\D/g, ""),
					},
				];
				if (includeEmail()) {
					contacts.push({
						channel: "email",
						contact: email().trim(),
					});
				}
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
					description:
						error instanceof Error
							? error.message
							: "Мэдэгдэл захиалахад алдаа гарлаа.",
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

					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={includeEmail()}
							onChange={(e) => setIncludeEmail(e.currentTarget.checked)}
							class="size-4 rounded border-border"
						/>
						Имэйлээр ч мэдэгдэл авах
					</label>

					<Show when={includeEmail()}>
						<div class="space-y-2">
							<label class="font-medium text-sm" for="restock-email">
								Имэйл
							</label>
							<input
								id="restock-email"
								type="email"
								value={email()}
								onInput={(e) => setEmail(e.currentTarget.value)}
								placeholder="ner@example.com"
								class="h-12 w-full rounded-xl border border-border bg-background px-4 font-medium text-base shadow-soft-sm transition-[box-shadow,border-color] duration-200 ease-out focus-visible:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
						</div>
					</Show>

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
