import { publicProcedure, router } from "@/lib/trpc";

export const adminRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
});
export type AdminRouter = typeof adminRouter;