import {
	CheckCircleIcon as IconCheckCircle,
	BellIcon as IconNotification,
} from "@solar-icons/solid/bold";
import { useMutation, useQuery } from "@tanstack/solid-query";
import type { StoreRouter } from "@vit/api";
import type { inferRouterOutputs } from "@trpc/server";
import { createEffect, createSignal, Match, Show, Switch } from "solid-js";
import * as v from "valibot";

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
import { thrownErrorWireSchema } from "@/lib/error-wire";
import { queryClient } from "@/lib/query";
import { trpcErrorCode } from "@/lib/trpc-error-code";
import { api } from "@/lib/trpc";

type RestockChannel = "sms" | "email";
type SheetStage = "contact" | "confirmation" | "success";
type RestockIdentity = inferRouterOutputs<StoreRouter>["product"]["restockSubscriptionIdentity"];

function restockErrorMessage(
	error: v.InferOutput<typeof thrownErrorWireSchema>,
	stage: SheetStage,
) {
	switch (trpcErrorCode(error)) {
		case "TOO_MANY_REQUESTS":
			return "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.";
		case "NOT_FOUND":
			return "Бараа олдсонгүй. Хуудсаа шинэчлээд дахин оролдоно уу.";
		case "CONFLICT":
			return "Бараа дахин орсон байна. Хуудсаа шинэчлээд захиална уу.";
		case "FORBIDDEN":
			return "Та 5 барааны мэдэгдэл захиалсан байна. Нэг мэдэгдэл дууссаны дараа дахин оролдоно уу.";
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

function restockCustomerType(identity: RestockIdentity | undefined) {
	return identity ? ("verified_customer" as const) : ("guest" as const);
}

type ValidatedContact = { contact: string; valid: true } | { error: string; valid: false };

function validatedContact(channel: RestockChannel, value: string): ValidatedContact {
	const contact = channel === "sms" ? value.replaceAll(/\D/g, "") : value.trim().toLowerCase();
	const valid =
		channel === "sms" ? /^[6-9]\d{7}$/.test(contact) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
	if (valid) {
		return { contact, valid: true };
	}
	return {
		error:
			channel === "sms"
				? "8 оронтой утасны дугаар оруулна уу."
				: "И-мэйлийн хаягаа зөв оруулна уу.",
		valid: false,
	};
}

interface RestockNotifySheetProps {
	focusRestore: SheetFocusRestore;
	onOpenChange: (open: boolean) => void;
	open: boolean;
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
			enabled: props.open,
			queryFn: () => api.product.restockSubscriptionIdentity.query(),
			queryKey: ["restock-subscription-identity"],
			staleTime: 0,
		}),
		() => queryClient,
	);

	const customerType = () => restockCustomerType(identityQuery.data);
	const verifiedPhoneFlow = () => Boolean(identityQuery.data) && !guestFlow();

	const analyticsEvent = () => ({
		channel: channel(),
		customerType: customerType(),
		productId: props.productId,
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
				customerType: customerType(),
				productId: props.productId,
			});
		}
	});

	const verifiedMutation = useMutation(
		() => ({
			mutationFn: () => api.product.subscribeToRestock.mutate({ productId: props.productId }),
			onError: (error) => {
				const parsed = v.parse(thrownErrorWireSchema, error);
				trackRestockSubscriptionFailed({
					...analyticsEvent(),
					channel: "sms",
					errorCode: trpcErrorCode(parsed),
				});
				setErrorMessage(restockErrorMessage(parsed, "contact"));
			},
			onSuccess: (result) => {
				trackRestockSubscriptionCreated({
					...analyticsEvent(),
					alreadySubscribed: result.alreadySubscribed,
					channel: "sms",
				});
				setStage("success");
				setErrorMessage("");
			},
		}),
		() => queryClient,
	);

	const requestMutation = useMutation(
		() => ({
			mutationFn: () =>
				api.product.requestGuestRestockConfirmation.mutate({
					channel: channel(),
					contact: contact(),
					productId: props.productId,
				}),
			onError: (error) => {
				const parsed = v.parse(thrownErrorWireSchema, error);
				trackRestockSubscriptionFailed({
					...analyticsEvent(),
					errorCode: trpcErrorCode(parsed),
				});
				setErrorMessage(restockErrorMessage(parsed, "contact"));
			},
			onSuccess: (result) => {
				setChallengeId(result.challengeId);
				setCode("");
				setErrorMessage("");
				setStage("confirmation");
				trackRestockConfirmationRequested(analyticsEvent());
				queueMicrotask(() => codeInput?.focus());
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
			onError: (error) => {
				const parsed = v.parse(thrownErrorWireSchema, error);
				trackRestockSubscriptionFailed({
					...analyticsEvent(),
					errorCode: trpcErrorCode(parsed),
				});
				setErrorMessage(restockErrorMessage(parsed, "confirmation"));
				queueMicrotask(() => codeInput?.focus());
			},
			onSuccess: (result) => {
				trackRestockConfirmationCompleted(analyticsEvent());
				trackRestockSubscriptionCreated({
					...analyticsEvent(),
					alreadySubscribed: result.alreadySubscribed,
				});
				setErrorMessage("");
				setStage("success");
			},
		}),
		() => queryClient,
	);

	const selectChannel = (nextChannel: RestockChannel) => {
		setChannel(nextChannel);
		setContact("");
		setErrorMessage("");
		trackRestockChannelSelected({
			channel: nextChannel,
			customerType: customerType(),
			productId: props.productId,
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
		<Sheet onOpenChange={props.onOpenChange} open={props.open}>
			<SheetContent
				class="border-border bg-card flex max-h-[88vh] flex-col rounded-t-2xl border-t p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
				closeLabel="Мэдэгдлийн цонхыг хаах"
				focusRestore={props.focusRestore}
				position="bottom"
			>
				<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
					<SheetTitle class="font-display text-lg font-bold tracking-tight">
						Мэдэгдэл авах
					</SheetTitle>
					<SheetDescription class="text-muted-foreground text-sm">
						{restockDescription(props.productName)}
					</SheetDescription>
				</SheetHeader>

				<div class="space-y-4 px-5 py-5">
					<Switch>
						<Match when={identityQuery.isPending || identityQuery.isFetching}>
							<div aria-busy="true" class="space-y-3">
								<span class="sr-only">Уншиж байна</span>
								<div class="bg-muted h-5 w-2/3 animate-pulse rounded-lg" />
								<div class="bg-muted h-12 w-full animate-pulse rounded-xl" />
							</div>
						</Match>

						<Match when={identityQuery.isError}>
							<div class="space-y-4">
								<p class="text-sm" role="alert">
									Мэдэгдлийн тохиргоог уншиж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.
								</p>
								<Button class="w-full" onClick={() => identityQuery.refetch()} type="button">
									Дахин оролдох
								</Button>
							</div>
						</Match>

						<Match when={stage() === "success"}>
							<div aria-live="polite" class="space-y-5 text-center">
								<div class="bg-success text-success-foreground mx-auto flex size-12 items-center justify-center rounded-full">
									<IconCheckCircle aria-hidden="true" class="size-6" />
								</div>
								<div class="space-y-1">
									<p class="text-base font-semibold">Мэдэгдэл бэлэн боллоо</p>
									<p class="text-muted-foreground text-sm">Бараа дахин ормогц танд мэдэгдэнэ.</p>
								</div>
								<Button class="w-full" onClick={() => props.onOpenChange(false)} type="button">
									Хаах
								</Button>
							</div>
						</Match>

						<Match when={stage() === "confirmation"}>
							<div class="space-y-4">
								<div class="space-y-1">
									<p class="text-sm font-semibold">Кодоо оруулна уу</p>
									<p class="text-muted-foreground text-sm">
										{channel() === "sms" ? "Утас" : "И-мэйл"} рүү илгээсэн 6 оронтой код 10 минут
										хүчинтэй.
									</p>
								</div>
								<div class="space-y-2">
									<label class="text-sm font-medium" for="restock-code">
										Баталгаажуулах код
									</label>
									<input
										aria-describedby={errorMessage() ? "restock-error" : undefined}
										aria-invalid={Boolean(errorMessage())}
										autocomplete="one-time-code"
										class="border-border bg-background shadow-soft-sm focus-visible:shadow-soft focus-visible:ring-ring aria-invalid:border-destructive h-12 w-full rounded-xl border px-4 text-center text-base font-semibold tracking-[0.25em] transition-[box-shadow,border-color] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
										id="restock-code"
										inputMode="numeric"
										maxLength={6}
										name="restock-code"
										onInput={(event) => setCode(event.currentTarget.value.replaceAll(/\D/g, ""))}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												submitCode();
											}
										}}
										placeholder="123456"
										ref={(element) => {
											codeInput = element;
										}}
										type="text"
										value={code()}
									/>
								</div>
								<Show when={errorMessage()}>
									<p
										class="bg-error text-error-foreground rounded-xl px-4 py-3 text-sm"
										id="restock-error"
										role="alert"
									>
										{errorMessage()}
									</p>
								</Show>
								<div class="space-y-2">
									<Button
										class="w-full"
										disabled={confirmMutation.isPending}
										onClick={submitCode}
										size="lg"
										type="button"
									>
										{confirmMutation.isPending ? "Баталгаажуулж байна..." : "Код баталгаажуулах"}
									</Button>
									<Button
										class="w-full"
										disabled={confirmMutation.isPending}
										onClick={startNewConfirmation}
										type="button"
										variant="outline"
									>
										Шинэ код авах
									</Button>
								</div>
							</div>
						</Match>

						<Match when={verifiedPhoneFlow()}>
							<div class="space-y-4">
								<p class="text-sm">
									Мэдэгдлийг баталгаажсан {identityQuery.data?.maskedPhone} дугаарт SMS-ээр илгээнэ.
								</p>
								<Show when={errorMessage()}>
									<p
										class="bg-error text-error-foreground rounded-xl px-4 py-3 text-sm"
										id="restock-error"
										role="alert"
									>
										{errorMessage()}
									</p>
								</Show>
								<div class="space-y-2">
									<Button
										class="w-full"
										disabled={verifiedMutation.isPending}
										onClick={() => verifiedMutation.mutate()}
										size="lg"
										type="button"
									>
										<IconNotification aria-hidden="true" />
										{verifiedMutation.isPending ? "Захиалж байна..." : "Утсаар мэдэгдэл авах"}
									</Button>
									<Button
										class="w-full"
										disabled={verifiedMutation.isPending}
										onClick={startVerifiedEmailFlow}
										type="button"
										variant="outline"
									>
										И-мэйлээр авах
									</Button>
								</div>
							</div>
						</Match>

						<Match when>
							<div class="space-y-4">
								<div class="space-y-2">
									<p class="text-sm font-medium">Мэдэгдэл авах суваг</p>
									<div class="grid grid-cols-2 gap-2">
										<Button
											aria-pressed={channel() === "sms"}
											disabled={requestMutation.isPending}
											onClick={() => selectChannel("sms")}
											type="button"
											variant={channel() === "sms" ? "dark" : "outline"}
										>
											Утас
										</Button>
										<Button
											aria-pressed={channel() === "email"}
											disabled={requestMutation.isPending}
											onClick={() => selectChannel("email")}
											type="button"
											variant={channel() === "email" ? "dark" : "outline"}
										>
											И-мэйл
										</Button>
									</div>
								</div>

								<div class="space-y-2">
									<label class="text-sm font-medium" for="restock-contact">
										{channel() === "sms" ? "Утасны дугаар" : "И-мэйлийн хаяг"}
									</label>
									<input
										aria-describedby={errorMessage() ? "restock-error" : undefined}
										aria-invalid={Boolean(errorMessage())}
										autocomplete={channel() === "sms" ? "tel" : "email"}
										class="border-border bg-background shadow-soft-sm focus-visible:shadow-soft focus-visible:ring-ring aria-invalid:border-destructive h-12 w-full rounded-xl border px-4 text-base font-medium transition-[box-shadow,border-color] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
										id="restock-contact"
										inputMode={channel() === "sms" ? "numeric" : "email"}
										name={channel() === "sms" ? "phone" : "email"}
										onInput={(event) => setContact(event.currentTarget.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												requestConfirmation();
											}
										}}
										placeholder={channel() === "sms" ? "88889999" : "name@example.com"}
										ref={(element) => {
											contactInput = element;
										}}
										type={channel() === "sms" ? "tel" : "email"}
										value={contact()}
									/>
								</div>
								<Show when={errorMessage()}>
									<p
										class="bg-error text-error-foreground rounded-xl px-4 py-3 text-sm"
										id="restock-error"
										role="alert"
									>
										{errorMessage()}
									</p>
								</Show>
								<Button
									class="w-full"
									disabled={requestMutation.isPending}
									onClick={requestConfirmation}
									size="lg"
									type="button"
								>
									{requestMutation.isPending ? "Код илгээж байна..." : "Баталгаажуулах код авах"}
								</Button>
							</div>
						</Match>
					</Switch>
				</div>
			</SheetContent>
		</Sheet>
	);
}
