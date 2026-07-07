import type { RequestLogger } from "evlog";
import { TRPCError } from "@trpc/server";
import { categoryQueries } from "@vit/api/queries";
import {
    addCategorySchema,
    CATEGORIES_TAG,
    categoryTag,
    PRODUCTS_TAG,
} from "@vit/shared";
import * as v from "valibot";
import { purgeTags } from "~/lib/cache/workers-cache";
import { rebuildProductSearchIndex } from "~/lib/product-search/client";
import { slugify } from "~/lib/utils";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
const scheduleProductSearchRebuild = (ctx: {
    c: {
        executionCtx: ExecutionContext;
    };
    log: RequestLogger<any>;
}) => {
    ctx.c.executionCtx.waitUntil(rebuildProductSearchIndex("category_updated").catch((error) => {
        ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
            event: "product_search.rebuild_failed"
        });
    }));
};
export function buildCategoryRouter<P extends typeof baseProcedure>(proc: P) {
    return router({
    getAllCategories: proc.query(async ({ ctx }) => {
        try {
            const categories = await categoryQueries.admin.getAllCategories();
            return categories;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getAllCategories"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Error fetching categories",
                cause: error,
            });
        }
    }),
    addCategory: proc
        .input(addCategorySchema)
        .mutation(async ({ ctx, input }) => {
        try {
            const slug = input.slug || slugify(input.name);
            const { id: _id, ...data } = input;
            await categoryQueries.admin.createCategory({
                ...data,
                slug,
            });
            await purgeTags(ctx, [CATEGORIES_TAG, PRODUCTS_TAG]);
            scheduleProductSearchRebuild(ctx);
            return { message: "Successfully added category" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "addCategory"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Error adding category",
                cause: error,
            });
        }
    }),
    updateCategory: proc
        .input(addCategorySchema)
        .mutation(async ({ ctx, input }) => {
        try {
            if (!input.id) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Category ID is required",
                });
            }
            const slug = input.slug || slugify(input.name);
            const { id, ...data } = input;
            await categoryQueries.admin.updateCategory(id, {
                ...data,
                slug,
            });
            await purgeTags(ctx, [CATEGORIES_TAG, categoryTag(id), PRODUCTS_TAG]);
            scheduleProductSearchRebuild(ctx);
            return { message: "Successfully updated category" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "updateCategory"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Error updating category",
                cause: error,
            });
        }
    }),
    deleteCategory: proc
        .input(v.object({
        id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const { id } = input;
            await categoryQueries.admin.deleteCategory(id);
            await purgeTags(ctx, [CATEGORIES_TAG, categoryTag(id), PRODUCTS_TAG]);
            scheduleProductSearchRebuild(ctx);
            return { message: "Successfully deleted category" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "deleteCategory"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Error deleting category",
                cause: error,
            });
        }
    }),
    getCategoryById: proc
        .input(v.object({
        id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }))
        .query(async ({ ctx, input }) => {
        try {
            const { id } = input;
            const category = await categoryQueries.admin.getCategoryById(id);
            if (!category) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Category not found",
                });
            }
            return category;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getCategoryById"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Error fetching category by ID",
                cause: error,
            });
        }
    }),
});
}
export const category = buildCategoryRouter(adminProcedure);
export const categoryBot = buildCategoryRouter(botProcedure);
