import { TRPCError } from "@trpc/server";
import { brandQueries } from "@vit/api/queries";
import { addBrandSchema } from "@vit/shared";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

export const brands = router({
	getAllBrands: adminProcedure.query(async ({ ctx }) => {
		try {
			const brands = await brandQueries.admin.getAllBrands();
			ctx.log.info("getAllBrands", { count: brands.length });
			return brands;
		} catch (error) {
			ctx.log.error("getAllBrands", error);
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
				await brandQueries.admin.createBrand({ name, logoUrl });
				return { message: "Successfully updated category" };
			} catch (err) {
				ctx.log.error("addBrand", err);
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
				await brandQueries.admin.updateBrand(id, { name, logoUrl });
			} catch (err) {
				ctx.log.error("updateBrand", err);
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
				await brandQueries.admin.deleteBrand(input.id);
			} catch (err) {
				ctx.log.error("deleteBrand", err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete brand",
					cause: err,
				});
			}
		}),
});
