import { useQuery } from "@tanstack/solid-query";
import {
	nullableTransferReconciliationSchema,
	paymentErrorSchema,
	type PaymentError,
} from "@vit/shared";
import type { PaymentProviderType, PaymentStatusType } from "@vit/shared/types";
import { createMemo, Match, Switch } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import {
	paymentErrorPresentation,
	paymentStatusCopy,
	reconciliationPresentation,
	unexpectedCommerceError,
} from "@/lib/error-presentations/commerce";
import { paymentUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { resultQueryOptions } from "@/lib/result-query";
import { api } from "@/lib/trpc";
import { usePaymentStatus } from "@/lib/use-payment-status";
import { cn } from "@/lib/utils";
import {
	CheckCircleIcon as IconCheck,
	CloseCircleIcon as IconClose,
	RefreshIcon as IconRefresh,
	ShieldCheckIcon as IconShieldCheck,
	ClockCircleIcon as IconTime,
} from "@solar-icons/solid/bold";

const PaymentStatus = (props: {
	payment: {
		paymentNumber: string;
		checkoutToken?: string;
		status: PaymentStatusType;
		provider: PaymentProviderType;
	};
}) => {
	const paymentNumber = () => props.payment.paymentNumber;
	const checkoutToken = () => props.payment.checkoutToken;

	// Single polling mechanism (shared with payment-options / qpay-button).
	// `initialData` seeds the server-rendered status so the first paint shows
	// the correct state instead of a loading skeleton.
	const statusQuery = usePaymentStatus(paymentNumber, checkoutToken, {
		refetchInterval: 5000,
		initialData: {
			status: props.payment.status,
			provider: props.payment.provider,
		},
	});

	const currentData = () =>
		statusQuery.data?.match({
			ok: (value) => value,
			err: () => undefined,
		}) ?? {
			status: props.payment.status,
			provider: props.payment.provider,
		};
	const statusExpectedError = () =>
		statusQuery.data?.match<PaymentError | undefined>({
			ok: () => undefined,
			err: (error) => error,
		});

	const currentView = () => paymentStatusCopy(currentData().status).view;
	const canReconcile = createMemo(
		() => currentData().provider === "transfer" && currentView() === "waiting",
	);

	const reconciliationQuery = useQuery(
		() => ({
			...resultQueryOptions({
				queryKey: ["transfer-reconciliation", paymentNumber()] as const,
				request: () =>
					api.v2.payment.getTransferReconciliationStatus.query({
						paymentNumber: paymentNumber(),
						checkoutToken: checkoutToken(),
					}),
				schemas: {
					value: nullableTransferReconciliationSchema,
					error: paymentErrorSchema,
				},
			}),
			refetchInterval: 5000,
			enabled: canReconcile(),
		}),
		() => queryClient,
	);

	const reconciliationData = () =>
		reconciliationQuery.data?.match({
			ok: (value) => value,
			err: () => undefined,
		});
	const reconciliationExpectedError = () =>
		reconciliationQuery.data?.match<PaymentError | undefined>({
			ok: () => undefined,
			err: (error) => error,
		});
	const needsManualReview = () => {
		const status = reconciliationData()?.status;
		return status ? reconciliationPresentation(status).manualReview : false;
	};
	const pollingPresentation = () => {
		const expected = statusExpectedError() ?? reconciliationExpectedError();
		return expected
			? paymentErrorPresentation(expected)
			: unexpectedCommerceError;
	};
	const pollingFailed = () =>
		currentView() !== "success" &&
		(statusQuery.isError ||
			Boolean(statusExpectedError()) ||
			reconciliationQuery.isError ||
			Boolean(reconciliationExpectedError()));

	return (
		<Switch>
			<Match when={currentView() === "success"}>
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
			<Match when={pollingFailed()}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-soft-lg">
						<IconRefresh class="h-10 w-10" aria-hidden="true" />
					</div>
					<h2 class="mb-3 font-display text-2xl text-foreground">
						{pollingPresentation().title}
					</h2>
					<p class="mx-auto mb-5 max-w-md text-lg text-muted-foreground">
						{pollingPresentation().description}
					</p>
					<p class="mx-auto mb-5 max-w-md text-muted-foreground text-sm">
						Төлбөр хийсэн бол дахин төлөх шаардлагагүй.
					</p>
					<button
						type="button"
						onClick={() => {
							void statusQuery.refetch();
							void reconciliationQuery.refetch();
						}}
						class={cn(buttonVariants())}
					>
						<IconRefresh class="h-4 w-4" aria-hidden="true" />
						Дахин шалгах
					</button>
				</div>
			</Match>
			<Match when={currentView() === "waiting" && needsManualReview()}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-info text-info-foreground shadow-soft-lg">
						<IconShieldCheck class="h-10 w-10" aria-hidden="true" />
					</div>
					<h2 class="mb-3 font-display text-2xl text-foreground">
						Төлбөрийг гараар шалгаж байна
					</h2>
					<p class="mx-auto max-w-md text-lg text-muted-foreground">
						Санаа зовох хэрэггүй — бид таны шилжүүлгийг гараар шалгаж, удахгүй
						баталгаажуулна. Танаас өөр юу ч хийх шаардлагагүй.
					</p>
				</div>
			</Match>
			<Match when={currentView() === "waiting"}>
				<div class="mb-12 text-center">
					<div class="mb-6 inline-flex size-20 animate-pulse items-center justify-center rounded-full bg-warning text-warning-foreground shadow-soft-lg">
						<IconTime class="h-10 w-10" aria-hidden="true" />
					</div>
					<h2 class="mb-3 font-display text-2xl text-foreground">
						Таны шилжүүлгийг хүлээж байна
					</h2>
					<p class="mx-auto mb-4 max-w-md text-lg text-muted-foreground">
						Та энэ хуудсыг хааж болно — төлбөр баталгаажсан үед энд харагдана.
					</p>
					<div class="inline-flex items-center gap-2 text-muted-foreground text-sm">
						<IconRefresh class="h-4 w-4 animate-spin" aria-hidden="true" />
						Автоматаар шалгаж байна...
					</div>
				</div>
			</Match>
			<Match when={currentView() === "failed"}>
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
						href={paymentUrl(
							props.payment.paymentNumber,
							props.payment.checkoutToken,
						)}
						class={cn(buttonVariants())}
					>
						<IconRefresh class="h-4 w-4" aria-hidden="true" />
						Дахин оролдох
					</a>
				</div>
			</Match>
			<Match when={statusQuery.isPending && !statusQuery.data}>
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
