import { useMutation, useQuery } from "@tanstack/solid-query";
import { match } from "dismatch";
import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import {
	loginResultSchemas,
	orderAccessErrorSchema,
	orderStatusLabels,
	orderTrackingSchema,
	sendOtpResultSchemas,
	sessionResultSchemas,
	type OrderAccessError,
} from "@vit/shared";
import type { OrderStatusType } from "@vit/shared/types";
import { presentAuthError } from "@/lib/error-presentations";
import {
	orderAccessErrorPresentation,
	unexpectedCommerceError,
} from "@/lib/error-presentations/commerce";
import { queryClient } from "@/lib/query";
import { resultMutationOptions, resultQueryOptions } from "@/lib/result-query";
import { api } from "@/lib/trpc";
import { showToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	TextField,
	TextFieldInput,
	TextFieldLabel,
} from "@/components/ui/text-field";
import {
	BoxIcon as IconPackage,
	LockPasswordIcon as IconLock,
	MinimalisticMagnifierIcon as IconSearch,
	RefreshIcon as IconLoader,
} from "@solar-icons/solid/linear";
import {
	CheckCircleIcon as IconCheck,
	CheckReadIcon as IconCheckDouble,
	DangerCircleIcon as IconAlert,
} from "@solar-icons/solid/bold";

const statusBadgeVariant: Record<
	string,
	"outline" | "warning" | "info" | "success" | "error" | "secondary"
> = {
	created: "outline",
	pending: "warning",
	shipped: "info",
	delivered: "success",
	cancelled: "error",
	refunded: "secondary",
};

const timelineSteps: OrderStatusType[] = ["pending", "shipped", "delivered"];

const paymentStatusLabels: Record<string, string> = {
	pending: "Хүлээгдэж буй",
	customer_claimed_paid: "Төлсөн гэж мэдэгдсэн",
	success: "Амжилттай",
	failed: "Амжилтгүй",
};

type TrackingStep =
	| { status: "input" }
	| { status: "otp" }
	| { status: "result" };

const trackingSteps = {
	input: { status: "input" },
	otp: { status: "otp" },
	result: { status: "result" },
} satisfies Record<TrackingStep["status"], TrackingStep>;

const OrderTrackingForm = () => {
	const [step, setStep] = createSignal<"input" | "otp" | "result">("input");
	const [phone, setPhone] = createSignal("");
	const [orderNumber, setOrderNumber] = createSignal("");
	const [otp, setOtp] = createSignal("");

	const authQuery = useQuery(
		() =>
			resultQueryOptions({
				queryKey: ["auth-check"],
				request: () => api.v2.auth.check.query(),
				schemas: sessionResultSchemas,
			}),
		() => queryClient,
	);
	const authUser = () =>
		authQuery.data?.match({ ok: (user) => user, err: () => undefined });
	const showAuthFailure = (error: Parameters<typeof presentAuthError>[0]) => {
		const presentation = presentAuthError(error);
		showToast({
			title: presentation.title,
			description: presentation.description,
			variant: "error",
			duration: 5000,
		});
	};

	const trackMutation = useMutation(
		() => ({
			...resultMutationOptions(
				(input: { orderNumber: string; phone?: string }) =>
					api.v2.order.getOrderByOrderNumber.query({
						orderNumber: input.orderNumber,
					}),
				{ value: orderTrackingSchema, error: orderAccessErrorSchema },
			),
			onError: () => {
				showToast({
					title: unexpectedCommerceError.title,
					description: unexpectedCommerceError.description,
					variant: "error",
					duration: 7000,
				});
			},
		}),
		() => queryClient,
	);

	const sendOtpMutation = useMutation(
		() => ({
			...resultMutationOptions(
				(phoneNumber: string) =>
					api.v2.auth.sendOtp.mutate({ phone: phoneNumber }),
				sendOtpResultSchemas,
			),
			onSuccess: (result) =>
				result.match({
					ok: () => {
						setStep("otp");
						showToast({
							title: "Амжилттай",
							description: "Таны утсанд баталгаажуулах код илгээгдлээ",
							variant: "success",
							duration: 5000,
						});
					},
					err: showAuthFailure,
				}),
		}),
		() => queryClient,
	);

	const verifyOtpMutation = useMutation(
		() => ({
			...resultMutationOptions(
				(input: { phone: string; otp: string }) =>
					api.v2.auth.login.mutate(input),
				loginResultSchemas,
			),
			onSuccess: (result) =>
				result.match({
					ok: () => {
						showToast({
							title: "Амжилттай",
							description: "Баталгаажлаа. Захиалгыг хайж байна...",
							variant: "success",
							duration: 3000,
						});
						trackMutation.mutate({
							orderNumber: orderNumber(),
							phone: phone(),
						});
						setStep("result");
					},
					err: showAuthFailure,
				}),
		}),
		() => queryClient,
	);

	const handleSearch = () => {
		if (!orderNumber().trim() || !phone().trim()) {
			showToast({
				title: "Анхааруулга",
				description: "Захиалгын дугаар болон утасны дугаараа оруулна уу",
				variant: "default",
				duration: 3000,
			});
			return;
		}

		if (authQuery.isPending) {
			showToast({
				title: "Нэвтрэх төлөвийг шалгаж байна",
				description: "Түр хүлээгээд дахин оролдоно уу.",
				variant: "default",
				duration: 3000,
			});
			return;
		}
		if (authQuery.isError) return;

		const user = authUser();
		if (user && user.phone.toString() === phone()) {
			trackMutation.mutate({ orderNumber: orderNumber(), phone: phone() });
			setStep("result");
			return;
		}
		sendOtpMutation.mutate(phone());
	};

	const handleVerifyOtp = () => {
		if (!otp().trim()) {
			showToast({
				title: "Анхааруулга",
				description: "Баталгаажуулах кодоо оруулна уу",
				variant: "default",
				duration: 3000,
			});
			return;
		}
		verifyOtpMutation.mutate({ phone: phone(), otp: otp() });
	};

	const formatDate = (timestamp: Date | string) => {
		return new Date(timestamp).toLocaleDateString("mn-MN", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const trackedOrder = () =>
		trackMutation.data?.match({
			ok: (value) => value,
			err: () => undefined,
		});
	const trackingExpectedError = () =>
		trackMutation.data?.match<OrderAccessError | undefined>({
			ok: () => undefined,
			err: (error) => error,
		});
	const trackingErrorPresentation = () => {
		const expected = trackingExpectedError();
		return expected
			? orderAccessErrorPresentation(expected)
			: unexpectedCommerceError;
	};
	const currentStepIndex = () =>
		timelineSteps.indexOf(
			(trackedOrder()?.status ?? "pending") as OrderStatusType,
		);

	return (
		<div class="space-y-6">
			{match(
				trackingSteps[step()],
				"status",
			)<JSX.Element>({
				input: () => (
					<Card class="enter-rise">
						<CardContent class="p-6 pt-6 md:p-8 md:pt-8">
							<div class="space-y-5">
								<div class="flex items-center gap-3">
									<div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-wash-sky text-foreground">
										<IconSearch class="h-5 w-5" />
									</div>
									<div>
										<h2 class="font-display text-base text-foreground">
											Захиалга хайх
										</h2>
										<p class="text-muted-foreground text-xs">
											Захиалгын дугаар, утасны дугаараа оруулна уу
										</p>
									</div>
								</div>

								<div class="space-y-4">
									<TextField>
										<TextFieldLabel>Захиалгын дугаар</TextFieldLabel>
										<TextFieldInput
											type="text"
											value={orderNumber()}
											onInput={(
												e: InputEvent & { currentTarget: HTMLInputElement },
											) => setOrderNumber(e.currentTarget.value)}
											placeholder="Жишээ: ORD12345"
										/>
									</TextField>

									<TextField>
										<TextFieldLabel>Утасны дугаар</TextFieldLabel>
										<TextFieldInput
											type="tel"
											value={phone()}
											onInput={(
												e: InputEvent & { currentTarget: HTMLInputElement },
											) => setPhone(e.currentTarget.value)}
											placeholder="88889999"
											maxLength={8}
										/>
									</TextField>
								</div>

								<Button
									class="w-full"
									onClick={handleSearch}
									disabled={sendOtpMutation.isPending || authQuery.isPending}
								>
									{sendOtpMutation.isPending ? (
										<span class="flex items-center justify-center gap-2">
											<IconLoader class="h-4 w-4 animate-spin" />
											Илгээж байна...
										</span>
									) : (
										<span class="flex items-center justify-center gap-2">
											<IconSearch class="h-4 w-4" />
											Хайх
										</span>
									)}
								</Button>

								<Show when={authUser()}>
									<div class="flex items-center gap-2 rounded-xl bg-wash-mint/60 p-3 text-foreground text-xs">
										<IconCheckDouble class="h-4 w-4 shrink-0" />
										<span>
											Та нэвтэрсэн байна. Захиалгын дугаараа оруулан шууд хайна
											уу.
										</span>
									</div>
								</Show>
								<Show when={authQuery.isError}>
									<div
										class="space-y-3 rounded-xl bg-error p-3 text-error-foreground text-xs"
										role="alert"
									>
										<p>
											Нэвтрэлтийн төлөвийг шалгаж чадсангүй. Таныг системээс
											гарсан гэж үзээгүй.
										</p>
										<Button
											variant="outline"
											size="sm"
											onClick={() => authQuery.refetch()}
										>
											Дахин шалгах
										</Button>
									</div>
								</Show>
							</div>
						</CardContent>
					</Card>
				),

				otp: () => (
					<Card class="enter-rise">
						<CardContent class="p-6 pt-6 md:p-8 md:pt-8">
							<div class="space-y-5">
								<div class="flex items-center gap-3">
									<div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-wash-lilac text-foreground">
										<IconLock class="h-5 w-5" />
									</div>
									<div>
										<h2 class="font-display text-base text-foreground">
											Баталгаажуулалт
										</h2>
										<p class="text-muted-foreground text-xs">
											{phone()} дугаарт илгээгдсэн кодыг оруулна уу
										</p>
									</div>
								</div>

								<TextField>
									<TextFieldLabel>Баталгаажуулах код</TextFieldLabel>
									<TextFieldInput
										type="text"
										value={otp()}
										onInput={(
											e: InputEvent & { currentTarget: HTMLInputElement },
										) => setOtp(e.currentTarget.value)}
										placeholder="XXXX"
										maxLength={6}
										class="text-center font-display text-lg tracking-[0.5em]"
									/>
								</TextField>

								<Button
									class="w-full"
									onClick={handleVerifyOtp}
									disabled={verifyOtpMutation.isPending}
								>
									{verifyOtpMutation.isPending ? (
										<span class="flex items-center justify-center gap-2">
											<IconLoader class="h-4 w-4 animate-spin" />
											Баталгаажуулж байна...
										</span>
									) : (
										"Баталгаажуулах"
									)}
								</Button>

								<Button
									variant="ghost"
									size="sm"
									class="w-full"
									onClick={() => setStep("input")}
								>
									Буцах
								</Button>
							</div>
						</CardContent>
					</Card>
				),

				result: () => (
					<>
						<Show when={trackMutation.isPending}>
							<Card class="enter-scale">
								<CardContent class="p-8 pt-8 text-center">
									<IconLoader class="mx-auto mb-4 h-10 w-10 animate-spin text-cocoa" />
									<p class="font-semibold text-foreground text-sm">
										Захиалгыг хайж байна...
									</p>
								</CardContent>
							</Card>
						</Show>

						<Show when={trackMutation.isError || trackingExpectedError()}>
							<Card class="enter-scale">
								<CardContent class="p-6 pt-6 text-center md:p-8 md:pt-8">
									<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error text-error-foreground">
										<IconAlert class="h-7 w-7" />
									</div>
									<h3 class="mb-2 font-display text-foreground text-lg">
										{trackingErrorPresentation().title}
									</h3>
									<p class="mb-5 text-muted-foreground text-sm">
										{trackingErrorPresentation().description}
									</p>
									<Button
										onClick={() => {
											setStep("input");
											trackMutation.reset();
										}}
									>
										Дахин оролдох
									</Button>
								</CardContent>
							</Card>
						</Show>

						<Show when={trackedOrder()}>
							<div class="space-y-4">
								{/* Order header */}
								<Card class="enter-rise overflow-hidden">
									<div class="border-border border-b bg-wash-lemon/70 p-5 md:p-6">
										<div class="flex flex-wrap items-center justify-between gap-3">
											<div class="flex items-center gap-3">
												<div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-soft-sm">
													<IconPackage class="h-5 w-5" />
												</div>
												<div>
													<div class="text-muted-foreground text-xs uppercase tracking-wide">
														Захиалга №
													</div>
													<div class="font-display text-foreground text-lg">
														{trackedOrder()?.orderNumber}
													</div>
												</div>
											</div>
											<Badge
												variant={
													statusBadgeVariant[
														trackedOrder()?.status || "pending"
													] ?? "outline"
												}
											>
												{orderStatusLabels[
													trackedOrder()?.status as OrderStatusType
												] ??
													trackedOrder()?.status ??
													"Хүлээгдэж буй"}
											</Badge>
										</div>
									</div>
									<CardContent class="space-y-4 p-5 pt-5 md:p-6 md:pt-6">
										{/* Status timeline */}
										<Show when={currentStepIndex() >= 0}>
											<div class="rounded-xl bg-wash-mint/40 p-4">
												<div class="flex items-start">
													<For each={timelineSteps}>
														{(timelineStep, index) => {
															const done = () => index() < currentStepIndex();
															const current = () =>
																index() === currentStepIndex();
															return (
																<>
																	<Show when={index() > 0}>
																		<div
																			class={`mt-4 h-px flex-1 ${
																				index() <= currentStepIndex()
																					? "bg-success-foreground/40"
																					: "bg-border"
																			}`}
																		/>
																	</Show>
																	<div class="flex w-16 flex-col items-center gap-1.5">
																		<div
																			class={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
																				done() || current()
																					? "bg-success text-success-foreground"
																					: "border border-border bg-card text-muted-foreground"
																			}`}
																		>
																			{done() || current() ? (
																				<IconCheck class="h-4 w-4" />
																			) : (
																				<span class="font-semibold">
																					{index() + 1}
																				</span>
																			)}
																		</div>
																		<span
																			class={`text-center text-[11px] leading-tight ${
																				current()
																					? "font-semibold text-foreground"
																					: "text-muted-foreground"
																			}`}
																		>
																			{orderStatusLabels[timelineStep]}
																		</span>
																	</div>
																</>
															);
														}}
													</For>
												</div>
											</div>
										</Show>

										<div class="grid grid-cols-2 gap-3">
											<div class="rounded-xl bg-muted/50 p-3">
												<div class="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
													Огноо
												</div>
												<div class="font-medium text-foreground text-sm">
													{formatDate(trackedOrder()?.createdAt || new Date())}
												</div>
											</div>
											<div class="rounded-xl bg-muted/50 p-3">
												<div class="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
													Нийт дүн
												</div>
												<div class="font-display text-foreground text-sm">
													{trackedOrder()?.total?.toLocaleString()}₮
												</div>
											</div>
										</div>

										<div class="rounded-xl bg-muted/50 p-3">
											<div class="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
												Хүргэлтийн хаяг
											</div>
											<div class="text-foreground text-sm">
												{trackedOrder()?.address}
											</div>
										</div>

										{trackedOrder()?.notes && (
											<div class="rounded-xl bg-wash-lemon/50 p-3">
												<div class="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
													Тэмдэглэл
												</div>
												<div class="text-foreground text-sm">
													{trackedOrder()?.notes}
												</div>
											</div>
										)}

										{/* Payment status */}
										<div class="rounded-xl bg-muted/50 p-3">
											<div class="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
												Төлбөрийн төлөв
											</div>
											<div class="flex flex-wrap items-center gap-2">
												{trackedOrder()?.payments.map(
													(payment: { provider: string; status: string }) => (
														<Badge
															variant={
																payment.status === "success"
																	? "success"
																	: "warning"
															}
														>
															{payment.provider === "qpay"
																? "QPay"
																: payment.provider === "transfer"
																	? "Данс"
																	: payment.provider}{" "}
															-{" "}
															{paymentStatusLabels[payment.status] ||
																payment.status}
														</Badge>
													),
												)}
												{(trackedOrder()?.payments.length ?? 0) === 0 && (
													<span class="text-muted-foreground text-sm">
														Төлбөрийн мэдээлэл олдсонгүй
													</span>
												)}
											</div>
										</div>
									</CardContent>
								</Card>

								{/* Products */}
								<Card class="enter-rise stagger-1">
									<div class="border-border border-b p-5 md:p-6">
										<h3 class="font-display text-base text-foreground">
											Захиалсан бүтээгдэхүүнүүд
										</h3>
									</div>
									<CardContent class="space-y-3 p-5 pt-5 md:p-6 md:pt-6">
										{trackedOrder()?.orderDetails.map(
											(detail: {
												product: {
													name: string;
													images?: Array<{ url: string }>;
													brand?: { name: string };
												};
												quantity: number;
											}) => (
												<div class="flex items-center gap-3">
													{detail.product?.images?.[0]?.url && (
														<img
															src={detail.product.images[0].url}
															alt={detail.product.name}
															class="h-14 w-14 shrink-0 rounded-xl bg-muted object-cover"
															loading="lazy"
														/>
													)}
													<div class="min-w-0 flex-1">
														<div class="truncate font-semibold text-foreground text-sm">
															{detail.product?.name}
														</div>
														{detail.product?.brand?.name && (
															<div class="text-muted-foreground text-xs">
																{detail.product.brand.name}
															</div>
														)}
													</div>
													<div class="shrink-0 rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground text-xs">
														{detail.quantity}x
													</div>
												</div>
											),
										)}
									</CardContent>
								</Card>

								{/* New search */}
								<Button
									variant="outline"
									class="w-full"
									onClick={() => {
										setStep("input");
										trackMutation.reset();
										setOrderNumber("");
										setPhone("");
										setOtp("");
									}}
								>
									Өөр захиалга хайх
								</Button>
							</div>
						</Show>
					</>
				),
			})}
		</div>
	);
};

export default OrderTrackingForm;
