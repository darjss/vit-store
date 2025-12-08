import { TRPCError } from "@trpc/server";
import { addBrandSchema } from "@vit/shared";
import { createQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

export const brands = router({
	getAllBrands: adminProcedure.query(async ({ ctx }) => {
		try {
			const q = createQueries(ctx.db).brands.admin;
			const brands = await q.getAllBrands();
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
				const q = createQueries(ctx.db).brands.admin;
				const { name, logoUrl } = input;
				await q.createBrand({ name, logoUrl });
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
				const q = createQueries(ctx.db).brands.admin;
				const id = input.id;
				if (!id) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to add products",
					});
				}
				const { name, logoUrl } = input;
				await q.updateBrand(id, { name, logoUrl });
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
				const q = createQueries(ctx.db).brands.admin;
				await q.deleteBrand(input.id);
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
