import { publicProcedure, router } from "~/lib/trpc";

/** Add serialized-Result procedures here without changing legacy outputs. */
export const adminV2Router = router({
	healthCheck: publicProcedure.query(() => "OK"),
});
