import { TRPCError } from "@trpc/server";
import { addBrandSchema, type addBrandType } from "@vit/shared";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";
import { BrandsTable } from "../../db/schema";
import { adminProcedure, router } from "../../lib/trpc";

export const brands = router({
	getAllBrands: adminProcedure.query(async ({ ctx }) => {
		try {
			const brands = await ctx.db
				.select()
				.from(BrandsTable)
				.where(isNull(BrandsTable.deletedAt));
			console.log("brands", brands);
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
		.input(addBrandSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const { name, logoUrl } = input;
				await ctx.db.insert(BrandsTable).values({
					name,
					logoUrl,
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
	updateBrand: adminProcedure
		.input(addBrandSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const id = input.id;
				if (!id) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to add products",
					});
				}
				const { name, logoUrl } = input;
				await ctx.db
					.update(BrandsTable)
					.set({
						name,
						logoUrl,
					})
					.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)));
			} catch (err) {
				console.error("Error adding products:", err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add products",
					cause: err,
				});
			}
		}),
	deleteBrand: adminProcedure
		.input(v.object({ id: v.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db
					.update(BrandsTable)
					.set({ deletedAt: new Date() })
					.where(
						and(eq(BrandsTable.id, input.id), isNull(BrandsTable.deletedAt)),
					);
			} catch (err) {
				console.error("Error deleting brand:", err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete brand",
					cause: err,
				});
			}
		}),
});
