import { createTRPCReact } from "@trpc/tanstack-react-query";
import type { AdminRouter } from "../../../server/src/routers/admin/index";

export const trpc = createTRPCReact<AdminRouter>();

// Re-export for convenience
export const { TRPCProvider, useTRPCClient } = trpc;
export const useTRPC = () => trpc;

