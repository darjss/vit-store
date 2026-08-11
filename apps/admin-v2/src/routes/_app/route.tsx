import { createFileRoute, redirect } from "@tanstack/solid-router";

import { AppShell } from "@/app/app-shell";
import { ensureAdminSession } from "@/lib/auth";

// Session boundary: every /_app page requires an admin session (auth.me).
export const Route = createFileRoute("/_app")({
	beforeLoad: async ({ context }) => {
		const session = await ensureAdminSession(context.queryClient);
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	component: AppShell,
	head: () => ({
		meta: [{ title: "vit-admin" }],
	}),
});
