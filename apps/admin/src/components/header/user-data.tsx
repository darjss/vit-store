import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { Button } from "../ui/button";

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
		<div className="space-y-3 p-2">
			<div className="text-foreground/70 truncate text-sm">Нэвтэрсэн хэрэглэгч</div>
			<div className="text-foreground truncate font-medium">{session?.user.username}</div>
			<Button className="w-full" onClick={() => logout.mutate()} variant="destructive">
				{logout.isPending ? "Гарах..." : "Гарах"}
			</Button>
		</div>
	);
};

export default UserData;
