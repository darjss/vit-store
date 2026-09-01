import { createSignal, onMount, Show } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import {
	createSheetFocusRestore,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { paymentUrl } from "@/lib/payment-url";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const PAYABLE = new Set(["pending", "customer_claimed_paid"]);

/**
 * After a bank-app return Facebook often reloads `/` (or cart/checkout) with the
 * guest session still holding an unpaid Payment. Offer continue — never hard-
 * redirect. Shoppers who dismiss can keep browsing or start a different cart;
 * addOrder owns reuse/replace on the server.
 */
const ContinueUnpaidCheckout = () => {
	const [paymentNumber, setPaymentNumber] = createSignal<string | null>(null);
	const [total, setTotal] = createSignal<number | null>(null);
	const [open, setOpen] = createSignal(false);
	const focusRestore = createSheetFocusRestore();

	onMount(() => {
		void (async () => {
			try {
				const user = await api.auth.check.query();
				const number = user?.checkout?.paymentNumber;
				if (!number) {
					return;
				}

				const payment = await api.payment.getPaymentByNumber.query({
					paymentNumber: number,
				});
				if (!PAYABLE.has(payment.status)) {
					return;
				}

				setPaymentNumber(payment.paymentNumber);
				setTotal(payment.total);
				setOpen(true);
			} catch {
				return;
			}
		})();
	});

	return (
		<Show when={paymentNumber()}>
			{(number) => (
				<Sheet onOpenChange={setOpen} open={open()}>
					<SheetContent
						class="border-border bg-card flex max-h-[88vh] flex-col rounded-t-2xl border-t p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
						closeLabel="Хаах"
						focusRestore={focusRestore}
						position="bottom"
					>
						<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
							<SheetTitle class="font-display text-lg font-bold tracking-tight">
								Төлбөр дуусаагүй байна
							</SheetTitle>
							<SheetDescription class="text-muted-foreground text-sm">
								{total() != null
									? `Таны ${total()!.toLocaleString()}₮-ийн захиалгын төлбөр хүлээгдэж байна.`
									: "Таны захиалгын төлбөр хүлээгдэж байна."}
							</SheetDescription>
						</SheetHeader>
						<div class="space-y-2 px-5 py-5">
							<a class={cn(buttonVariants(), "w-full")} href={paymentUrl(number())}>
								Төлбөр үргэлжлүүлэх
							</a>
							<button
								class="text-muted-foreground w-full py-2 text-center text-xs"
								onClick={() => setOpen(false)}
								type="button"
							>
								Дараа төлөх
							</button>
						</div>
					</SheetContent>
				</Sheet>
			)}
		</Show>
	);
};

export default ContinueUnpaidCheckout;
