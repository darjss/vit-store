import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { Button } from "../ui/button";

const UserData = () => {
	const { session, queryClient, trpc } = useRouteContext({ from: "/_dash" });
	const navigate = useNavigate();

	const logout = useMutation({
		...trpc.auth.logout.mutationOptions(),
		onSuccess: () => {
			queryClient.clear();
			navigate({ to: "/login" });
		},
	});

	return (
		<div className="space-y-3 p-2">
			<div className="truncate text-foreground/70 text-sm">
				Нэвтэрсэн хэрэглэгч
			</div>
			<div className="truncate font-medium text-foreground">
				{session?.user.username}
			</div>
			<Button
				onClick={() => logout.mutate()}
				className="w-full"
				variant="destructive"
			>
				{logout.isPending ? "Гарах..." : "Гарах"}
			</Button>
		</div>
	);
};

export default UserData;
