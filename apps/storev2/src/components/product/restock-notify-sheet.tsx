import {
	CheckCircleIcon as IconCheckCircle,
	BellIcon as IconNotification,
} from "@solar-icons/solid/bold";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, Match, Show, Switch } from "solid-js";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	type SheetFocusRestore,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	trackRestockChannelSelected,
	trackRestockConfirmationCompleted,
	trackRestockConfirmationRequested,
	trackRestockSheetOpened,
	trackRestockSubscriptionCreated,
	trackRestockSubscriptionFailed,
} from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";

type RestockChannel = "sms" | "email";
type SheetStage = "contact" | "confirmation" | "success";

function errorCode(error: unknown) {
	if (
		typeof error === "object" &&
		error !== null &&
		"data" in error &&
		typeof error.data === "object" &&
		error.data !== null &&
		"code" in error.data
	) {
		return String(error.data.code);
	}
	return "UNKNOWN";
}

function restockErrorMessage(error: unknown, stage: SheetStage) {
	switch (errorCode(error)) {
		case "TOO_MANY_REQUESTS":
			return "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.";
		case "NOT_FOUND":
			return "Бараа олдсонгүй. Хуудсаа шинэчлээд дахин оролдоно уу.";
		case "BAD_REQUEST":
			return stage === "confirmation"
				? "Код буруу эсвэл хугацаа нь дууссан. Шалгаад дахин оруулна уу."
				: "Оруулсан мэдээллээ шалгаад дахин оролдоно уу.";
		default:
			return "Хүсэлт илгээж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.";
	}
}

function restockDescription(productName?: string) {
	return productName
		? `${productName} дахин орвол танд мэдэгдэнэ.`
		: "Бараа дахин орвол танд мэдэгдэнэ.";
}

function restockCustomerType(identity: unknown) {
	return identity ? ("verified_customer" as const) : ("guest" as const);
}

type ValidatedContact =
	| { valid: true; contact: string }
	| { valid: false; error: string };

function validatedContact(
	channel: RestockChannel,
	value: string,
): ValidatedContact {
	const contact =
		channel === "sms" ? value.replace(/\D/g, "") : value.trim().toLowerCase();
	const valid =
		channel === "sms"
			? /^[6-9]\d{7}$/.test(contact)
			: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
	if (valid) return { valid: true, contact };
	return {
		valid: false,
		error:
			channel === "sms"
				? "8 оронтой утасны дугаар оруулна уу."
				: "И-мэйлийн хаягаа зөв оруулна уу.",
	};
}

interface RestockNotifySheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	focusRestore: SheetFocusRestore;
	productId: number;
	productName?: string;
}

export default function RestockNotifySheet(props: RestockNotifySheetProps) {
	const [stage, setStage] = createSignal<SheetStage>("contact");
	const [channel, setChannel] = createSignal<RestockChannel>("sms");
	const [contact, setContact] = createSignal("");
	const [code, setCode] = createSignal("");
	const [challengeId, setChallengeId] = createSignal("");
	const [guestFlow, setGuestFlow] = createSignal(false);
	const [errorMessage, setErrorMessage] = createSignal("");
	let contactInput: HTMLInputElement | undefined;
	let codeInput: HTMLInputElement | undefined;
	let trackedOpen = false;

	const identityQuery = useQuery(
		() => ({
			queryKey: ["restock-subscription-identity"],
			queryFn: () => api.product.restockSubscriptionIdentity.query(),
			enabled: props.open,
			staleTime: 0,
		}),
		() => queryClient,
	);

	const customerType = () => restockCustomerType(identityQuery.data);
	const verifiedPhoneFlow = () => Boolean(identityQuery.data) && !guestFlow();

	const analyticsEvent = () => ({
		productId: props.productId,
		channel: channel(),
		customerType: customerType(),
	});

	const reset = () => {
		setStage("contact");
		setChannel("sms");
		setContact("");
		setCode("");
		setChallengeId("");
		setGuestFlow(false);
		setErrorMessage("");
	};

	createEffect(() => {
		if (!props.open) {
			trackedOpen = false;
			reset();
			return;
		}
		if (identityQuery.isSuccess && !identityQuery.isFetching && !trackedOpen) {
			trackedOpen = true;
			trackRestockSheetOpened({
				productId: props.productId,
				customerType: customerType(),
			});
		}
	});

	const verifiedMutation = useMutation(
		() => ({
			mutationFn: () =>
				api.product.subscribeToRestock.mutate({ productId: props.productId }),
			onSuccess: (result) => {
				trackRestockSubscriptionCreated({
					...analyticsEvent(),
					channel: "sms",
					alreadySubscribed: result.alreadySubscribed,
				});
				setStage("success");
				setErrorMessage("");
			},
			onError: (error) => {
				trackRestockSubscriptionFailed({
					...analyticsEvent(),
					channel: "sms",
					errorCode: errorCode(error),
				});
				setErrorMessage(restockErrorMessage(error, "contact"));
			},
		}),
		() => queryClient,
	);

	const requestMutation = useMutation(
		() => ({
			mutationFn: () =>
				api.product.requestGuestRestockConfirmation.mutate({
					productId: props.productId,
					channel: channel(),
					contact: contact(),
				}),
			onSuccess: (result) => {
				setChallengeId(result.challengeId);
				setCode("");
				setErrorMessage("");
				setStage("confirmation");
				trackRestockConfirmationRequested(analyticsEvent());
				queueMicrotask(() => codeInput?.focus());
			},
			onError: (error) => {
				trackRestockSubscriptionFailed({
					...analyticsEvent(),
					errorCode: errorCode(error),
				});
				setErrorMessage(restockErrorMessage(error, "contact"));
			},
		}),
		() => queryClient,
	);

	const confirmMutation = useMutation(
		() => ({
			mutationFn: () =>
				api.product.confirmGuestRestockSubscription.mutate({
					challengeId: challengeId(),
					code: code(),
				}),
			onSuccess: (result) => {
				trackRestockConfirmationCompleted(analyticsEvent());
				trackRestockSubscriptionCreated({
					...analyticsEvent(),
					alreadySubscribed: result.alreadySubscribed,
				});
				setErrorMessage("");
				setStage("success");
			},
			onError: (error) => {
				trackRestockSubscriptionFailed({
					...analyticsEvent(),
					errorCode: errorCode(error),
				});
				setErrorMessage(restockErrorMessage(error, "confirmation"));
				queueMicrotask(() => codeInput?.focus());
			},
		}),
		() => queryClient,
	);

	const selectChannel = (nextChannel: RestockChannel) => {
		setChannel(nextChannel);
		setContact("");
		setErrorMessage("");
		trackRestockChannelSelected({
			productId: props.productId,
			channel: nextChannel,
			customerType: customerType(),
		});
	};

	const requestConfirmation = () => {
		const result = validatedContact(channel(), contact());
		if (!result.valid) {
			setErrorMessage(result.error);
			contactInput?.focus();
			return;
		}
		setContact(result.contact);
		setErrorMessage("");
		requestMutation.mutate();
	};

	const submitCode = () => {
		if (!/^\d{6}$/.test(code())) {
			setErrorMessage("6 оронтой код оруулна уу.");
			codeInput?.focus();
			return;
		}
		setErrorMessage("");
		confirmMutation.mutate();
	};

	const startVerifiedEmailFlow = () => {
		setGuestFlow(true);
		setStage("contact");
		selectChannel("email");
		queueMicrotask(() => contactInput?.focus());
	};

	const startNewConfirmation = () => {
		setStage("contact");
		setChallengeId("");
		setCode("");
		setErrorMessage("");
		queueMicrotask(() => contactInput?.focus());
	};

	return (
		<Sheet open={props.open} onOpenChange={props.onOpenChange}>
			<SheetContent
				position="bottom"
				closeLabel="Мэдэгдлийн цонхыг хаах"
				focusRestore={props.focusRestore}
				class="flex max-h-[88vh] flex-col rounded-t-2xl border-border border-t bg-card p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
			>
				<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
					<SheetTitle class="font-bold font-display text-lg tracking-tight">
						Мэдэгдэл авах
					</SheetTitle>
					<SheetDescription class="text-muted-foreground text-sm">
						{restockDescription(props.productName)}
					</SheetDescription>
				</SheetHeader>

				<div class="space-y-4 px-5 py-5">
					<Switch>
						<Match when={identityQuery.isPending || identityQuery.isFetching}>
							<output class="block space-y-3" aria-label="Уншиж байна">
								<div class="h-5 w-2/3 animate-pulse rounded-lg bg-muted" />
								<div class="h-12 w-full animate-pulse rounded-xl bg-muted" />
							</output>
						</Match>

						<Match when={identityQuery.isError}>
							<div class="space-y-4">
								<p class="text-sm" role="alert">
									Мэдэгдлийн тохиргоог уншиж чадсангүй. Холболтоо шалгаад дахин
									оролдоно уу.
								</p>
								<Button
									type="button"
									class="w-full"
									onClick={() => identityQuery.refetch()}
								>
									Дахин оролдох
								</Button>
							</div>
						</Match>

						<Match when={stage() === "success"}>
							<output class="block space-y-5 text-center">
								<div class="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-success-foreground">
									<IconCheckCircle class="size-6" aria-hidden="true" />
								</div>
								<div class="space-y-1">
									<p class="font-semibold text-base">Мэдэгдэл бэлэн боллоо</p>
									<p class="text-muted-foreground text-sm">
										Бараа дахин ормогц танд мэдэгдэнэ.
									</p>
								</div>
								<Button
									type="button"
									class="w-full"
									onClick={() => props.onOpenChange(false)}
								>
									Хаах
								</Button>
							</output>
						</Match>

						<Match when={stage() === "confirmation"}>
							<div class="space-y-4">
								<div class="space-y-1">
									<p class="font-semibold text-sm">Кодоо оруулна уу</p>
									<p class="text-muted-foreground text-sm">
										{channel() === "sms" ? "Утас" : "И-мэйл"} рүү илгээсэн 6
										оронтой код 10 минут хүчинтэй.
									</p>
								</div>
								<div class="space-y-2">
									<label class="font-medium text-sm" for="restock-code">
										Баталгаажуулах код
									</label>
									<input
										ref={(element) => {
											codeInput = element;
										}}
										id="restock-code"
										name="restock-code"
										type="text"
										inputMode="numeric"
										autocomplete="one-time-code"
										maxLength={6}
										value={code()}
										onInput={(event) =>
											setCode(event.currentTarget.value.replace(/\D/g, ""))
										}
										onKeyDown={(event) => {
											if (event.key === "Enter") submitCode();
										}}
										aria-invalid={Boolean(errorMessage())}
										aria-describedby={
											errorMessage() ? "restock-error" : undefined
										}
										placeholder="123456"
										class="h-12 w-full rounded-xl border border-border bg-background px-4 text-center font-semibold text-base tracking-[0.25em] shadow-soft-sm transition-[box-shadow,border-color] duration-200 ease-out focus-visible:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
									/>
								</div>
								<Show when={errorMessage()}>
									<p
										id="restock-error"
										class="rounded-xl bg-error px-4 py-3 text-error-foreground text-sm"
										role="alert"
									>
										{errorMessage()}
									</p>
								</Show>
								<div class="space-y-2">
									<Button
										type="button"
										class="w-full"
										size="lg"
										disabled={confirmMutation.isPending}
										onClick={submitCode}
									>
										{confirmMutation.isPending
											? "Баталгаажуулж байна..."
											: "Код баталгаажуулах"}
									</Button>
									<Button
										type="button"
										variant="outline"
										class="w-full"
										disabled={confirmMutation.isPending}
										onClick={startNewConfirmation}
									>
										Шинэ код авах
									</Button>
								</div>
							</div>
						</Match>

						<Match when={verifiedPhoneFlow()}>
							<div class="space-y-4">
								<p class="text-sm">
									Мэдэгдлийг баталгаажсан {identityQuery.data?.maskedPhone}{" "}
									дугаарт SMS-ээр илгээнэ.
								</p>
								<Show when={errorMessage()}>
									<p
										id="restock-error"
										class="rounded-xl bg-error px-4 py-3 text-error-foreground text-sm"
										role="alert"
									>
										{errorMessage()}
									</p>
								</Show>
								<div class="space-y-2">
									<Button
										type="button"
										class="w-full"
										size="lg"
										disabled={verifiedMutation.isPending}
										onClick={() => verifiedMutation.mutate()}
									>
										<IconNotification aria-hidden="true" />
										{verifiedMutation.isPending
											? "Захиалж байна..."
											: "Утсаар мэдэгдэл авах"}
									</Button>
									<Button
										type="button"
										variant="outline"
										class="w-full"
										disabled={verifiedMutation.isPending}
										onClick={startVerifiedEmailFlow}
									>
										И-мэйлээр авах
									</Button>
								</div>
							</div>
						</Match>

						<Match when>
							<div class="space-y-4">
								<div class="space-y-2">
									<p class="font-medium text-sm">Мэдэгдэл авах суваг</p>
									<div class="grid grid-cols-2 gap-2">
										<Button
											type="button"
											variant={channel() === "sms" ? "dark" : "outline"}
											aria-pressed={channel() === "sms"}
											disabled={requestMutation.isPending}
											onClick={() => selectChannel("sms")}
										>
											Утас
										</Button>
										<Button
											type="button"
											variant={channel() === "email" ? "dark" : "outline"}
											aria-pressed={channel() === "email"}
											disabled={requestMutation.isPending}
											onClick={() => selectChannel("email")}
										>
											И-мэйл
										</Button>
									</div>
								</div>

								<div class="space-y-2">
									<label class="font-medium text-sm" for="restock-contact">
										{channel() === "sms" ? "Утасны дугаар" : "И-мэйлийн хаяг"}
									</label>
									<input
										ref={(element) => {
											contactInput = element;
										}}
										id="restock-contact"
										name={channel() === "sms" ? "phone" : "email"}
										type={channel() === "sms" ? "tel" : "email"}
										inputMode={channel() === "sms" ? "numeric" : "email"}
										autocomplete={channel() === "sms" ? "tel" : "email"}
										value={contact()}
										onInput={(event) => setContact(event.currentTarget.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") requestConfirmation();
										}}
										aria-invalid={Boolean(errorMessage())}
										aria-describedby={
											errorMessage() ? "restock-error" : undefined
										}
										placeholder={
											channel() === "sms" ? "88889999" : "name@example.com"
										}
										class="h-12 w-full rounded-xl border border-border bg-background px-4 font-medium text-base shadow-soft-sm transition-[box-shadow,border-color] duration-200 ease-out focus-visible:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
									/>
								</div>
								<Show when={errorMessage()}>
									<p
										id="restock-error"
										class="rounded-xl bg-error px-4 py-3 text-error-foreground text-sm"
										role="alert"
									>
										{errorMessage()}
									</p>
								</Show>
								<Button
									type="button"
									class="w-full"
									size="lg"
									disabled={requestMutation.isPending}
									onClick={requestConfirmation}
								>
									{requestMutation.isPending
										? "Код илгээж байна..."
										: "Баталгаажуулах код авах"}
								</Button>
							</div>
						</Match>
					</Switch>
				</div>
			</SheetContent>
		</Sheet>
	);
}
