import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import Loader from "@/components/loader";
import { useTRPC } from "@/utils/trpc";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dash/")({
  component: HomeComponent,
});

function HomeComponent() {
  const trpc = useTRPC();
  const { data: session } = useSuspenseQuery(trpc.auth.me.queryOptions());
  console.log("session", session);

  return (
    <div>
      <p>1</p>
      <Button onClick={() => {
        console.log("click");
      }}>
        click
      </Button>
      {/* <Loader /> */}
    </div>
  );
}
