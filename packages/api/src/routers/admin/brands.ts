import { TRPCError } from "@trpc/server";
import { brandQueries } from "@vit/api/queries";
import {
    addBrandSchema,
    BRANDS_TAG,
    brandTag,
    CATALOG_TAG,
    HOME_TAG,
    PRODUCTS_TAG,
    SITE_SHELL_TAG,
} from "@vit/shared";
import * as v from "valibot";
import { purgeTags } from "~/lib/cache/workers-cache";
import { scheduleProductSearchRebuild } from "~/lib/product-search/client";
import { slugify } from "~/lib/utils";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
export function buildBrandsRouter<P extends typeof baseProcedure>(proc: P) {
    return router({
    getAllBrands: proc.query(async ({ ctx }) => {
        try {
            const brands = await brandQueries.admin.getAllBrands();
            ctx.log.info("getAllBrands", { count: brands.length });
            return brands;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getAllBrands"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Error fetching brands",
                cause: error,
            });
        }
    }),
    addBrand: proc
        .input(addBrandSchema)
        .mutation(async ({ ctx, input }) => {
        try {
            const slug = input.slug || slugify(input.name);
            const { id: _id, ...data } = input;
            await brandQueries.admin.createBrand({
                ...data,
                slug,
            });
            await purgeTags(ctx, [
                BRANDS_TAG,
                PRODUCTS_TAG,
                CATALOG_TAG,
                HOME_TAG,
                SITE_SHELL_TAG,
            ]);
            scheduleProductSearchRebuild(ctx, "brand_updated");
            return { message: "Successfully updated category" };
        }
        catch (err) {
            ctx.log.error(err instanceof Error ? err : new Error(String(err)), {
                event: "addBrand"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to add products",
                cause: err,
            });
        }
    }),
    updateBrand: proc
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
            const slug = input.slug || slugify(input.name);
            const { id: _id, ...data } = input;
            await brandQueries.admin.updateBrand(id, {
                ...data,
                slug,
            });
            await purgeTags(ctx, [
                BRANDS_TAG,
                brandTag(id),
                PRODUCTS_TAG,
                CATALOG_TAG,
                HOME_TAG,
                SITE_SHELL_TAG,
            ]);
            scheduleProductSearchRebuild(ctx, "brand_updated");
        }
        catch (err) {
            ctx.log.error(err instanceof Error ? err : new Error(String(err)), {
                event: "updateBrand"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to add products",
                cause: err,
            });
        }
    }),
    deleteBrand: proc
        .input(v.object({ id: v.number() }))
        .mutation(async ({ ctx, input }) => {
        try {
            await brandQueries.admin.deleteBrand(input.id);
            await purgeTags(ctx, [
                BRANDS_TAG,
                brandTag(input.id),
                PRODUCTS_TAG,
                CATALOG_TAG,
                HOME_TAG,
                SITE_SHELL_TAG,
            ]);
            scheduleProductSearchRebuild(ctx, "brand_updated");
        }
        catch (err) {
            ctx.log.error(err instanceof Error ? err : new Error(String(err)), {
                event: "deleteBrand"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete brand",
                cause: err,
            });
        }
    }),
});
}
export const brands = buildBrandsRouter(adminProcedure);
export const brandsBot = buildBrandsRouter(botProcedure);
