import { createFileRoute, redirect, useSearch } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import * as v from "valibot";
import { GoogleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	beforeLoad: async ({ context: ctx }) => {
		const session = await ctx.queryClient.ensureQueryData({
			...ctx.trpc.auth.me.queryOptions(),
			staleTime: 1000 * 60 * 15,
			gcTime: 1000 * 60 * 30,
			retry: false,
		});
		if (session) {
			throw redirect({ to: "/" });
		}
		return { session };
	},
	validateSearch: v.object({
		message: v.optional(v.string()),
	}),
});

function RouteComponent() {
	const { message } = useSearch({ from: "/login" });

	return (
		<div className="min-h-screen w-full bg-background">
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
						<h1 className="mb-2 font-bold font-head text-4xl text-foreground">
							Нэвтрэх
						</h1>
						<p className="text-muted-foreground">
							Админ хэсэгт нэвтрэхийн тулд нэвтэрнэ үү
						</p>
					</div>

					{message && (
						<div className="mb-6 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
							<AlertCircle className="h-4 w-4 shrink-0" />
							<p>{message}</p>
						</div>
					)}

					<Button asChild variant="default" size="lg" className="w-full gap-3">
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
