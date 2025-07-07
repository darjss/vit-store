import { adminProcedure, router } from "@/lib/trpc";
import { z } from "zod";

export const analytics = router({
  getAverageOrderValue: adminProcedure.input(z.object({
    startDate: z.string(),
  })).query(async ({ ctx, input }) => {
    return "Analytics";
  }),
});