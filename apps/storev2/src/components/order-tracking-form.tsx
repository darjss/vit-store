import { useMutation, useQuery } from "@tanstack/solid-query";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { orderStatusLabels } from "@vit/shared";
import type { OrderStatusType } from "@vit/shared/types";
import { queryClient } from "@/lib/query";
import { parseOrderStatus } from "@/lib/order-status-parse";
import { api } from "@/lib/trpc";
import { showToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TextField, TextFieldInput, TextFieldLabel } from "@/components/ui/text-field";
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

const statusBadgeVariant = {
	cancelled: "error",
	created: "outline",
	delivered: "success",
	pending: "warning",
	refunded: "secondary",
	shipped: "info",
} satisfies Record<string, "outline" | "warning" | "info" | "success" | "error" | "secondary">;

const timelineSteps: Array<OrderStatusType> = ["pending", "shipped", "delivered"];

const paymentStatusLabels = {
	customer_claimed_paid: "Төлсөн гэж мэдэгдсэн",
	failed: "Амжилтгүй",
	pending: "Хүлээгдэж буй",
	success: "Амжилттай",
} satisfies Record<string, string>;

const OrderTrackingForm = () => {
	const [step, setStep] = createSignal<"input" | "otp" | "result">("input");
	const [phone, setPhone] = createSignal("");
	const [orderNumber, setOrderNumber] = createSignal("");
	const [otp, setOtp] = createSignal("");

	// Check auth status
	const authQuery = useQuery(
		() => ({
			queryFn: () => api.auth.check.query(),
			queryKey: ["auth-check"],
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
					description: error?.message || "Захиалгыг хянахад алдаа гарлаа",
					duration: 5000,
					title: "Алдаа",
					variant: "error",
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
			onError: (error: { message?: string }) => {
				showToast({
					description: error?.message || "Код илгээхэд алдаа гарлаа",
					duration: 5000,
					title: "Алдаа",
					variant: "error",
				});
			},
			onSuccess: () => {
				setStep("otp");
				showToast({
					description: "Таны утсанд баталгаажуулах код илгээгдлээ",
					duration: 5000,
					title: "Амжилттай",
					variant: "success",
				});
			},
		}),
		() => queryClient,
	);

	// OTP verify mutation
	const verifyOtpMutation = useMutation(
		() => ({
			mutationFn: async (input: { otp: string; phone: string }) => {
				return await api.auth.login.mutate({ otp: input.otp, phone: input.phone });
			},
			onError: (error: { message?: string }) => {
				showToast({
					description: error?.message || "Баталгаажуулалт амжилтгүй",
					duration: 5000,
					title: "Алдаа",
					variant: "error",
				});
			},
			onSuccess: () => {
				showToast({
					description: "Баталгаажлаа. Захиалгыг хайж байна...",
					duration: 3000,
					title: "Амжилттай",
					variant: "success",
				});
				// Now track the order
				trackMutation.mutate({ orderNumber: orderNumber(), phone: phone() });
				setStep("result");
			},
		}),
		() => queryClient,
	);

	const handleSearch = () => {
		if (!orderNumber().trim() || !phone().trim()) {
			showToast({
				description: "Захиалгын дугаар болон утасны дугаараа оруулна уу",
				duration: 3000,
				title: "Анхааруулга",
				variant: "default",
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
				description: "Баталгаажуулах кодоо оруулна уу",
				duration: 3000,
				title: "Анхааруулга",
				variant: "default",
			});
			return;
		}
		verifyOtpMutation.mutate({ otp: otp(), phone: phone() });
	};

	const formatDate = (timestamp: Date | string) => {
		return new Date(timestamp).toLocaleDateString("mn-MN", {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	};

	const trackedOrderStatus = () => parseOrderStatus(trackMutation.data?.status ?? "pending");

	const currentStepIndex = () => timelineSteps.indexOf(trackedOrderStatus());

	return (
		<div class="space-y-6">
			<Switch>
				<Match when={step() === "input"}>
					<Card class="enter-rise">
						<CardContent class="p-6 pt-6 md:p-8 md:pt-8">
							<div class="space-y-5">
								<div class="flex items-center gap-3">
									<div class="bg-wash-sky text-foreground flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full">
										<IconSearch class="h-5 w-5" />
									</div>
									<div>
										<h2 class="font-display text-foreground text-base">Захиалга хайх</h2>
										<p class="text-muted-foreground text-xs">
											Захиалгын дугаар, утасны дугаараа оруулна уу
										</p>
									</div>
								</div>

								<div class="space-y-4">
									<TextField>
										<TextFieldLabel>Захиалгын дугаар</TextFieldLabel>
										<TextFieldInput
											onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
												setOrderNumber(e.currentTarget.value)
											}
											placeholder="Жишээ: ORD12345"
											type="text"
											value={orderNumber()}
										/>
									</TextField>

									<TextField>
										<TextFieldLabel>Утасны дугаар</TextFieldLabel>
										<TextFieldInput
											maxLength={8}
											onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
												setPhone(e.currentTarget.value)
											}
											placeholder="88889999"
											type="tel"
											value={phone()}
										/>
									</TextField>
								</div>

								<Button class="w-full" disabled={sendOtpMutation.isPending} onClick={handleSearch}>
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
									<div class="bg-wash-mint/60 text-foreground flex items-center gap-2 rounded-xl p-3 text-xs">
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
									<div class="bg-wash-lilac text-foreground flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full">
										<IconLock class="h-5 w-5" />
									</div>
									<div>
										<h2 class="font-display text-foreground text-base">Баталгаажуулалт</h2>
										<p class="text-muted-foreground text-xs">
											{phone()} дугаарт илгээгдсэн кодыг оруулна уу
										</p>
									</div>
								</div>

								<TextField>
									<TextFieldLabel>Баталгаажуулах код</TextFieldLabel>
									<TextFieldInput
										class="font-display text-center text-lg tracking-[0.5em]"
										maxLength={6}
										onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
											setOtp(e.currentTarget.value)
										}
										placeholder="XXXX"
										type="text"
										value={otp()}
									/>
								</TextField>

								<Button
									class="w-full"
									disabled={verifyOtpMutation.isPending}
									onClick={handleVerifyOtp}
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

								<Button class="w-full" onClick={() => setStep("input")} size="sm" variant="ghost">
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
								<IconLoader class="text-cocoa mx-auto mb-4 h-10 w-10 animate-spin" />
								<p class="text-foreground text-sm font-semibold">Захиалгыг хайж байна...</p>
							</CardContent>
						</Card>
					</Show>

					<Show when={trackMutation.isError}>
						<Card class="enter-scale">
							<CardContent class="p-6 pt-6 text-center md:p-8 md:pt-8">
								<div class="bg-error text-error-foreground mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full">
									<IconAlert class="h-7 w-7" />
								</div>
								<h3 class="font-display text-foreground mb-2 text-lg">Захиалга олдсонгүй</h3>
								<p class="text-muted-foreground mb-5 text-sm">
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
								<div class="border-border bg-wash-lemon/70 border-b p-5 md:p-6">
									<div class="flex flex-wrap items-center justify-between gap-3">
										<div class="flex items-center gap-3">
											<div class="bg-card text-foreground shadow-soft-sm flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full">
												<IconPackage class="h-5 w-5" />
											</div>
											<div>
												<div class="text-muted-foreground text-xs tracking-wide uppercase">
													Захиалга №
												</div>
												<div class="font-display text-foreground text-lg">
													{trackMutation.data?.orderNumber}
												</div>
											</div>
										</div>
										<Badge
											variant={
												statusBadgeVariant[trackMutation.data?.status || "pending"] ?? "outline"
											}
										>
											{orderStatusLabels[trackedOrderStatus()] ??
												trackMutation.data?.status ??
												"Хүлээгдэж буй"}
										</Badge>
									</div>
								</div>
								<CardContent class="space-y-4 p-5 pt-5 md:p-6 md:pt-6">
									{/* Status timeline */}
									<Show when={currentStepIndex() >= 0}>
										<div class="bg-wash-mint/40 rounded-xl p-4">
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
																				: "border-border bg-card text-muted-foreground border"
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
																				? "text-foreground font-semibold"
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
										<div class="bg-muted/50 rounded-xl p-3">
											<div class="text-muted-foreground mb-1 text-xs tracking-wide uppercase">
												Огноо
											</div>
											<div class="text-foreground text-sm font-medium">
												{formatDate(trackMutation.data?.createdAt || new Date())}
											</div>
										</div>
										<div class="bg-muted/50 rounded-xl p-3">
											<div class="text-muted-foreground mb-1 text-xs tracking-wide uppercase">
												Нийт дүн
											</div>
											<div class="font-display text-foreground text-sm">
												{trackMutation.data?.total?.toLocaleString()}₮
											</div>
										</div>
									</div>

									<div class="bg-muted/50 rounded-xl p-3">
										<div class="text-muted-foreground mb-1 text-xs tracking-wide uppercase">
											Хүргэлтийн хаяг
										</div>
										<div class="text-foreground text-sm">{trackMutation.data?.address}</div>
									</div>

									{trackMutation.data?.notes && (
										<div class="bg-wash-lemon/50 rounded-xl p-3">
											<div class="text-muted-foreground mb-1 text-xs tracking-wide uppercase">
												Тэмдэглэл
											</div>
											<div class="text-foreground text-sm">{trackMutation.data?.notes}</div>
										</div>
									)}

									{/* Payment status */}
									<div class="bg-muted/50 rounded-xl p-3">
										<div class="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
											Төлбөрийн төлөв
										</div>
										<div class="flex flex-wrap items-center gap-2">
											{trackMutation.data?.payments?.map(
												(payment: { provider: string; status: string }) => (
													<Badge variant={payment.status === "success" ? "success" : "warning"}>
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
									<h3 class="font-display text-foreground text-base">Захиалсан бүтээгдэхүүнүүд</h3>
								</div>
								<CardContent class="space-y-3 p-5 pt-5 md:p-6 md:pt-6">
									{trackMutation.data?.orderDetails?.map(
										(detail: {
											product: {
												brand?: { name: string };
												images?: Array<{ url: string }>;
												name: string;
											};
											quantity: number;
										}) => (
											<div class="flex items-center gap-3">
												{detail.product?.images?.[0]?.url && (
													<img
														alt={detail.product.name}
														class="bg-muted h-14 w-14 shrink-0 rounded-xl object-cover"
														loading="lazy"
														src={detail.product.images[0].url}
													/>
												)}
												<div class="min-w-0 flex-1">
													<div class="text-foreground truncate text-sm font-semibold">
														{detail.product?.name}
													</div>
													{detail.product?.brand?.name && (
														<div class="text-muted-foreground text-xs">
															{detail.product.brand.name}
														</div>
													)}
												</div>
												<div class="bg-muted text-foreground shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
													{detail.quantity}x
												</div>
											</div>
										),
									)}
								</CardContent>
							</Card>

							{/* New search */}
							<Button
								class="w-full"
								onClick={() => {
									setStep("input");
									trackMutation.reset();
									setOrderNumber("");
									setPhone("");
									setOtp("");
								}}
								variant="outline"
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
