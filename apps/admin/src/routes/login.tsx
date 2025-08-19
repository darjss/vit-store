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
		<div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-md">
				<h2 className="mt-6 text-center font-bold text-3xl text-gray-900 tracking-tight">
					Welcome back
				</h2>
				<p className="mt-2 text-center text-gray-600 text-sm">
					Please sign in to continue
				</p>
			</div>

			<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
				<Card className="px-4 py-8 shadow sm:rounded-lg sm:px-10">
					<div className="space-y-6">
						<div>
							<a
								href={`${import.meta.env.VITE_SERVER_URL}/admin/login/google`}
								className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-3 py-2 font-semibold text-gray-900 text-sm shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:outline-offset-0"
							>
								<GoogleIcon />
								Sign in with Google
							</a>
						</div>

						<div className="mt-6">
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-gray-300 border-t" />
								</div>
								<div className="relative flex justify-center text-sm">
									<span className="bg-white px-2 text-gray-500">
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
