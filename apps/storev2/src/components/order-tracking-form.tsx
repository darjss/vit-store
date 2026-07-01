import { useMutation, useQuery } from "@tanstack/solid-query";
import { createSignal, Match, Show, Switch } from "solid-js";
import { orderStatusLabels } from "@vit/shared";
import type { OrderStatusType } from "@vit/shared/types";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { showToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import IconPackage from "~icons/ri/archive-line";
import IconLock from "~icons/ri/lock-password-line";
import IconSearch from "~icons/ri/search-line";
import IconCheck from "~icons/ri/check-double-line";
import IconAlert from "~icons/ri/error-warning-line";
import IconLoader from "~icons/ri/loader-4-line";

// Storefront-specific badge colors (theme tokens, not the admin hex palette).
const statusColors: Record<string, string> = {
	created: "bg-muted text-muted-foreground",
	pending: "bg-primary text-foreground",
	shipped: "bg-chart-2 text-foreground",
	delivered: "bg-chart-4 text-foreground",
	cancelled: "bg-destructive text-destructive-foreground",
	refunded: "bg-muted text-muted-foreground",
};

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

	return (
		<div class="space-y-6">
			<Switch>
				<Match when={step() === "input"}>
					<Card class="bg-card border border-border shadow-soft-sm">
						<CardContent class="p-5 lg:p-6">
							<div class="space-y-4">
								<div class="flex items-center gap-3 mb-2">
									<div class="w-10 h-10 rounded-md border border-border bg-primary flex items-center justify-center">
										<IconSearch class="w-5 h-5" />
									</div>
									<div>
										<h2 class="font-extrabold text-sm uppercase tracking-wider">Захиалга хайх</h2>
										<p class="text-xs font-medium text-muted-foreground">Захиалгын дугаар, утасны дугаараа оруулна уу</p>
									</div>
								</div>

								<div class="space-y-3">
									<div>
										<label class="block text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1.5">
											Захиалгын дугаар
										</label>
										<input
											type="text"
											value={orderNumber()}
											onInput={(e) => setOrderNumber(e.currentTarget.value)}
											placeholder="Жишээ: ORD12345"
											class="w-full rounded-md border border-border bg-background px-3 py-2.5 font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</div>

									<div>
										<label class="block text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1.5">
											Утасны дугаар
										</label>
										<input
											type="tel"
											value={phone()}
											onInput={(e) => setPhone(e.currentTarget.value)}
											placeholder="88889999"
											maxLength={8}
											class="w-full rounded-md border border-border bg-background px-3 py-2.5 font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</div>
								</div>

								<button
									type="button"
									onClick={handleSearch}
									disabled={sendOtpMutation.isPending}
									class="w-full rounded-lg border border-border bg-primary px-4 py-3 font-extrabold text-sm uppercase tracking-wider shadow-soft-lg transition-all hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{sendOtpMutation.isPending ? (
										<span class="flex items-center justify-center gap-2">
											<IconLoader class="w-4 h-4 animate-spin" />
											Илгээж байна...
										</span>
									) : (
										<span class="flex items-center justify-center gap-2">
											<IconSearch class="w-4 h-4" />
											Хайх
										</span>
									)}
								</button>

								<Show when={authQuery.data}>
									<div class="flex items-center gap-2 rounded-md text-xs font-medium text-muted-foreground border border-border bg-muted/30 p-3">
										<IconCheck class="w-4 h-4 text-primary shrink-0" />
										<span>Та нэвтэрсэн байна. Захиалгын дугаараа оруулан шууд хайна уу.</span>
									</div>
								</Show>
							</div>
						</CardContent>
					</Card>
				</Match>

				<Match when={step() === "otp"}>
					<Card class="bg-card border border-border shadow-soft-sm">
						<CardContent class="p-5 lg:p-6">
							<div class="space-y-4">
								<div class="flex items-center gap-3 mb-2">
									<div class="w-10 h-10 rounded-md border border-border bg-primary flex items-center justify-center">
										<IconLock class="w-5 h-5" />
									</div>
									<div>
										<h2 class="font-extrabold text-sm uppercase tracking-wider">Баталгаажуулалт</h2>
										<p class="text-xs font-medium text-muted-foreground">{phone()} дугаарт илгээгдсэн кодыг оруулна уу</p>
									</div>
								</div>

								<div>
									<label class="block text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1.5">
										Баталгаажуулах код
									</label>
									<input
										type="text"
										value={otp()}
										onInput={(e) => setOtp(e.currentTarget.value)}
										placeholder="XXXX"
										maxLength={6}
										class="w-full rounded-md border border-border bg-background px-3 py-2.5 font-extrabold text-lg tracking-[0.5em] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									/>
								</div>

								<button
									type="button"
									onClick={handleVerifyOtp}
									disabled={verifyOtpMutation.isPending}
									class="w-full rounded-lg border border-border bg-primary px-4 py-3 font-extrabold text-sm uppercase tracking-wider shadow-soft-lg transition-all hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{verifyOtpMutation.isPending ? (
										<span class="flex items-center justify-center gap-2">
											<IconLoader class="w-4 h-4 animate-spin" />
											Баталгаажуулж байна...
										</span>
									) : (
										"Баталгаажуулах"
									)}
								</button>

								<button
									type="button"
									onClick={() => setStep("input")}
									class="w-full rounded-md border border-border bg-muted px-4 py-2.5 font-bold text-xs uppercase tracking-wider hover:bg-primary transition-colors"
								>
									Буцах
								</button>
							</div>
						</CardContent>
					</Card>
				</Match>

				<Match when={step() === "result"}>
					<Show when={trackMutation.isPending}>
						<Card class="bg-card border border-border shadow-soft-sm">
							<CardContent class="p-8 text-center">
								<IconLoader class="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
								<p class="font-extrabold text-sm uppercase tracking-wide">Захиалгыг хайж байна...</p>
							</CardContent>
						</Card>
					</Show>

					<Show when={trackMutation.isError}>
						<Card class="bg-card border border-border shadow-soft-sm">
							<CardContent class="p-6 text-center">
								<div class="w-16 h-16 rounded-md border border-border bg-destructive flex items-center justify-center mx-auto mb-4">
									<IconAlert class="w-8 h-8 text-destructive-foreground" />
								</div>
								<h3 class="font-extrabold text-lg uppercase tracking-tight mb-2">Захиалга олдсонгүй</h3>
								<p class="text-sm font-medium text-muted-foreground mb-4">
									Захиалгын дугаар эсвэл утасны дугаар буруу байж магадгүй.
								</p>
								<button
									type="button"
									onClick={() => {
										setStep("input");
										trackMutation.reset();
									}}
									class="rounded-lg border border-border bg-primary px-6 py-2.5 font-extrabold text-sm uppercase tracking-wider shadow-soft-lg transition-all hover:-translate-y-0.5 hover:shadow-soft"
								>
									Дахин оролдох
								</button>
							</CardContent>
						</Card>
					</Show>

					<Show when={trackMutation.isSuccess && trackMutation.data}>
						<div class="space-y-4">
							{/* Order Header */}
							<Card class="bg-card border border-border shadow-soft-sm overflow-hidden">
								<div class="bg-primary p-4 lg:p-5 border-b border-border">
									<div class="flex items-center justify-between flex-wrap gap-3">
										<div class="flex items-center gap-3">
											<div class="w-10 h-10 rounded-md border border-border bg-card flex items-center justify-center">
												<IconPackage class="w-5 h-5" />
											</div>
											<div>
												<div class="text-[10px] font-extrabold uppercase tracking-widest text-foreground/80">ЗАХИАЛГА №</div>
												<div class="font-extrabold text-lg">{trackMutation.data?.orderNumber}</div>
											</div>
										</div>
										<span
											class={`px-3 py-1.5 rounded border border-border font-bold text-xs uppercase ${statusColors[trackMutation.data?.status || "pending"]}`}
										>
											{orderStatusLabels[trackMutation.data?.status as OrderStatusType] ?? trackMutation.data?.status ?? "Хүлээгдэж буй"}
										</span>
									</div>
								</div>
								<CardContent class="p-4 lg:p-5 space-y-4">
									<div class="grid grid-cols-2 gap-3">
										<div class="rounded-md border border-border bg-muted/30 p-3">
											<div class="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">ОГНОО</div>
											<div class="font-bold text-sm">{formatDate(trackMutation.data?.createdAt || new Date())}</div>
										</div>
										<div class="rounded-md border border-border bg-muted/30 p-3">
											<div class="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">НИЙТ ДҮН</div>
											<div class="font-extrabold text-sm text-primary">{trackMutation.data?.total?.toLocaleString()}₮</div>
										</div>
									</div>

									<div class="rounded-md border border-border bg-muted/30 p-3">
										<div class="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">ХҮРГЭЛТИЙН ХАЯГ</div>
										<div class="font-bold text-sm">{trackMutation.data?.address}</div>
									</div>

									{trackMutation.data?.notes && (
										<div class="rounded-md border border-border bg-primary/10 p-3">
											<div class="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">ТЭМДЭГЛЭЛ</div>
											<div class="font-medium text-sm">{trackMutation.data?.notes}</div>
										</div>
									)}

									{/* Payment Status */}
									<div class="rounded-md border border-border bg-muted/30 p-3">
										<div class="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">ТӨЛБӨРИЙН ТӨЛӨВ</div>
										<div class="flex items-center gap-2 flex-wrap">
											{trackMutation.data?.payments?.map((payment: { provider: string; status: string }) => (
												<span
													class={`px-2 py-1 rounded border border-border font-bold text-[11px] uppercase ${payment.status === "success" ? "bg-chart-4 text-foreground" : "bg-primary text-foreground"}`}
												>
													{payment.provider === "qpay" ? "QPay" : payment.provider === "transfer" ? "Данс" : payment.provider} — {paymentStatusLabels[payment.status] || payment.status}
												</span>
											))}
											{(!trackMutation.data?.payments || trackMutation.data.payments.length === 0) && (
												<span class="text-sm font-medium text-muted-foreground">Төлбөрийн мэдээлэл олдсонгүй</span>
											)}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Products */}
							<Card class="bg-card border border-border shadow-soft-sm">
								<div class="p-4 lg:p-5 border-b border-border">
									<h3 class="font-extrabold text-sm uppercase tracking-wider">Захиалсан бүтээгдэхүүнүүд</h3>
								</div>
								<CardContent class="p-4 lg:p-5 space-y-3">
									{trackMutation.data?.orderDetails?.map((detail: { product: { name: string; images?: Array<{ url: string }>; brand?: { name: string } }; quantity: number }) => (
										<div class="flex items-center gap-3 rounded-md border border-border bg-background p-3">
											{detail.product?.images?.[0]?.url && (
												<img
													src={detail.product.images[0].url}
													alt={detail.product.name}
													class="w-14 h-14 object-cover rounded border border-border shrink-0"
													loading="lazy"
												/>
											)}
											<div class="flex-1 min-w-0">
												<div class="font-bold text-sm truncate">{detail.product?.name}</div>
												{detail.product?.brand?.name && (
													<div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{detail.product.brand.name}</div>
												)}
											</div>
											<div class="px-2.5 py-1 rounded border border-border bg-muted font-extrabold text-xs shrink-0">
												{detail.quantity}x
											</div>
										</div>
									))}
								</CardContent>
							</Card>

							{/* New Search */}
							<button
								type="button"
								onClick={() => {
									setStep("input");
									trackMutation.reset();
									setOrderNumber("");
									setPhone("");
									setOtp("");
								}}
								class="w-full rounded-lg border border-border bg-muted px-4 py-3 font-bold text-sm uppercase tracking-wider shadow-soft-lg transition-all hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.97]"
							>
								Өөр захиалга хайх
							</button>
						</div>
					</Show>
				</Match>
			</Switch>
		</div>
	);
};

export default OrderTrackingForm;
