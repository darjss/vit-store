import { TRPCError } from "@trpc/server";
import { brandQueries } from "@vit/api/queries";
import { addBrandSchema } from "@vit/shared";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

export const brands = router({
	getAllBrands: adminProcedure.query(async () => {
		try {
			const brands = await brandQueries.admin.getAllBrands();
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
	addBrand: adminProcedure.input(addBrandSchema).mutation(async ({ input }) => {
		try {
			const { name, logoUrl } = input;
			await brandQueries.admin.createBrand({ name, logoUrl });
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
		.mutation(async ({ input }) => {
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
		.mutation(async ({ input }) => {
			try {
				await brandQueries.admin.deleteBrand(input.id);
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
