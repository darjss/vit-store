import { useMutation } from "@tanstack/solid-query";
import { loginResultSchemas, sendOtpResultSchemas } from "@vit/shared";
import {
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	OTPField,
	OTPFieldGroup,
	OTPFieldInput,
	OTPFieldSlot,
} from "@/components/ui/otp";
import { identifyUser } from "@/lib/analytics";
import { presentAuthError } from "@/lib/error-presentations";
import { queryClient } from "@/lib/query";
import { resultMutationOptions } from "@/lib/result-query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { CloseCircleIcon as IconCloseCircle } from "@solar-icons/solid/bold";
import { Button } from "../ui/button";
import { showToast } from "../ui/toast";

const OtpForm = (props: {
	phone: string;
	setStep: (step: "phone" | "otp") => void;
}) => {
	const [otp, setOtp] = createSignal("");
	const [lastAutoSubmittedOtp, setLastAutoSubmittedOtp] = createSignal("");
	const [timer, setTimer] = createSignal(59);
	const [canResend, setCanResend] = createSignal(false);

	let currentInterval: ReturnType<typeof setInterval> | undefined;

	const startTimer = (duration: number) => {
		if (currentInterval) clearInterval(currentInterval);

		setTimer(duration);
		setCanResend(false);

		currentInterval = setInterval(() => {
			setTimer((t) => {
				if (t <= 1) {
					setCanResend(true);
					if (currentInterval) clearInterval(currentInterval);
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
		if (currentInterval) clearInterval(currentInterval);
	});
	const loginMutation = useMutation(
		() => ({
			...resultMutationOptions(
				(otp: string) => api.v2.auth.login.mutate({ phone: props.phone, otp }),
				loginResultSchemas,
			),
			onSuccess: (result) =>
				result.match({
					ok: async () => {
						await identifyUser(props.phone);
						showToast({
							title: "Амжилттай нэвтэрлээ",
							description: "Тавтай морил!",
							variant: "success",
							duration: 3000,
						});
						props.setStep("phone");
						void safeNavigate("/profile", { history: "push" });
					},
					err: () => undefined,
				}),
		}),
		() => queryClient,
	);
	const sendOptMutation = useMutation(
		() => ({
			...resultMutationOptions(
				(phone: string) => api.v2.auth.sendOtp.mutate({ phone }),
				sendOtpResultSchemas,
			),
			onSuccess: (result) =>
				result.match({
					ok: () => {
						showToast({
							title: "Код дахин илгээгдлээ",
							description: "Таны утсанд шинэ баталгаажуулах код илгээгдлээ",
							variant: "success",
							duration: 5000,
						});
						props.setStep("otp");
						startTimer(59);
					},
					err: (error) => {
						const presentation = presentAuthError(error);
						showToast({
							title: presentation.title,
							description: presentation.description,
							variant: "error",
							duration: 5000,
						});
					},
				}),
		}),
		() => queryClient,
	);
	const loginFailure = createMemo(() =>
		loginMutation.data?.match({
			ok: () => undefined,
			err: presentAuthError,
		}),
	);
	const handleResend = () => sendOptMutation.mutate(props.phone);

	// Auto-submit when OTP is complete (4 digits)
	createEffect(() => {
		const otpValue = otp();
		if (
			otpValue.length === 4 &&
			otpValue !== lastAutoSubmittedOtp() &&
			!loginMutation.isPending
		) {
			setLastAutoSubmittedOtp(otpValue);
			loginMutation.mutate(otpValue);
		}
	});

	return (
		<div class="space-y-6">
			<div class="space-y-2 text-center">
				<h2 class="font-display text-foreground text-lg md:text-xl">
					Баталгаажуулах код
				</h2>
				<p class="text-muted-foreground text-sm">4 оронтой кодоо оруулна уу</p>
			</div>

			{/* OTP Input */}
			<div class="flex justify-center py-6">
				<OTPField
					value={otp()}
					onValueChange={(value) => setOtp(value)}
					maxLength={4}
				>
					<OTPFieldInput autofocus />
					<OTPFieldGroup>
						{[0, 1, 2, 3].map((index) => (
							<OTPFieldSlot
								index={index}
								class="rounded-xl bg-card shadow-soft-sm transition-[box-shadow] duration-150 ease-out hover:translate-x-0 hover:translate-y-0 hover:shadow-soft-sm [&>div]:rounded-xl [&>div]:ring-2"
							/>
						))}
					</OTPFieldGroup>
				</OTPField>
			</div>

			<Show when={loginFailure()} keyed>
				{(presentation) => (
					<div class="animate-shake rounded-xl border border-destructive/30 bg-error p-4">
						<div class="flex items-start gap-3">
							<IconCloseCircle class="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
							<div>
								<p class="font-semibold text-error-foreground text-sm">
									{presentation.title}
								</p>
								<p class="mt-1 text-error-foreground/80 text-xs">
									{presentation.description}
								</p>
							</div>
						</div>
					</div>
				)}
			</Show>

			<Show when={loginMutation.isError}>
				<div class="rounded-xl border border-destructive/30 bg-error p-4">
					<p class="font-semibold text-error-foreground text-sm">
						Нэвтрэх үйлчилгээнд түр саатал гарлаа.
					</p>
					<p class="mt-1 text-error-foreground/80 text-xs">
						Хэсэг хүлээгээд дахин оролдоно уу.
					</p>
				</div>
			</Show>

			<div class="space-y-3">
				<Button
					onClick={() => loginMutation.mutate(otp())}
					class="w-full"
					disabled={otp().length !== 4 || loginMutation.isPending}
				>
					{loginMutation.isPending ? "Баталгаажуулж байна..." : "Нэвтрэх"}
				</Button>

				<Button
					onClick={() => props.setStep("phone")}
					variant="outline"
					class="w-full"
				>
					Буцах
				</Button>
			</div>

			<div class="space-y-2 pt-4 text-center">
				<Show
					when={canResend()}
					fallback={
						<p class="text-muted-foreground text-sm">
							Код дахин илгээх боломжтой:{" "}
							<span class="font-semibold">{timer()}с</span>
						</p>
					}
				>
					<button
						onClick={handleResend}
						type="button"
						disabled={sendOptMutation.isPending}
						class="font-semibold text-foreground text-sm underline underline-offset-4 transition-colors duration-150 hover:text-cocoa disabled:opacity-50"
					>
						{sendOptMutation.isPending ? "Илгээж байна..." : "Код дахин илгээх"}
					</button>
				</Show>
			</div>
		</div>
	);
};
export default OtpForm;
