import { createFileRoute, redirect } from "@tanstack/react-router";
import { GoogleIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";

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
		<div className="flex min-h-screen flex-col justify-center bg-background py-12 text-foreground sm:px-6 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-md">
				<h2 className="mt-6 text-center font-bold text-3xl text-foreground tracking-tight">
					Welcome back
				</h2>
				<p className="mt-2 text-center text-foreground/70 text-sm">
					Please sign in to continue
				</p>
			</div>

			<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
				<Card className="px-4 py-8 shadow-shadow sm:rounded-base sm:px-10">
					<div className="space-y-6">
						<div>
							<a
								href={`${import.meta.env.VITE_SERVER_URL}/admin/login/google`}
								className="flex w-full items-center justify-center gap-3 rounded-base border-2 border-border bg-primary px-3 py-2 font-semibold text-primary-foreground text-sm shadow-shadow ring-offset-background hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							>
								<GoogleIcon />
								Sign in with Google
							</a>
						</div>

						<div className="mt-6">
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-border border-t" />
								</div>
								<div className="relative flex justify-center text-sm">
									<span className="bg-background px-2 text-foreground/70">
										Protected by Google
									</span>
								</div>
							</div>
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
}
