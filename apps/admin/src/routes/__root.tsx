import Loader from "@/components/loader";
import { Toaster } from "@/components/ui/sonner";
import type { trpc } from "@/utils/trpc";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../index.css";
import type { Session } from "../lib/types";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
export interface RouterAppContext {
  trpc: typeof trpc;
  queryClient: QueryClient;
  session?: Session;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "better-t-test",
      },
      {
        name: "description",
        content: "better-t-test is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  const isFetching = useRouterState({
    select: (s) => s.isLoading,
  });

  return (
    <>
      <HeadContent />

      <SidebarProvider>
        <SidebarInset>
          <div className="grid grid-rows-[auto_1fr] h-svh">
            {isFetching ? <Loader /> : <Outlet />}
          </div>
          <Toaster richColors />
        </SidebarInset>
      </SidebarProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
