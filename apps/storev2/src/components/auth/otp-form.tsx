import { CloseCircleIcon as IconCloseCircle } from "@solar-icons/solid/bold";
import { useMutation } from "@tanstack/solid-query";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { OTPField, OTPFieldGroup, OTPFieldInput, OTPFieldSlot } from "@/components/ui/otp";
import { identifyUser } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { Button } from "../ui/button";
import { showToast } from "../ui/toast";

const OtpForm = (props: { phone: string; setStep: (step: "phone" | "otp") => void }) => {
	const [otp, setOtp] = createSignal("");
	const [timer, setTimer] = createSignal(59);
	const [canResend, setCanResend] = createSignal(false);

	let currentInterval: ReturnType<typeof setInterval> | undefined;

	const startTimer = (duration: number) => {
		if (currentInterval) {
			clearInterval(currentInterval);
		}

		setTimer(duration);
		setCanResend(false);

		currentInterval = setInterval(() => {
			setTimer((t) => {
				if (t <= 1) {
					setCanResend(true);
					if (currentInterval) {
						clearInterval(currentInterval);
					}
					return 0;
				}
				return t - 1;
			});
		}, 1000);
	};

	onMount(() => {
		startTimer(59);
	});

	onCleanup(() => {
		if (currentInterval) {
			clearInterval(currentInterval);
		}
	});
	const loginMutation = useMutation(
		() => ({
			mutationFn: async (otp: string) => {
				return await api.auth.login.mutate({ otp, phone: props.phone });
			},
			onSuccess: async () => {
				// Identify user in PostHog for cross-session tracking
				await identifyUser(props.phone);

				showToast({
					description: "Тавтай морил!",
					duration: 3000,
					title: "Амжилттай нэвтэрлээ",
					variant: "success",
				});
				props.setStep("phone");
				void safeNavigate("/profile", { history: "push" });
			},
		}),
		() => queryClient,
	);
	const sendOptMutation = useMutation(
		() => ({
			mutationFn: async (phone: string) => {
				return await api.auth.sendOtp.mutate({ phone });
			},

			onSuccess: async () => {
				showToast({
					description: "Таны утсанд шинэ баталгаажуулах код илгээгдлээ",
					duration: 5000,
					title: "Код дахин илгээгдлээ",
					variant: "success",
				});
				props.setStep("otp");
			},
		}),
		() => queryClient,
	);
	const handleResend = () => {
		sendOptMutation.mutate(props.phone);
		startTimer(59);
	};

	return (
		<div class="space-y-6">
			<div class="space-y-2 text-center">
				<h2 class="font-display text-foreground text-lg md:text-xl">Баталгаажуулах код</h2>
				<p class="text-muted-foreground text-sm">4 оронтой кодоо оруулна уу</p>
			</div>

			{/* OTP Input */}
			<div class="flex justify-center py-6">
				<OTPField
					maxLength={4}
					onComplete={(value) => {
						if (!loginMutation.isPending) {
							loginMutation.mutate(value);
						}
					}}
					onValueChange={(value) => setOtp(value)}
					value={otp()}
				>
					<OTPFieldInput autofocus />
					<OTPFieldGroup>
						{[0, 1, 2, 3].map((index) => (
							<OTPFieldSlot
								class="bg-card shadow-soft-sm hover:shadow-soft-sm rounded-xl transition-[box-shadow] duration-150 ease-out hover:translate-x-0 hover:translate-y-0 [&>div]:rounded-xl [&>div]:ring-2"
								index={index}
							/>
						))}
					</OTPFieldGroup>
				</OTPField>
			</div>

			{loginMutation.isError && (
				<div class="animate-shake border-destructive/30 bg-error rounded-xl border p-4">
					<div class="flex items-center gap-3">
						<IconCloseCircle class="text-destructive h-5 w-5 flex-shrink-0" />
						<p class="text-error-foreground text-sm font-semibold">
							Код буруу байна. Дахин оролдоно уу.
						</p>
					</div>
				</div>
			)}

			<div class="space-y-3">
				<Button
					class="w-full"
					disabled={otp().length !== 4 || loginMutation.isPending}
					onClick={() => loginMutation.mutate(otp())}
				>
					{loginMutation.isPending ? "Баталгаажуулж байна..." : "Нэвтрэх"}
				</Button>

				<Button class="w-full" onClick={() => props.setStep("phone")} variant="outline">
					Буцах
				</Button>
			</div>

			<div class="space-y-2 pt-4 text-center">
				<Show
					fallback={
						<p class="text-muted-foreground text-sm">
							Код дахин илгээх боломжтой: <span class="font-semibold">{timer()}с</span>
						</p>
					}
					when={canResend()}
				>
					<button
						class="text-foreground hover:text-cocoa text-sm font-semibold underline underline-offset-4 transition-colors duration-150 disabled:opacity-50"
						disabled={sendOptMutation.isPending}
						onClick={handleResend}
						type="button"
					>
						{sendOptMutation.isPending ? "Илгээж байна..." : "Код дахин илгээх"}
					</button>
				</Show>
			</div>
		</div>
	);
};
export default OtpForm;
