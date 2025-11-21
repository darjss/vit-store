import type {
	PaymentProviderType,
	PaymentStatusType,
} from "@vit/api/lib/types";
import {
	createEffect,
	createResource,
	createSignal,
	Match,
	onCleanup,
	Switch,
} from "solid-js";
	import { api } from "@/lib/trpc";
import { Button } from "../ui/button";

const PaymentStatus = ({
	payment,
}: {
	payment: {
		paymentNumber: string;
		status: PaymentStatusType;
		provider: PaymentProviderType;
	};
}) => {
	const [refetchTrigger, setRefetchTrigger] = createSignal(1);

	const fetchPaymentStatus = async () => {
		return await api.payment.getPaymentStatus.query({
			paymentNumber: payment.paymentNumber,
		});
	};

	const [data] = createResource(refetchTrigger, fetchPaymentStatus, {
		initialValue: { status: payment.status, provider: payment.provider },
	});

	const currentData = () => data.latest ?? data();

	createEffect(() => {
		const status = currentData()?.status;
		if (status === "success" || status === "failed") {
			return;
		}
		console.log("refetching");
		const interval = setInterval(() => {
			setRefetchTrigger((prev) => prev + 1);
		}, 5000);

		onCleanup(() => clearInterval(interval));
	});

	const refetch = () => {
		setRefetchTrigger((prev) => prev + 1);
	};

	return (
		<Switch>
			<Match when={currentData()?.status === "success"}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border-4 border-black bg-success text-success-foreground shadow-[8px_8px_0_0_#000]">
						<svg
							class="h-10 w-10"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="3"
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<h1 class="mb-4 font-black text-4xl uppercase tracking-tight md:text-5xl">
						Захиалга баталгаажлаа!
					</h1>
					<p class="text-lg text-muted-foreground">
						Танд баярлалаа. Таны захиалга хүлээн авагдлаа.
					</p>
				</div>
			</Match>
			<Match when={currentData()?.status === "pending"}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex h-20 w-20 animate-pulse items-center justify-center rounded-full border-4 border-black bg-yellow-400 text-black shadow-[8px_8px_0_0_#000]">
						<svg
							class="h-10 w-10 animate-spin"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<h2 class="mb-4 font-black text-2xl uppercase tracking-tight">
						Төлбөр боловсруулж байна
					</h2>
					<p class="mb-4 text-lg text-muted-foreground">
						Таны төлбөр шалгагдаж байна. Түр хүлээнэ үү.
					</p>
					<div class="inline-flex items-center gap-2 text-muted-foreground text-sm">
						<svg
							class="h-4 w-4 animate-spin"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						Автоматаар шалгаж байна...
					</div>
				</div>
			</Match>
			<Match when={currentData()?.status === "failed"}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border-4 border-black bg-destructive text-destructive-foreground shadow-[8px_8px_0_0_#000]">
						<svg
							class="h-10 w-10"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="3"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</div>
					<h2 class="mb-4 font-black text-2xl uppercase tracking-tight">
						Төлбөр амжилтгүй боллоо
					</h2>
					<p class="mb-6 text-lg text-muted-foreground">
						Төлбөрийн явцад алдаа гарлаа. Дахин оролдоно уу.
					</p>
					<a
						href={`/payment/${payment.paymentNumber}`}
						class="inline-flex h-12 items-center gap-2 whitespace-nowrap border-3 border-black bg-primary px-6 py-3 font-black text-primary-foreground text-sm uppercase tracking-wide shadow-[6px_6px_0_0_#000] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0_0_#000] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-2 active:shadow-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						<svg
							class="h-4 w-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						Дахин оролдох
					</a>
				</div>
			</Match>
			<Match when={data.loading && !data.latest}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border-4 border-black bg-gray-400 text-gray-400 shadow-[8px_8px_0_0_#000]">
						<svg
							class="h-10 w-10"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default PaymentStatus;
