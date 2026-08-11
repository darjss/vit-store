import { createFileRoute, redirect, useSearch } from "@tanstack/solid-router";
import { Show } from "solid-js";
import * as v from "valibot";

import { GoogleIcon } from "@/app/google-icon";
import { ensureAdminSession } from "@/lib/auth";
import { Button, InlineAlert } from "@vit/ui";

export const Route = createFileRoute("/login")({
	component: LoginPage,
	beforeLoad: async ({ context }) => {
		const session = await ensureAdminSession(context.queryClient);
		if (session) {
			throw redirect({ to: "/" });
		}
		return { session };
	},
	validateSearch: v.object({
		message: v.optional(v.string()),
	}),
	head: () => ({
		meta: [{ title: "Нэвтрэх · vit-admin" }],
	}),
});

function LoginPage() {
	const search = useSearch({ from: "/login" });
	return (
		<div class="flex min-h-dvh items-center justify-center px-4">
			<div class="w-full max-w-sm space-y-8">
				<div class="text-center">
					<span
						class="mx-auto mb-4 grid size-12 place-items-center rounded-[12px] bg-ink font-extrabold text-butter text-sm"
						aria-hidden="true"
					>
						AV
					</span>
					<h1 class="font-extrabold text-3xl tracking-tight">Нэвтрэх</h1>
					<p class="mt-1.5 text-ink-2 text-sm">
						Админ хэсэгт нэвтрэхдээ Google бүртгэлээ ашиглана уу.
					</p>
				</div>

				<Show when={search().message}>
					{(message) => <InlineAlert tone="warning">{message()}</InlineAlert>}
				</Show>

				<Button
					as="a"
					variant="primary"
					size="lg"
					class="w-full"
					href={`${import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000"}/admin/login/google`}
				>
					<GoogleIcon />
					Google-ээр нэвтрэх
				</Button>
			</div>
		</div>
	);
}
