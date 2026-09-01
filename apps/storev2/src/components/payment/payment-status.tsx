import { useQuery } from "@tanstack/solid-query";
import type { PaymentProviderType, PaymentStatusType } from "@vit/shared/types";
import { createMemo, Match, Switch } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import { paymentUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
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

const MANUAL_REVIEW_STATUSES = new Set(["timeout", "ambiguous", "auth_required", "failed"]);

const PaymentStatus = (props: {
	payment: {
		checkoutToken?: string;
		paymentNumber: string;
		provider: PaymentProviderType;
		status: PaymentStatusType;
	};
}) => {
	const paymentNumber = () => props.payment.paymentNumber;
	const checkoutToken = () => props.payment.checkoutToken;

	// Single polling mechanism (shared with payment-options / qpay-button).
	// `initialData` seeds the server-rendered status so the first paint shows
	// the correct state instead of a loading skeleton.
	const statusQuery = usePaymentStatus(paymentNumber, checkoutToken, {
		initialData: {
			provider: props.payment.provider,
			status: props.payment.status,
		} as { provider: PaymentProviderType; status: PaymentStatusType },
		refetchInterval: 5000,
	});

	const currentData = () =>
		statusQuery.data ?? {
			provider: props.payment.provider,
			status: props.payment.status,
		};

	const canReconcile = createMemo(() => {
		const current = currentData();
		return (
			current.provider === "transfer" && current.status !== "success" && current.status !== "failed"
		);
	});

	const reconciliationQuery = useQuery(
		() => ({
			enabled: canReconcile(),
			queryFn: () =>
				api.payment.getTransferReconciliationStatus.query({
					checkoutToken: checkoutToken(),
					paymentNumber: paymentNumber(),
				}),
			queryKey: ["transfer-reconciliation", paymentNumber()],
			refetchInterval: 5000,
		}),
		() => queryClient,
	);

	const needsManualReview = () => {
		const status = reconciliationQuery.data?.status;
		return status !== undefined && MANUAL_REVIEW_STATUSES.has(status);
	};

	return (
		<Switch>
			<Match when={currentData()?.status === "success"}>
				<div class="enter-scale mb-12 text-center">
					<div class="bg-success text-success-foreground shadow-soft-lg mb-6 inline-flex size-20 items-center justify-center rounded-full">
						<IconCheck aria-hidden="true" class="h-10 w-10" />
					</div>
					<h1 class="font-display text-foreground mb-3 text-3xl md:text-4xl">
						Захиалга баталгаажлаа!
					</h1>
					<p class="text-muted-foreground text-lg">
						Танд баярлалаа. Таны захиалга хүлээн авагдлаа.
					</p>
				</div>
			</Match>
			<Match
				when={
					(currentData()?.status === "pending" ||
						currentData()?.status === "customer_claimed_paid") &&
					needsManualReview()
				}
			>
				<div class="mb-12 text-center">
					<div class="bg-info text-info-foreground shadow-soft-lg mb-6 inline-flex size-20 items-center justify-center rounded-full">
						<IconShieldCheck aria-hidden="true" class="h-10 w-10" />
					</div>
					<h2 class="font-display text-foreground mb-3 text-2xl">Төлбөрийг гараар шалгаж байна</h2>
					<p class="text-muted-foreground mx-auto max-w-md text-lg">
						Санаа зовох хэрэггүй — бид таны шилжүүлгийг гараар шалгаж, удахгүй баталгаажуулна.
						Танаас өөр юу ч хийх шаардлагагүй.
					</p>
				</div>
			</Match>
			<Match
				when={
					currentData()?.status === "pending" || currentData()?.status === "customer_claimed_paid"
				}
			>
				<div class="mb-12 text-center">
					<div class="bg-warning text-warning-foreground shadow-soft-lg mb-6 inline-flex size-20 animate-pulse items-center justify-center rounded-full">
						<IconTime aria-hidden="true" class="h-10 w-10" />
					</div>
					<h2 class="font-display text-foreground mb-3 text-2xl">Таны шилжүүлгийг хүлээж байна</h2>
					<p class="text-muted-foreground mx-auto mb-4 max-w-md text-lg">
						Та энэ хуудсыг хааж болно — төлбөр баталгаажсан үед энд харагдана.
					</p>
					<div class="text-muted-foreground inline-flex items-center gap-2 text-sm">
						<IconRefresh aria-hidden="true" class="h-4 w-4 animate-spin" />
						Автоматаар шалгаж байна...
					</div>
				</div>
			</Match>
			<Match when={currentData()?.status === "failed"}>
				<div class="mb-12 text-center">
					<div class="bg-destructive text-destructive-foreground shadow-soft-lg mb-6 inline-flex size-20 items-center justify-center rounded-full">
						<IconClose aria-hidden="true" class="h-10 w-10" />
					</div>
					<h2 class="font-display text-foreground mb-3 text-2xl">Төлбөр амжилтгүй боллоо</h2>
					<p class="text-muted-foreground mb-6 text-lg">
						Төлбөрийн явцад алдаа гарлаа. Дахин оролдоно уу.
					</p>
					<a
						class={cn(buttonVariants())}
						href={paymentUrl(props.payment.paymentNumber, props.payment.checkoutToken)}
					>
						<IconRefresh aria-hidden="true" class="h-4 w-4" />
						Дахин оролдох
					</a>
				</div>
			</Match>
			<Match when={statusQuery.isPending && !statusQuery.data}>
				<div class="mb-12 text-center">
					<div class="bg-muted text-muted-foreground shadow-soft-lg mb-6 inline-flex size-20 items-center justify-center rounded-full">
						<IconTime aria-hidden="true" class="h-10 w-10" />
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default PaymentStatus;
