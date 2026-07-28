import { botProcedure, router } from "~/lib/trpc";

/** Add serialized-Result bot procedures here without changing legacy outputs. */
export const botV2Router = router({
	healthCheck: botProcedure.query(() => "OK"),
});
