import type { PaymentProviderType, PaymentStatusType } from "@vit/shared/types";
import {
	createEffect,
	createResource,
	createSignal,
	Match,
	onCleanup,
	Switch,
} from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc";
import IconCheck from "~icons/ri/check-line";
import IconClose from "~icons/ri/close-line";
import IconRefresh from "~icons/ri/refresh-line";
import IconTime from "~icons/ri/time-line";

const PaymentStatus = (props: {
	payment: {
		paymentNumber: string;
		checkoutToken?: string;
		status: PaymentStatusType;
		provider: PaymentProviderType;
	};
}) => {
	const [refetchTrigger, setRefetchTrigger] = createSignal(1);

	type PaymentStatusResult = {
		status: PaymentStatusType;
		provider: PaymentProviderType;
	};

	const fetchPaymentStatus = async (): Promise<PaymentStatusResult> => {
		return (await api.payment.getPaymentStatus.query({
			paymentNumber: props.payment.paymentNumber,
			checkoutToken: props.payment.checkoutToken,
		} as { paymentNumber: string })) as PaymentStatusResult;
	};

	const [data] = createResource(refetchTrigger, fetchPaymentStatus, {
		initialValue: {
			status: props.payment.status,
			provider: props.payment.provider,
		} satisfies Awaited<ReturnType<typeof fetchPaymentStatus>>,
	});

	const currentData = () => data.latest ?? data();

	createEffect(() => {
		const status = currentData()?.status;
		if (status === "success" || status === "failed") {
			return;
		}
		const interval = setInterval(() => {
			setRefetchTrigger((prev) => prev + 1);
		}, 5000);

		onCleanup(() => clearInterval(interval));
	});

	return (
		<Switch>
			<Match when={currentData()?.status === "success"}>
				<div class="enter-scale mb-12 text-center">
					<div class="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-success text-success-foreground shadow-soft-lg">
						<IconCheck class="h-10 w-10" aria-hidden="true" />
					</div>
					<h1 class="mb-3 font-display text-3xl text-foreground md:text-4xl">
						Захиалга баталгаажлаа!
					</h1>
					<p class="text-lg text-muted-foreground">
						Танд баярлалаа. Таны захиалга хүлээн авагдлаа.
					</p>
				</div>
			</Match>
			<Match
				when={
					currentData()?.status === "pending" ||
					currentData()?.status === "customer_claimed_paid"
				}
			>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex size-20 animate-pulse items-center justify-center rounded-full bg-warning text-warning-foreground shadow-soft-lg">
						<IconTime class="h-10 w-10" aria-hidden="true" />
					</div>
					<h2 class="mb-3 font-display text-2xl text-foreground">
						Төлбөр боловсруулж байна
					</h2>
					<p class="mb-4 text-lg text-muted-foreground">
						Таны төлбөр шалгагдаж байна. Түр хүлээнэ үү.
					</p>
					<div class="inline-flex items-center gap-2 text-muted-foreground text-sm">
						<IconRefresh class="h-4 w-4 animate-spin" aria-hidden="true" />
						Автоматаар шалгаж байна...
					</div>
				</div>
			</Match>
			<Match when={currentData()?.status === "failed"}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-soft-lg">
						<IconClose class="h-10 w-10" aria-hidden="true" />
					</div>
					<h2 class="mb-3 font-display text-2xl text-foreground">
						Төлбөр амжилтгүй боллоо
					</h2>
					<p class="mb-6 text-lg text-muted-foreground">
						Төлбөрийн явцад алдаа гарлаа. Дахин оролдоно уу.
					</p>
					<a
						href={`/payment/${props.payment.paymentNumber}`}
						class={cn(buttonVariants())}
					>
						<IconRefresh class="h-4 w-4" aria-hidden="true" />
						Дахин оролдох
					</a>
				</div>
			</Match>
			<Match when={data.loading && !data.latest}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-soft-lg">
						<IconTime class="h-10 w-10" aria-hidden="true" />
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default PaymentStatus;
