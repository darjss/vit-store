import type { PaymentProviderType, PaymentStatusType } from "@vit/shared/types";
import {
	createEffect,
	createResource,
	createSignal,
	Match,
	onCleanup,
	Switch,
} from "solid-js";
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
				<div class="mb-12 text-center opacity-0 animate-[scaleIn_400ms_ease-out_forwards]">
					<div class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border border-border bg-success text-success-foreground shadow-soft-lg">
						<IconCheck class="h-10 w-10" />
					</div>
					<h1 class="mb-4 font-extrabold text-4xl uppercase tracking-tight md:text-5xl">
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
					<div class="mb-6 inline-flex h-20 w-20 animate-pulse items-center justify-center rounded-full border border-border bg-yellow-400 text-foreground shadow-soft-lg">
						<IconTime class="h-10 w-10 animate-spin" />
					</div>
					<h2 class="mb-4 font-extrabold text-2xl uppercase tracking-tight">
						Төлбөр боловсруулж байна
					</h2>
					<p class="mb-4 text-lg text-muted-foreground">
						Таны төлбөр шалгагдаж байна. Түр хүлээнэ үү.
					</p>
					<div class="inline-flex items-center gap-2 text-muted-foreground text-sm">
						<IconRefresh class="h-4 w-4 animate-spin" />
						Автоматаар шалгаж байна...
					</div>
				</div>
			</Match>
			<Match when={currentData()?.status === "failed"}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border border-border bg-destructive text-destructive-foreground shadow-soft-lg">
						<IconClose class="h-10 w-10" />
					</div>
					<h2 class="mb-4 font-extrabold text-2xl uppercase tracking-tight">
						Төлбөр амжилтгүй боллоо
					</h2>
					<p class="mb-6 text-lg text-muted-foreground">
						Төлбөрийн явцад алдаа гарлаа. Дахин оролдоно уу.
					</p>
					<a
						href={`/payment/${props.payment.paymentNumber}`}
						class="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-primary px-6 py-3 font-extrabold text-primary-foreground text-sm uppercase tracking-wide shadow-soft-lg transition-all hover:-translate-y-0.5 hover:shadow-soft-xl active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						<IconRefresh class="h-4 w-4" />
						Дахин оролдох
					</a>
				</div>
			</Match>
			<Match when={data.loading && !data.latest}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted-foreground text-muted-foreground shadow-soft-lg">
						<IconTime class="h-10 w-10" />
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default PaymentStatus;
