import {
	adminCustomerSchema,
	adminMutationSuccessSchema,
	brandTag,
	catalogMutationErrorSchema,
	categoryTag,
	type CatalogMutationError,
	type addBrandType,
	type addCategoryType,
} from "@vit/shared";
import { Result } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import {
	catalogDeleteBlocked,
	catalogResourceNotFound,
	duplicateCatalogResource,
	invalidCatalogState,
} from "~/errors/factories/admin";
import {
	isForeignKeyViolation,
	isUniqueViolation,
} from "~/errors/internal-provider-errors";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import type { Context } from "~/lib/context";
import { scheduleProductSearchRebuild } from "~/lib/product-search/client";
import { slugify } from "~/lib/utils";
import { brandQueries } from "~/queries/brands";
import { categoryQueries } from "~/queries/categories";
import { customerQueries } from "~/queries/customers";
import { productImageQueries } from "~/queries/product-images";
import type { LegacyTrpcError } from "~/result/legacy-trpc";

export const catalogMutationResultSchemas = {
	value: adminMutationSuccessSchema,
	error: catalogMutationErrorSchema,
};

export const customerCreatedSchema = v.array(
	v.strictObject({ phone: v.number() }),
);
export const customerUpdatedSchema = v.strictObject({ phone: v.number() });

export const customerLookupResultSchemas = {
	value: adminCustomerSchema,
	error: catalogMutationErrorSchema,
};

export const customerCreatedResultSchemas = {
	value: customerCreatedSchema,
	error: catalogMutationErrorSchema,
};
export const customerUpdatedResultSchemas = {
	value: customerUpdatedSchema,
	error: catalogMutationErrorSchema,
};

const mapCreateError = (
	error: unknown,
	resource: "brand" | "category" | "customer",
	field: string,
) => {
	if (isUniqueViolation(error)) {
		return Result.err(duplicateCatalogResource(resource, field));
	}
	throw error;
};

export const addBrand = async (ctx: Context, input: addBrandType) => {
	try {
		const slug = input.slug || slugify(input.name);
		const { id: _id, ...data } = input;
		await brandQueries.admin.createBrand({ ...data, slug });
		await purgeCatalogCache(ctx);
		scheduleProductSearchRebuild(ctx, "brand_updated");
		return Result.ok({ message: "Successfully updated category" });
	} catch (error) {
		return mapCreateError(error, "brand", "slug");
	}
};

export const updateBrand = async (ctx: Context, input: addBrandType) => {
	if (!input.id) {
		return Result.err(invalidCatalogState("brand", "missing-id"));
	}
	try {
		const slug = input.slug || slugify(input.name);
		const { id, ...data } = input;
		const updated = await brandQueries.admin.updateBrand(id, { ...data, slug });
		if (!updated) return Result.err(catalogResourceNotFound("brand", id));
		await purgeCatalogCache(ctx, [], [brandTag(id)]);
		scheduleProductSearchRebuild(ctx, "brand_updated");
		return Result.ok({ message: "Brand updated successfully" });
	} catch (error) {
		return mapCreateError(error, "brand", "slug");
	}
};

export const deleteBrand = async (ctx: Context, id: number) => {
	try {
		const deleted = await brandQueries.admin.deleteBrand(id);
		if (!deleted) return Result.err(catalogResourceNotFound("brand", id));
		await purgeCatalogCache(ctx, [], [brandTag(id)]);
		scheduleProductSearchRebuild(ctx, "brand_updated");
		return Result.ok({ message: "Brand deleted successfully" });
	} catch (error) {
		if (isForeignKeyViolation(error)) {
			return Result.err(catalogDeleteBlocked("brand", "has-products"));
		}
		throw error;
	}
};

export const addCategory = async (ctx: Context, input: addCategoryType) => {
	try {
		const slug = input.slug || slugify(input.name);
		const { id: _id, ...data } = input;
		await categoryQueries.admin.createCategory({ ...data, slug });
		await purgeCatalogCache(ctx);
		scheduleProductSearchRebuild(ctx, "category_updated");
		return Result.ok({ message: "Successfully added category" });
	} catch (error) {
		return mapCreateError(error, "category", "slug");
	}
};

export const updateCategory = async (ctx: Context, input: addCategoryType) => {
	if (!input.id) {
		return Result.err(invalidCatalogState("category", "missing-id"));
	}
	try {
		const slug = input.slug || slugify(input.name);
		const { id, ...data } = input;
		const updated = await categoryQueries.admin.updateCategory(id, {
			...data,
			slug,
		});
		if (!updated) return Result.err(catalogResourceNotFound("category", id));
		await purgeCatalogCache(ctx, [], [categoryTag(id)]);
		scheduleProductSearchRebuild(ctx, "category_updated");
		return Result.ok({ message: "Successfully updated category" });
	} catch (error) {
		return mapCreateError(error, "category", "slug");
	}
};

export const deleteCategory = async (ctx: Context, id: number) => {
	try {
		const deleted = await categoryQueries.admin.deleteCategory(id);
		if (!deleted) return Result.err(catalogResourceNotFound("category", id));
		await purgeCatalogCache(ctx, [], [categoryTag(id)]);
		scheduleProductSearchRebuild(ctx, "category_updated");
		return Result.ok({ message: "Successfully deleted category" });
	} catch (error) {
		if (isForeignKeyViolation(error)) {
			return Result.err(catalogDeleteBlocked("category", "has-products"));
		}
		throw error;
	}
};

export const getCustomerByPhone = async (phone: number) => {
	const customer = await customerQueries.admin.getCustomerByPhone(phone);
	return customer
		? Result.ok(customer)
		: Result.err(catalogResourceNotFound("customer", phone));
};

export const addCustomer = async (input: {
	phone: number;
	address?: string;
	addressZoneId?: number;
}) => {
	try {
		return Result.ok(await customerQueries.admin.createCustomer(input));
	} catch (error) {
		return mapCreateError(error, "customer", "phone");
	}
};

export const updateCustomer = async (input: {
	phone: number;
	address?: string;
}) => {
	const updated = await customerQueries.admin.updateCustomer(input.phone, {
		address: input.address,
	});
	return updated
		? Result.ok(updated)
		: Result.err(catalogResourceNotFound("customer", input.phone));
};

export const deleteCustomer = async (phone: number) => {
	try {
		const deleted = await customerQueries.admin.deleteCustomer(phone);
		if (!deleted) {
			return Result.err(catalogResourceNotFound("customer", phone));
		}
		return Result.ok({ message: "Successfully deleted customer" });
	} catch (error) {
		if (isForeignKeyViolation(error)) {
			return Result.err(catalogDeleteBlocked("customer", "has-orders"));
		}
		throw error;
	}
};

export const addImage = async (input: {
	productId: number;
	url: string;
	isPrimary?: boolean;
}) => {
	try {
		await productImageQueries.admin.createImage(input);
		return Result.ok({ message: "Successfully added image" });
	} catch (error) {
		if (isForeignKeyViolation(error)) {
			return Result.err(catalogResourceNotFound("product", input.productId));
		}
		throw error;
	}
};

export const deleteImage = async (id: number) => {
	const deleted = await productImageQueries.admin.deleteImage(id);
	return deleted
		? Result.ok({ message: "Image deleted successfully" })
		: Result.err(catalogResourceNotFound("image", id));
};

export const setPrimaryImage = async (input: {
	productId: number;
	imageId: number;
}) => {
	const image = await productImageQueries.admin.getImageById(input.imageId);
	if (!image) {
		return Result.err(catalogResourceNotFound("image", input.imageId));
	}
	if (image.productId !== input.productId) {
		return Result.err(
			invalidCatalogState("image", "image-not-owned-by-product"),
		);
	}
	const updated = await productImageQueries.admin.setPrimaryImage(
		input.productId,
		input.imageId,
	);
	if (!updated) {
		return Result.err(catalogResourceNotFound("image", input.imageId));
	}
	return Result.ok({ message: "Successfully set primary image" });
};

export const catalogErrorToLegacyTrpc = (error: CatalogMutationError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		ResourceNotFound: () => ({
			code: "NOT_FOUND",
			message: "Resource not found",
		}),
		DuplicateResource: () => ({
			code: "CONFLICT",
			message: "Resource already exists",
		}),
		DeleteBlocked: () => ({
			code: "CONFLICT",
			message: "Resource is in use",
		}),
		InvalidCatalogState: () => ({
			code: "BAD_REQUEST",
			message: "Invalid catalog state",
		}),
		StockConflict: () => ({ code: "CONFLICT", message: "Stock conflict" }),
		ConcurrentUpdate: () => ({
			code: "CONFLICT",
			message: "Concurrent update",
		}),
	});
