import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

const UserData = () => {
	const { queryClient, session, trpc } = useRouteContext({ from: "/_dash" });
	const navigate = useNavigate();

	const logout = useMutation({
		...trpc.auth.logout.mutationOptions(),
		onSuccess: () => {
			queryClient.clear();
			navigate({ to: "/login" });
		},
	});

	return (
		<div className="flex items-center gap-2 px-2 py-1">
			<span className="text-muted-foreground flex-1 truncate text-sm">
				{session?.user.username}
			</span>
			<button
				className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-1.5 px-2 text-sm"
				onClick={() => logout.mutate()}
				type="button"
			>
				<LogOut className="size-4" />
				{logout.isPending ? "Гарч байна" : "Гарах"}
			</button>
		</div>
	);
};

export default UserData;
