import {
	adminCreatedSuccessSchema,
	adminMutationSuccessSchema,
	catalogMutationErrorSchema,
	type CatalogMutationError,
	type addProductType,
	type updateProductType,
} from "@vit/shared";
import { Result } from "better-result";
import * as v from "valibot";
import {
	catalogResourceNotFound,
	duplicateCatalogResource,
	invalidCatalogState,
} from "~/errors/factories/admin";
import {
	isForeignKeyViolation,
	isUniqueViolation,
} from "~/errors/internal-provider-errors";
import { db } from "~/db/client";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import type { Context } from "~/lib/context";
import { scheduleProductSearchRebuild } from "~/lib/product-search/client";
import { scheduleRestockDispatch } from "~/lib/restock";
import { productQueries } from "~/queries/products";

export const productCreatedResultSchemas = {
	value: adminCreatedSuccessSchema,
	error: catalogMutationErrorSchema,
};

export const productMutationResultSchemas = {
	value: adminMutationSuccessSchema,
	error: catalogMutationErrorSchema,
};

export const normalizeExpirationDate = (value?: string | null) => {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const yyyyMmMatch = trimmed.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
	if (yyyyMmMatch) return `${yyyyMmMatch[1]}-${yyyyMmMatch[2]}`;
	const mmYyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
	if (mmYyMatch) return `20${mmYyMatch[2]}-${mmYyMatch[1]}`;
	const mmYyyyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
	if (mmYyyyMatch) return `${mmYyyyMatch[2]}-${mmYyyyMatch[1]}`;
	return null;
};

const validateImages = (images: Array<{ url: string }>) => {
	for (const image of images) {
		if (!v.safeParse(v.pipe(v.string(), v.url()), image.url).success) {
			return Result.err(invalidCatalogState("product", "invalid-image-url"));
		}
	}
	return Result.ok(undefined);
};

const productIdentity = (
	brandName: string,
	input: Pick<addProductType, "name" | "potency" | "amount">,
) => {
	const name = `${brandName} ${input.name} ${input.potency} ${input.amount}`;
	return {
		name,
		slug: name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, ""),
	};
};

const mapProductWriteError = (error: unknown) => {
	if (isUniqueViolation(error)) {
		return Result.err(duplicateCatalogResource("product", "slug"));
	}
	if (isForeignKeyViolation(error)) {
		return Result.err(invalidCatalogState("product", "missing-id"));
	}
	throw error;
};

export const addProduct = async (ctx: Context, input: addProductType) => {
	const images = input.images.filter((image) => image.url.trim() !== "");
	const imageValidation = validateImages(images);
	if (imageValidation.status === "error") return imageValidation;

	const brand = await productQueries.admin.getBrandById(input.brandId);
	if (!brand) {
		return Result.err(catalogResourceNotFound("brand", input.brandId));
	}
	const identity = productIdentity(brand.name, input);

	try {
		const created = await db().transaction(async (tx) => {
			const product = await productQueries.admin.createProduct(
				{
					name: identity.name,
					slug: identity.slug,
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
					name_mn: input.name_mn || null,
					ingredients: input.ingredients || [],
					tags: input.tags || [],
					seoTitle: input.seoTitle || null,
					seoDescription: input.seoDescription || null,
					weightGrams: input.weightGrams || 0,
					expirationDate: normalizeExpirationDate(input.expirationDate),
				},
				tx,
			);
			if (!product) throw new Error("Product insert returned no row");
			await productQueries.admin.createProductImages(
				product.id,
				images.map((image, index) => ({
					url: image.url,
					isPrimary: index === 0,
				})),
				tx,
			);
			return product;
		});
		await purgeCatalogCache(ctx, [created.id]);
		scheduleProductSearchRebuild(ctx, "product_created");
		return Result.ok({ message: "Product added successfully", id: created.id });
	} catch (error) {
		return mapProductWriteError(error);
	}
};

export const updateProduct = async (ctx: Context, input: updateProductType) => {
	const existing = await productQueries.admin.getProductById(input.id);
	if (!existing) {
		return Result.err(catalogResourceNotFound("product", input.id));
	}
	const images = input.images.filter((image) => image.url.trim() !== "");
	const imageValidation = validateImages(images);
	if (imageValidation.status === "error") return imageValidation;
	const brand = await productQueries.admin.getBrandById(input.brandId);
	if (!brand) {
		return Result.err(catalogResourceNotFound("brand", input.brandId));
	}

	const identity = productIdentity(brand.name, input);
	const { images: _images, id: _id, ...productData } = input;
	try {
		const stockChange = await productQueries.admin.updateProduct(input.id, {
			...productData,
			expirationDate: normalizeExpirationDate(input.expirationDate),
			...identity,
		});
		if (!stockChange) {
			throw new Error("Locked product update returned no stock transition");
		}
		await productQueries.admin.softDeleteProductImages(input.id);
		await productQueries.admin.createProductImages(
			input.id,
			images.map((image, index) => ({
				url: image.url,
				isPrimary: index === 0,
			})),
		);
		await purgeCatalogCache(ctx, [input.id]);
		scheduleProductSearchRebuild(ctx, "product_updated");
		scheduleRestockDispatch(ctx, stockChange);
		return Result.ok({ message: "Product updated successfully" });
	} catch (error) {
		return mapProductWriteError(error);
	}
};

export const updateProductStock = async (
	ctx: Context,
	input: { productId: number; numberToUpdate: number; type: "add" | "minus" },
) => {
	const transition = await productQueries.admin.updateStock(
		input.productId,
		input.numberToUpdate,
		input.type,
	);
	if (!transition) {
		return Result.err(catalogResourceNotFound("product", input.productId));
	}
	await purgeCatalogCache(ctx, [input.productId]);
	scheduleProductSearchRebuild(ctx, "product_stock_updated");
	if (input.type === "add") scheduleRestockDispatch(ctx, transition);
	return Result.ok({ message: "Stock updated successfully" });
};

export const setProductStock = async (
	ctx: Context,
	input: { id: number; newStock: number },
) => {
	const transition = await productQueries.admin.setProductStock(
		input.id,
		input.newStock,
	);
	if (!transition) {
		return Result.err(catalogResourceNotFound("product", input.id));
	}
	await purgeCatalogCache(ctx, [input.id]);
	scheduleProductSearchRebuild(ctx, "product_stock_updated");
	scheduleRestockDispatch(ctx, transition);
	return Result.ok({ message: "Stock set successfully" });
};

export const deleteProduct = async (ctx: Context, id: number) => {
	const product = await productQueries.admin.getProductById(id);
	if (!product) return Result.err(catalogResourceNotFound("product", id));
	await productQueries.admin.deleteProduct(id);
	await purgeCatalogCache(ctx, [id]);
	scheduleProductSearchRebuild(ctx, "product_deleted");
	return Result.ok({ message: "Product deleted successfully" });
};

export const updateProductField = async (
	ctx: Context,
	input: {
		id: number;
		field: string;
		stringValue?: string;
		numberValue?: number;
	},
) => {
	const product = await productQueries.admin.getProductById(input.id);
	if (!product) {
		return Result.err(catalogResourceNotFound("product", input.id));
	}
	const value =
		input.field === "expirationDate"
			? normalizeExpirationDate(input.stringValue)
			: (input.stringValue ?? input.numberValue);
	const stockChange = await productQueries.admin.updateProductField(
		input.id,
		input.field,
		value ?? null,
	);
	await purgeCatalogCache(ctx, [input.id]);
	scheduleProductSearchRebuild(ctx, "product_updated");
	if (stockChange) scheduleRestockDispatch(ctx, stockChange);
	return Result.ok({ message: "Product field updated successfully" });
};

export type ProductOperationError = CatalogMutationError;
