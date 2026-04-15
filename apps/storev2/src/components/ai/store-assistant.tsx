import { useMutation } from "@tanstack/solid-query";
import type {
	StoreAssistantDisplayType,
	StoreAssistantMessageInput,
	StoreAssistantResponse,
} from "@vit/api";
import type { Component } from "solid-js";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	trackAssistantMessageSent,
	trackAssistantOpened,
	trackAssistantStarterPromptClicked,
} from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import IconArrowUp from "~icons/ri/arrow-up-line";
import IconClose from "~icons/ri/close-line";
import IconRobot from "~icons/ri/robot-2-line";
import IconSparkling from "~icons/ri/sparkling-line";
import AssistantProductDisplay from "./assistant-product-display";

type AssistantMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	displayType: StoreAssistantDisplayType;
	productIds: number[];
};

const STORAGE_KEY = "store-ai-assistant-session";

const starterPrompts = [
	"Надад өдрийн эрч хүч дэмжих бүтээгдэхүүн санал болго",
	"Дархлаанд тохирох нэг сайн бүтээгдэхүүн сонгоод өг",
	"Нойр болон тайвшралд тохирох сонголтууд харуул",
	"Одоогийн хамгийн үнэ цэнтэй омега эсвэл магнийн сонголт юу вэ?",
];

const suggestionChips = [
	"Надад яг нэг бүтээгдэхүүн санал болго",
	"2-3 сонголт харьцуулж харуул",
	"Үнэ боломжийн сонголт хайж байна",
	"Эмзэг ходоодонд зөөлөн бүтээгдэхүүн байна уу?",
];

const welcomeMessage: AssistantMessage = {
	id: "assistant-welcome",
	role: "assistant",
	content:
		"Танд тохирох витаминыг хурдан олоход тусалъя. Ямар хэрэгцээнд авах гэж байгаагаа хэлбэл би нэг сайн сонголт эсвэл хэдэн хувилбар санал болгоно.",
	displayType: "none",
	productIds: [],
};

function createMessageId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}

	return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeMessages(messages: AssistantMessage[]) {
	return messages.map((message) => ({
		id: message.id,
		role: message.role,
		content: message.content,
		displayType: message.displayType,
		productIds: message.productIds,
	}));
}

function toRequestMessages(
	messages: AssistantMessage[],
): StoreAssistantMessageInput[] {
	return messages.map((message) => ({
		role: message.role,
		content: message.content,
	}));
}

const StoreAssistant: Component = () => {
	const [isOpen, setIsOpen] = createSignal(false);
	const [input, setInput] = createSignal("");
	const [messages, setMessages] = createSignal<AssistantMessage[]>([
		welcomeMessage,
	]);

	let conversationRef: HTMLDivElement | undefined;
	let textareaRef: HTMLTextAreaElement | undefined;

	const mutation = useMutation(
		() => ({
			mutationFn: async (
				requestMessages: StoreAssistantMessageInput[],
			): Promise<StoreAssistantResponse> => {
				return await api.aiAssistant.chat.mutate({
					messages: requestMessages,
					locale:
						typeof document !== "undefined"
							? document.documentElement.lang || "mn"
							: "mn",
					pageContext:
						typeof window !== "undefined"
							? {
									path: window.location.pathname,
								}
							: undefined,
				});
			},
		}),
		() => queryClient,
	);

	const hasRealConversation = createMemo(
		() => messages().filter((message) => message.role === "user").length > 0,
	);

	const submitMessage = async (content: string) => {
		const trimmed = content.trim();
		if (!trimmed || mutation.isPending) {
			return;
		}

		trackAssistantMessageSent(trimmed);

		const userMessage: AssistantMessage = {
			id: createMessageId(),
			role: "user",
			content: trimmed,
			displayType: "none",
			productIds: [],
		};

		const currentMessages = messages();
		const requestMessages = [
			...toRequestMessages(currentMessages),
			{
				role: "user" as const,
				content: trimmed,
			},
		];

		setInput("");
		setMessages((current) => [...current, userMessage]);

		try {
			const response = await mutation.mutateAsync(requestMessages);

			setMessages((current) => [
				...current,
				{
					id: createMessageId(),
					role: "assistant",
					content: response.answer,
					displayType: response.displayType,
					productIds: response.productIds,
				},
			]);
		} catch {
			setMessages((current) => [
				...current,
				{
					id: createMessageId(),
					role: "assistant",
					content:
						"Уучлаарай, яг одоо туслахад алдаа гарлаа. Түр хүлээгээд дахин асуугаарай.",
					displayType: "none",
					productIds: [],
				},
			]);
		}
	};

	const handleStarterPrompt = (prompt: string) => {
		trackAssistantStarterPromptClicked(prompt);
		void submitMessage(prompt);
	};

	createEffect(() => {
		if (typeof sessionStorage === "undefined") {
			return;
		}

		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(serializeMessages(messages())),
		);
	});

	createEffect(() => {
		if (!isOpen()) {
			return;
		}

		trackAssistantOpened();
		queueMicrotask(() => {
			textareaRef?.focus();
		});
	});

	createEffect(() => {
		messages();
		mutation.isPending;
		queueMicrotask(() => {
			conversationRef?.scrollTo({
				top: conversationRef.scrollHeight,
				behavior: "smooth",
			});
		});
	});

	onMount(() => {
		if (typeof sessionStorage !== "undefined") {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				try {
					const parsed = JSON.parse(stored) as AssistantMessage[];
					if (Array.isArray(parsed) && parsed.length > 0) {
						setMessages(parsed);
					}
				} catch {
					sessionStorage.removeItem(STORAGE_KEY);
				}
			}
		}

		const handleNavigation = () => {
			setIsOpen(false);
		};

		document.addEventListener("astro:before-preparation", handleNavigation);
		onCleanup(() => {
			document.removeEventListener(
				"astro:before-preparation",
				handleNavigation,
			);
		});
	});

	return (
		<>
			<button
				type="button"
				class="fixed right-4 bottom-24 z-[70] flex h-15 w-15 items-center justify-center rounded-full border-3 border-black bg-primary shadow-[6px_6px_0_0_#000] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0_0_#000] sm:right-6 sm:bottom-6 sm:h-18 sm:w-18"
				aria-label="AI shopping assistant"
				onClick={() => setIsOpen(true)}
			>
				<IconRobot class="h-7 w-7 text-black sm:h-8 sm:w-8" />
			</button>

			<Show when={isOpen()}>
				<div class="fixed inset-0 z-[80]">
					<button
						type="button"
						class="absolute inset-0 bg-black/70"
						aria-label="Close assistant"
						onClick={() => setIsOpen(false)}
					/>
					<div
						class="relative flex h-full flex-col bg-[#F8F3E8]"
						role="dialog"
						aria-modal="true"
						aria-label="AI shopping assistant"
					>
						<div class="border-black border-b-3 bg-[#FFE27A] px-4 py-4 sm:px-6">
							<div class="space-y-3">
								<div class="flex items-start justify-between gap-4">
									<div class="flex items-start gap-3">
										<div class="flex h-12 w-12 items-center justify-center rounded-sm border-3 border-black bg-white shadow-[4px_4px_0_0_#000]">
											<IconSparkling class="h-6 w-6" />
										</div>
										<div>
											<h2 class="font-black text-xl uppercase tracking-tight sm:text-2xl">
												Vit Assistant
											</h2>
											<p class="mt-1 max-w-2xl text-black/70 text-sm sm:text-base">
												Хэрэгцээнд тань тохирох бүтээгдэхүүнийг санал болгож,
												харьцуулж, шууд сагсанд нэмэхэд тусална.
											</p>
										</div>
									</div>
									<button
										type="button"
										class="flex h-11 w-11 items-center justify-center rounded-sm border-3 border-black bg-white shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000]"
										onClick={() => setIsOpen(false)}
										aria-label="Close assistant"
									>
										<IconClose class="h-5 w-5" />
									</button>
								</div>
							</div>
						</div>

						<div
							ref={conversationRef}
							class="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
						>
							<div class="mx-auto flex max-w-5xl flex-col gap-4">
								<Show when={!hasRealConversation()}>
									<div class="grid gap-3 sm:grid-cols-2">
										<For each={starterPrompts}>
											{(prompt) => (
												<button
													type="button"
													class="border-3 border-black bg-white px-4 py-4 text-left font-black text-sm leading-snug shadow-[5px_5px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-primary hover:shadow-[3px_3px_0_0_#000]"
													onClick={() => handleStarterPrompt(prompt)}
												>
													{prompt}
												</button>
											)}
										</For>
									</div>
								</Show>

								<For each={messages()}>
									{(message, index) => {
										const isAssistant = () => message.role === "assistant";
										const showSuggestions = () =>
											isAssistant() &&
											index() === messages().length - 1 &&
											!mutation.isPending;

										return (
											<div
												class={cn(
													"flex",
													isAssistant() ? "justify-start" : "justify-end",
												)}
											>
												<div class="w-full max-w-4xl">
													<div
														class={cn(
															"w-full rounded-sm border-3 border-black px-4 py-4 shadow-[6px_6px_0_0_#000] sm:px-5",
															isAssistant()
																? "bg-white"
																: "ml-auto max-w-2xl bg-[#111111] text-white",
														)}
													>
														<p class="whitespace-pre-wrap text-sm leading-7 sm:text-[15px]">
															{message.content}
														</p>
													</div>

													<Show
														when={
															isAssistant() && message.displayType !== "none"
														}
													>
														<AssistantProductDisplay
															displayType={
																message.displayType as Exclude<
																	StoreAssistantDisplayType,
																	"none"
																>
															}
															productIds={message.productIds}
														/>
													</Show>

													<Show when={showSuggestions()}>
														<div class="mt-4 flex flex-wrap gap-2">
															<For each={suggestionChips}>
																{(chip) => (
																	<button
																		type="button"
																		class="rounded-sm border-2 border-black bg-white px-3 py-2 font-black text-[11px] uppercase tracking-wide shadow-[3px_3px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-primary hover:shadow-[1px_1px_0_0_#000]"
																		onClick={() => void submitMessage(chip)}
																	>
																		{chip}
																	</button>
																)}
															</For>
														</div>
													</Show>
												</div>
											</div>
										);
									}}
								</For>

								<Show when={mutation.isPending}>
									<div class="flex justify-start">
										<div class="rounded-sm border-3 border-black bg-white px-4 py-4 shadow-[6px_6px_0_0_#000]">
											<div class="flex items-center gap-2 font-black text-sm uppercase">
												<span class="h-2.5 w-2.5 animate-bounce rounded-full bg-black" />
												<span
													class="h-2.5 w-2.5 animate-bounce rounded-full bg-black"
													style={{ "animation-delay": "120ms" }}
												/>
												<span
													class="h-2.5 w-2.5 animate-bounce rounded-full bg-black"
													style={{ "animation-delay": "240ms" }}
												/>
											</div>
										</div>
									</div>
								</Show>
							</div>
						</div>

						<div class="border-black border-t-3 bg-white px-4 py-4 sm:px-6">
							<div class="mx-auto max-w-5xl">
								<form
									class="space-y-3"
									onSubmit={(event) => {
										event.preventDefault();
										void submitMessage(input());
									}}
								>
									<div class="overflow-hidden rounded-sm border-3 border-black bg-[#F8F3E8] shadow-[6px_6px_0_0_#000]">
										<textarea
											ref={textareaRef}
											value={input()}
											rows={3}
											placeholder="Жишээ нь: 30-аад насны эмэгтэйд өдөр тутмын эрч хүч дэмжих нэг сайн бүтээгдэхүүн санал болго"
											class="min-h-24 w-full resize-none border-0 bg-transparent px-4 py-4 text-sm outline-none placeholder:text-black/40 sm:text-base"
											onInput={(event) => setInput(event.currentTarget.value)}
										/>
										<div class="flex items-center justify-between border-black border-t-3 px-3 py-3">
											<p class="font-bold text-black/45 text-xs uppercase tracking-wide">
												Шаардлагатай бол би эхлээд 1-2 тодруулах асуулт асууна.
											</p>
											<button
												type="submit"
												class="flex h-12 w-12 items-center justify-center rounded-sm border-3 border-black bg-primary shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:shadow-none"
												disabled={
													mutation.isPending || input().trim().length === 0
												}
											>
												<IconArrowUp class="h-5 w-5" />
											</button>
										</div>
									</div>
								</form>
							</div>
						</div>
					</div>
				</div>
			</Show>
		</>
	);
};

export default StoreAssistant;
