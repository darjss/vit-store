import { useMutation, useQuery } from "@tanstack/solid-query";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { orderStatusLabels } from "@vit/shared";
import type { OrderStatusType } from "@vit/shared/types";
import { queryClient } from "@/lib/query";
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
import IconPackage from "~icons/ri/archive-line";
import IconLock from "~icons/ri/lock-password-line";
import IconSearch from "~icons/ri/search-line";
import IconCheck from "~icons/ri/check-line";
import IconCheckDouble from "~icons/ri/check-double-line";
import IconAlert from "~icons/ri/error-warning-line";
import IconLoader from "~icons/ri/loader-4-line";

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

const OrderTrackingForm = () => {
	const [step, setStep] = createSignal<"input" | "otp" | "result">("input");
	const [phone, setPhone] = createSignal("");
	const [orderNumber, setOrderNumber] = createSignal("");
	const [otp, setOtp] = createSignal("");

	// Check auth status
	const authQuery = useQuery(
		() => ({
			queryKey: ["auth-check"],
			queryFn: () => api.auth.check.query(),
		}),
		() => queryClient,
	);

	// Track order mutation
	const trackMutation = useMutation(
		() => ({
			mutationFn: async (input: { orderNumber: string; phone?: string }) => {
				return await api.order.getOrderByOrderNumber.query({
					orderNumber: input.orderNumber,
				});
			},
			onError: (error: { message?: string }) => {
				showToast({
					title: "Алдаа",
					description: error?.message || "Захиалгыг хянахад алдаа гарлаа",
					variant: "error",
					duration: 5000,
				});
			},
		}),
		() => queryClient,
	);

	// OTP send mutation
	const sendOtpMutation = useMutation(
		() => ({
			mutationFn: async (phoneNumber: string) => {
				return await api.auth.sendOtp.mutate({ phone: phoneNumber });
			},
			onSuccess: () => {
				setStep("otp");
				showToast({
					title: "Амжилттай",
					description: "Таны утсанд баталгаажуулах код илгээгдлээ",
					variant: "success",
					duration: 5000,
				});
			},
			onError: (error: { message?: string }) => {
				showToast({
					title: "Алдаа",
					description: error?.message || "Код илгээхэд алдаа гарлаа",
					variant: "error",
					duration: 5000,
				});
			},
		}),
		() => queryClient,
	);

	// OTP verify mutation
	const verifyOtpMutation = useMutation(
		() => ({
			mutationFn: async (input: { phone: string; otp: string }) => {
				return await api.auth.login.mutate({ phone: input.phone, otp: input.otp });
			},
			onSuccess: () => {
				showToast({
					title: "Амжилттай",
					description: "Баталгаажлаа. Захиалгыг хайж байна...",
					variant: "success",
					duration: 3000,
				});
				// Now track the order
				trackMutation.mutate({ orderNumber: orderNumber(), phone: phone() });
				setStep("result");
			},
			onError: (error: { message?: string }) => {
				showToast({
					title: "Алдаа",
					description: error?.message || "Баталгаажуулалт амжилтгүй",
					variant: "error",
					duration: 5000,
				});
			},
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

		const user = authQuery.data;
		if (user && user.phone.toString() === phone()) {
			// Already logged in with matching phone
			trackMutation.mutate({ orderNumber: orderNumber(), phone: phone() });
			setStep("result");
		} else {
			// Need OTP verification
			sendOtpMutation.mutate(phone());
		}
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

	const currentStepIndex = () =>
		timelineSteps.indexOf(
			(trackMutation.data?.status ?? "pending") as OrderStatusType,
		);

	return (
		<div class="space-y-6">
			<Switch>
				<Match when={step() === "input"}>
					<Card class="enter-rise">
						<CardContent class="p-6 pt-6 md:p-8 md:pt-8">
							<div class="space-y-5">
								<div class="flex items-center gap-3">
									<div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-wash-sky text-foreground">
										<IconSearch class="h-5 w-5" />
									</div>
									<div>
										<h2 class="font-display text-base text-foreground">Захиалга хайх</h2>
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
											onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
												setOrderNumber(e.currentTarget.value)
											}
											placeholder="Жишээ: ORD12345"
										/>
									</TextField>

									<TextField>
										<TextFieldLabel>Утасны дугаар</TextFieldLabel>
										<TextFieldInput
											type="tel"
											value={phone()}
											onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
												setPhone(e.currentTarget.value)
											}
											placeholder="88889999"
											maxLength={8}
										/>
									</TextField>
								</div>

								<Button
									class="w-full"
									onClick={handleSearch}
									disabled={sendOtpMutation.isPending}
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

								<Show when={authQuery.data}>
									<div class="flex items-center gap-2 rounded-xl bg-wash-mint/60 p-3 text-foreground text-xs">
										<IconCheckDouble class="h-4 w-4 shrink-0" />
										<span>Та нэвтэрсэн байна. Захиалгын дугаараа оруулан шууд хайна уу.</span>
									</div>
								</Show>
							</div>
						</CardContent>
					</Card>
				</Match>

				<Match when={step() === "otp"}>
					<Card class="enter-rise">
						<CardContent class="p-6 pt-6 md:p-8 md:pt-8">
							<div class="space-y-5">
								<div class="flex items-center gap-3">
									<div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-wash-lilac text-foreground">
										<IconLock class="h-5 w-5" />
									</div>
									<div>
										<h2 class="font-display text-base text-foreground">Баталгаажуулалт</h2>
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
										onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
											setOtp(e.currentTarget.value)
										}
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
				</Match>

				<Match when={step() === "result"}>
					<Show when={trackMutation.isPending}>
						<Card class="enter-scale">
							<CardContent class="p-8 pt-8 text-center">
								<IconLoader class="mx-auto mb-4 h-10 w-10 animate-spin text-cocoa" />
								<p class="font-semibold text-foreground text-sm">Захиалгыг хайж байна...</p>
							</CardContent>
						</Card>
					</Show>

					<Show when={trackMutation.isError}>
						<Card class="enter-scale">
							<CardContent class="p-6 pt-6 text-center md:p-8 md:pt-8">
								<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error text-error-foreground">
									<IconAlert class="h-7 w-7" />
								</div>
								<h3 class="mb-2 font-display text-foreground text-lg">Захиалга олдсонгүй</h3>
								<p class="mb-5 text-muted-foreground text-sm">
									Захиалгын дугаар эсвэл утасны дугаар буруу байж магадгүй.
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

					<Show when={trackMutation.isSuccess && trackMutation.data}>
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
													{trackMutation.data?.orderNumber}
												</div>
											</div>
										</div>
										<Badge
											variant={
												statusBadgeVariant[trackMutation.data?.status || "pending"] ??
												"outline"
											}
										>
											{orderStatusLabels[
												trackMutation.data?.status as OrderStatusType
											] ??
												trackMutation.data?.status ??
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
														const current = () => index() === currentStepIndex();
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
																			<span class="font-semibold">{index() + 1}</span>
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
												{formatDate(trackMutation.data?.createdAt || new Date())}
											</div>
										</div>
										<div class="rounded-xl bg-muted/50 p-3">
											<div class="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
												Нийт дүн
											</div>
											<div class="font-display text-foreground text-sm">
												{trackMutation.data?.total?.toLocaleString()}₮
											</div>
										</div>
									</div>

									<div class="rounded-xl bg-muted/50 p-3">
										<div class="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
											Хүргэлтийн хаяг
										</div>
										<div class="text-foreground text-sm">{trackMutation.data?.address}</div>
									</div>

									{trackMutation.data?.notes && (
										<div class="rounded-xl bg-wash-lemon/50 p-3">
											<div class="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
												Тэмдэглэл
											</div>
											<div class="text-foreground text-sm">{trackMutation.data?.notes}</div>
										</div>
									)}

									{/* Payment status */}
									<div class="rounded-xl bg-muted/50 p-3">
										<div class="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
											Төлбөрийн төлөв
										</div>
										<div class="flex flex-wrap items-center gap-2">
											{trackMutation.data?.payments?.map(
												(payment: { provider: string; status: string }) => (
													<Badge
														variant={payment.status === "success" ? "success" : "warning"}
													>
														{payment.provider === "qpay"
															? "QPay"
															: payment.provider === "transfer"
																? "Данс"
																: payment.provider}{" "}
														- {paymentStatusLabels[payment.status] || payment.status}
													</Badge>
												),
											)}
											{(!trackMutation.data?.payments ||
												trackMutation.data.payments.length === 0) && (
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
									{trackMutation.data?.orderDetails?.map(
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
				</Match>
			</Switch>
		</div>
	);
};

export default OrderTrackingForm;
