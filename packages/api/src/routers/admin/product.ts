import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import {
    addProductSchema,
    BRANDS_TAG,
    CATEGORIES_TAG,
    PRODUCTS_TAG,
    productTag,
    updateProductSchema,
} from "@vit/shared";
import { status } from "@vit/shared/constants";
import * as v from "valibot";
import { purgeTags } from "~/lib/cache/workers-cache";
import { PRODUCT_PER_PAGE, productFields } from "~/lib/constants";
import { scheduleProductSearchRebuild, searchProducts, } from "~/lib/product-search/client";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
import { db } from "~/db/client";
const normalizeExpirationDate = (value?: string | null) => {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const yyyyMmMatch = trimmed.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (yyyyMmMatch)
        return `${yyyyMmMatch[1]}-${yyyyMmMatch[2]}`;
    const mmYyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (mmYyMatch)
        return `20${mmYyMatch[2]}-${mmYyMatch[1]}`;
    const mmYyyyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
    if (mmYyyyMatch)
        return `${mmYyyyMatch[2]}-${mmYyyyMatch[1]}`;
    return null;
};
const CATALOG_MUTATION_TAGS = [PRODUCTS_TAG, BRANDS_TAG, CATEGORIES_TAG];
export function buildProductRouter<P extends typeof baseProcedure>(proc: P) {
    return router({
    searchProductByName: proc
        .input(v.object({ searchTerm: v.string() }))
        .query(async ({ ctx, input }) => {
        try {
            const products = await productQueries.admin.searchByName(input.searchTerm, 3);
            return products;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "searchProductByName"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to search products",
                cause: error,
            });
        }
    }),
    searchProductByNameForOrder: proc
        .input(v.object({ searchTerm: v.string() }))
        .query(async ({ ctx, input }) => {
        try {
            const products = await productQueries.admin.searchByNameForOrder(input.searchTerm, 3);
            return products;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "searchProductByNameForOrder"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to search products for order",
                cause: error,
            });
        }
    }),
    searchProductsInstant: proc
        .input(v.object({
        query: v.pipe(v.string(), v.minLength(1)),
        limit: v.optional(v.number(), 10),
        brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        status: v.optional(v.picklist(status)),
    }))
        .query(async ({ ctx, input }) => {
        try {
            const { query, limit, brandId, categoryId, status } = input;
            const safeLimit = Math.min(limit, 10);
            const searchResults = await searchProducts(query, safeLimit, {
                brandId,
                categoryId,
            });
            return searchResults
                .filter((result) => !status || result.status === status)
                .map((result) => ({
                id: result.id,
                name: result.name,
                slug: result.slug,
                price: result.price,
                stock: result.stock,
                status: result.status,
                images: result.image ? [{ url: result.image }] : [],
            }))
                .slice(0, safeLimit);
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "searchProductsInstant"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to search products",
                cause: error,
            });
        }
    }),
    addProduct: proc
        .input(addProductSchema)
        .mutation(async ({ ctx, input }) => {
        try {
            const expirationInput = (input as Record<string, unknown>)
                .expirationDate;
            const normalizedExpirationDate = normalizeExpirationDate(typeof expirationInput === "string" ? expirationInput : null);
            // Remove the last empty image if present
            const images = input.images.filter((image) => image.url.trim() !== "");
            // Validate image URLs
            for (const image of images) {
                const result = v.safeParse(v.pipe(v.string(), v.url()), image.url);
                if (!result.success) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `Invalid image URL: ${image.url}`,
                    });
                }
            }
            const brand = await productQueries.admin.getBrandById(input.brandId);
            if (!brand) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Brand not found",
                });
            }
            const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
            const slug = productName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            const productResult = await db().transaction(async (tx) => {
                const created = await productQueries.admin.createProduct({
                    name: productName,
                    slug,
                    description: input.description,
                    discount: 0,
                    amount: input.amount,
                    potency: input.potency,
                    stock: input.stock,
                    price: input.price,
                    dailyIntake: input.dailyIntake,
                    categoryId: input.categoryId,
                    brandId: input.brandId,
                    status: input.status || "active",
                    // Optional AI-extracted fields
                    name_mn: input.name_mn || null,
                    ingredients: input.ingredients || [],
                    tags: input.tags || [],
                    seoTitle: input.seoTitle || null,
                    seoDescription: input.seoDescription || null,
                    weightGrams: input.weightGrams || 0,
                    expirationDate: normalizedExpirationDate,
                }, tx);
                if (!created) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "Failed to create product",
                    });
                }
                const productId = created.id;
                const imagesToInsert = images.map((image, index) => ({
                    productId,
                    url: image.url,
                    isPrimary: index === 0,
                }));
                await productQueries.admin.createProductImages(productId, imagesToInsert, tx);
                return created;
            });
            await purgeTags(ctx, [...CATALOG_MUTATION_TAGS, productTag(productResult.id)]);
            scheduleProductSearchRebuild(ctx, "product_created");
            return { message: "Product added successfully", id: productResult.id };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "addProduct"
            });
            if (error instanceof TRPCError)
                throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to add product",
                cause: error,
            });
        }
    }),
    getProductBenchmark: proc.query(async ({ ctx }) => {
        try {
            const startTime = performance.now();
            await productQueries.admin.getProductBenchmark();
            return performance.now() - startTime;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getProductBenchmark"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to run benchmark",
                cause: error,
            });
        }
    }),
    getProductById: proc
        .input(v.object({ id: v.number() }))
        .query(async ({ ctx, input }) => {
        try {
            const product = await productQueries.admin.getProductById(input.id);
            if (!product)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Product not found",
                });
            return product;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getProductById"
            });
            if (error instanceof TRPCError)
                throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch product",
                cause: error,
            });
        }
    }),
    updateProduct: proc
        .input(updateProductSchema)
        .mutation(async ({ ctx, input }) => {
        try {
            const expirationInput = (input as Record<string, unknown>)
                .expirationDate;
            const normalizedExpirationDate = normalizeExpirationDate(typeof expirationInput === "string" ? expirationInput : null);
            if (!input.id)
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Product ID is required",
                });
            const { images, id, ...productData } = input;
            const filteredImages = images.filter((image) => image.url.trim() !== "");
            for (const image of filteredImages) {
                const result = v.safeParse(v.pipe(v.string(), v.url()), image.url);
                if (!result.success)
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid image URL",
                    });
            }
            const brand = await productQueries.admin.getBrandById(input.brandId);
            if (!brand)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Brand not found",
                });
            const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
            const slug = productName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            await productQueries.admin.updateProduct(input.id, {
                ...productData,
                expirationDate: normalizedExpirationDate,
                name: productName,
                slug,
            });
            const existingImages = await productQueries.admin.getProductImages(input.id);
            let isDiff = false;
            if (filteredImages.length !== existingImages.length) {
                isDiff = true;
            }
            else {
                const sortedNewImages = filteredImages.toSorted((a, b) => a.url.localeCompare(b.url));
                const sortedExistingImages = existingImages.toSorted((a, b) => a.url.localeCompare(b.url));
                for (let i = 0; i < filteredImages.length; i++) {
                    if (sortedNewImages[i]?.url !== sortedExistingImages[i]?.url) {
                        isDiff = true;
                        break;
                    }
                }
            }
            if (isDiff) {
                await productQueries.admin.softDeleteProductImages(input.id);
                const imagesToInsert = filteredImages.map((image, index) => ({
                    productId: input.id,
                    url: image.url,
                    isPrimary: index === 0,
                }));
                await productQueries.admin.createProductImages(input.id, imagesToInsert);
            }
            await purgeTags(ctx, [...CATALOG_MUTATION_TAGS, productTag(input.id)]);
            scheduleProductSearchRebuild(ctx, "product_updated");
            return { message: "Product updated successfully" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "updateProduct"
            });
            if (error instanceof TRPCError)
                throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to update product",
                cause: error,
            });
        }
    }),
    updateStock: proc
        .input(v.object({
        productId: v.number(),
        numberToUpdate: v.number(),
        type: v.picklist(["add", "minus"]),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const product = await productQueries.admin.getProductById(input.productId);
            if (!product)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Product not found",
                });
            await productQueries.admin.updateStock(input.productId, input.numberToUpdate, input.type);
            await purgeTags(ctx, [...CATALOG_MUTATION_TAGS, productTag(input.productId)]);
            scheduleProductSearchRebuild(ctx, "product_stock_updated");
            return { message: "Stock updated successfully" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "updateStock"
            });
            if (error instanceof TRPCError)
                throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to update stock",
                cause: error,
            });
        }
    }),
    deleteProduct: proc
        .input(v.object({ id: v.number() }))
        .mutation(async ({ ctx, input }) => {
        try {
            const product = await productQueries.admin.getProductById(input.id);
            if (!product)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Product not found",
                });
            await productQueries.admin.deleteProduct(input.id);
            await purgeTags(ctx, [...CATALOG_MUTATION_TAGS, productTag(input.id)]);
            scheduleProductSearchRebuild(ctx, "product_deleted");
            return { message: "Product deleted successfully" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "deleteProduct"
            });
            if (error instanceof TRPCError)
                throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete product",
                cause: error,
            });
        }
    }),
    getAllProducts: proc.query(async ({ ctx }) => {
        try {
            const products = await productQueries.admin.getAllProducts();
            return products;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getAllProducts"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch products",
                cause: error,
            });
        }
    }),
    getPaginatedProducts: proc
        .input(v.object({
        page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
        pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), PRODUCT_PER_PAGE),
        brandId: v.optional(v.number()),
        categoryId: v.optional(v.number()),
        status: v.optional(v.picklist(status)),
        sortField: v.optional(v.string()),
        sortDirection: v.optional(v.picklist(["asc", "desc"])),
        searchTerm: v.optional(v.string()),
    }))
        .query(async ({ ctx, input }) => {
        try {
            return await productQueries.admin.getPaginatedProducts({
                page: input.page ?? 1,
                pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
                brandId: input.brandId,
                categoryId: input.categoryId,
                status: input.status,
                sortField: input.sortField,
                sortDirection: input.sortDirection ?? "desc",
                searchTerm: input.searchTerm,
            });
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getPaginatedProducts"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch paginated products",
                cause: error,
            });
        }
    }),
    setProductStock: proc
        .input(v.object({ id: v.number(), newStock: v.number() }))
        .mutation(async ({ ctx, input }) => {
        try {
            await productQueries.admin.setProductStock(input.id, input.newStock);
            await purgeTags(ctx, [...CATALOG_MUTATION_TAGS, productTag(input.id)]);
            scheduleProductSearchRebuild(ctx, "product_stock_updated");
            return { message: "Stock set successfully" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "setProductStock"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to set product stock",
                cause: error,
            });
        }
    }),
    getAllProductValue: proc.query(async ({ ctx }) => {
        try {
            const result = await productQueries.admin.getAllProductValue();
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getAllProductValue"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to calculate product value",
                cause: error,
            });
        }
    }),
    getReviewProducts: proc.query(async ({ ctx }) => {
        try {
            return await productQueries.admin.getReviewProducts();
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getReviewProducts"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch review products",
                cause: error,
            });
        }
    }),
    updateProductField: proc
        .input(v.object({
        id: v.number(),
        field: v.picklist(productFields),
        stringValue: v.optional(v.string()),
        numberValue: v.optional(v.number()),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const value = String(input.field) === "expirationDate"
                ? normalizeExpirationDate(input.stringValue)
                : (input.stringValue ?? input.numberValue);
            await productQueries.admin.updateProductField(input.id, input.field, value ?? null);
            await purgeTags(ctx, [...CATALOG_MUTATION_TAGS, productTag(input.id)]);
            scheduleProductSearchRebuild(ctx, "product_updated");
            return { message: "Product field updated successfully" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "updateProductField"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to update product field",
                cause: error,
            });
        }
    }),
});
}
export const product = buildProductRouter(adminProcedure);
export const productBot = buildProductRouter(botProcedure);
