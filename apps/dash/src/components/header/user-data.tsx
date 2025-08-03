import { Button } from "../ui/button";

const UserData = () => {
  const isPending = false;
  return (
    <div className="space-y-4 p-2">
      <div className="font-medium text-gray-900">{user?.username}</div>
      <Button className="w-full rounded bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100">
        {isPending ? "Logging out..." : "Logout"}
      </Button>
    </div>
  );
};
export default UserData;
