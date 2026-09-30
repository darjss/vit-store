import { TRPCClientError } from "@trpc/client";
import { createFileRoute, redirect, useSearch } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { object, optional, string } from "valibot";
import { GoogleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context: ctx }) => {
		// Logged-out visitors get a 401 from auth.me; ensureQueryData rejects on
		// it and would otherwise blow up the route instead of rendering the form.
		let session = null;
		try {
			session = await ctx.queryClient.ensureQueryData({
				...ctx.trpc.auth.me.queryOptions(),
				gcTime: 1000 * 60 * 30,
				retry: false,
				staleTime: 1000 * 60 * 15,
			});
		} catch (error) {
			if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
				session = null;
			} else {
				throw error;
			}
		}
		if (session) {
			throw redirect({ to: "/" });
		}
		return { session };
	},
	component: RouteComponent,
	validateSearch: object({
		message: optional(string()),
	}),
});

function RouteComponent() {
	const { message } = useSearch({ from: "/login" });

	return (
		<div className="bg-background min-h-screen w-full">
			<div
				className="absolute inset-0 z-0"
				style={{
					backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px),
                radial-gradient(circle at center, var(--primary) 0%, transparent 70%)
            `,
					backgroundSize: "40px 40px, 40px 40px, 100% 100%",
					opacity: 0.3,
				}}
			/>

			<div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
				<div className="w-full max-w-sm">
					<div className="mb-12 text-center">
						<h1 className="font-head text-foreground mb-2 text-4xl font-bold">Нэвтрэх</h1>
						<p className="text-muted-foreground">Админ хэсэгт нэвтрэхийн тулд нэвтэрнэ үү</p>
					</div>

					{message && (
						<div className="bg-destructive/10 text-destructive mb-6 flex items-center gap-2 rounded-md p-3 text-sm">
							<AlertCircle className="h-4 w-4 shrink-0" />
							<p>{message}</p>
						</div>
					)}

					<Button asChild className="w-full gap-3" size="lg" variant="default">
						<a href={`${import.meta.env.VITE_SERVER_URL}/admin/login/google`}>
							<GoogleIcon />
							Google-ээр нэвтрэх
						</a>
					</Button>
				</div>
			</div>
		</div>
	);
}
