import { navigate } from "astro:transitions/client";
import { useMutation } from "@tanstack/solid-query";
import { createEffect, Show } from "solid-js";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconErrorWarning from "~icons/ri/error-warning-line";
import IconLoader from "~icons/ri/loader-4-line";

interface QpayButtonProps {
	paymentNumber: string;
}

const QpayButton = (props: QpayButtonProps) => {
	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.createQr.mutate({
					paymentNumber: props.paymentNumber,
				});
			},
			onSuccess: (redirectUrl) => {
				navigate(redirectUrl);
			},
		}),
		() => queryClient,
	);

	// Auto-trigger on mount
	createEffect(() => {
		if (!mutation.isSuccess && !mutation.isPending && !mutation.isError) {
			mutation.mutate();
		}
	});

	return (
		<div class="flex flex-col items-center gap-4">
			<Show when={mutation.isPending}>
				<div class="flex flex-col items-center gap-3 py-6">
					<IconLoader class="h-10 w-10 animate-spin text-primary" />
					<div class="text-center">
						<p class="font-bold text-sm sm:text-base">
							QPay холболт үүсгэж байна...
						</p>
						<p class="mt-1 text-muted-foreground text-xs sm:text-sm">
							Та хэдхэн секундын дараа төлбөрийн хуудас руу шилжих болно
						</p>
					</div>
				</div>
			</Show>

			<Show when={mutation.isError}>
				<div class="flex flex-col items-center gap-3 py-6">
					<IconErrorWarning class="h-10 w-10 text-destructive" />
					<div class="text-center">
						<p class="font-bold text-destructive text-sm sm:text-base">
							Алдаа гарлаа
						</p>
						<p class="mt-1 text-muted-foreground text-xs sm:text-sm">
							{mutation.error?.message ?? "Төлбөр үүсгэхэд алдаа гарлаа"}
						</p>
					</div>
					<button
						type="button"
						onClick={() => mutation.mutate()}
						class="border-3 border-border bg-primary px-4 py-2 font-bold text-sm uppercase shadow-[3px_3px_0_0_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)]"
					>
						Дахин оролдох
					</button>
				</div>
			</Show>
		</div>
	);
};

export default QpayButton;
