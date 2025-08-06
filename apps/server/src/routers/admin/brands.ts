import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { BrandsTable } from "@/db/schema";
import { adminProcedure, router } from "@/lib/trpc";

export const brands = router({
  getAllBrands: adminProcedure.query(async ({ ctx }) => {
    try {
      const brands = await ctx.db.select().from(BrandsTable);
    return brands;
    } catch (error) {
      console.error("Error fetching brands:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error fetching brands",
        cause: error,
      });
    }
  }),
  addBrand: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, "Brand name required"),
        logoUrl: z.url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.insert(BrandsTable).values({
          name: input.name,
          logoUrl: input.logoUrl,
        });
        return { message: "Successfully updated category" };
      } catch (err) {
        console.error("Error adding products:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add products",
          cause: err,
        });
      }
    }),

});
