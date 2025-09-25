import { createFileRoute, redirect } from "@tanstack/react-router";
import { GoogleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	beforeLoad: async ({ context: ctx }) => {
		const session = await ctx.queryClient.ensureQueryData({
			...ctx.trpc.auth.me.queryOptions(),
			staleTime: 1000 * 60 * 15,
		});
		if (session) {
			throw redirect({ to: "/" });
		}
		return { session };
	},
});

function RouteComponent() {
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
							Login
						</h1>
						<p className="text-muted-foreground">
							Sign in to access your admin dashboard
						</p>
					</div>

					<Button asChild variant="default" size="lg" className="w-full gap-3">
						<a href={`${import.meta.env.VITE_SERVER_URL}/admin/login/google`}>
							<GoogleIcon />
							Sign in with Google
						</a>
					</Button>
				</div>
			</div>
		</div>
	);
}
