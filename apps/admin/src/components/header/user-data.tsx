import { useMutation } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { useNavigate, useRouteContext } from "@tanstack/react-router";

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
    <div className="space-y-4 p-2">
      <div className="font-medium text-gray-900">{session?.user.username}</div>
      <Button
        onClick={() => logout.mutate()}
        className="w-full rounded bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
      >
        {logout.isPending ? "Logging out..." : "Logout"}
      </Button>
    </div>
  );
};
export default UserData;
