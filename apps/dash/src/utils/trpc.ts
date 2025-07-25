import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AdminRouter } from "../../../server/src/routers/admin/index";

export const { TRPCProvider, useTRPC, useTRPCClient } =
	createTRPCContext<AdminRouter>();
