// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
// import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import Loader from "@/components/loader";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../index.css?url";
import type { RouterAppContext } from "../router";

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "My App",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const isFetching = useRouterState({ select: (s) => s.isLoading });

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="grid h-svh w-full grid-rows-[auto_1fr]">
          {isFetching ? <Loader /> : children}
        </div>
        <Toaster />
        {/* <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" /> */}
        <Scripts />
      </body>
    </html>
  );
}
