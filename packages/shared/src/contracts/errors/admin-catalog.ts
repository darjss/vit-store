import * as v from "valibot";
import { publicErrorSchema } from "../errors";

export const adminCatalogResourceSchema = v.picklist([
	"product",
	"brand",
	"category",
	"customer",
	"image",
	"admin-user",
]);

const resourceIdSchema = v.union([v.string(), v.number()]);

export const catalogMutationErrorSchema = v.variant("_tag", [
	publicErrorSchema("ResourceNotFound", {
		resource: adminCatalogResourceSchema,
		id: resourceIdSchema,
		message: v.string(),
	}),
	publicErrorSchema("DuplicateResource", {
		resource: adminCatalogResourceSchema,
		field: v.string(),
		message: v.string(),
	}),
	publicErrorSchema("DeleteBlocked", {
		resource: adminCatalogResourceSchema,
		reason: v.picklist([
			"has-products",
			"has-orders",
			"has-receipts",
			"in-use",
		]),
		message: v.string(),
	}),
	publicErrorSchema("InvalidCatalogState", {
		resource: adminCatalogResourceSchema,
		reason: v.picklist([
			"missing-id",
			"invalid-image-url",
			"image-not-owned-by-product",
			"invalid-stock",
		]),
		message: v.string(),
	}),
	publicErrorSchema("StockConflict", {
		productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
		available: v.optional(v.pipe(v.number(), v.integer())),
		message: v.string(),
	}),
	publicErrorSchema("ConcurrentUpdate", {
		resource: adminCatalogResourceSchema,
		id: resourceIdSchema,
		message: v.string(),
	}),
]);

export type AdminCatalogResource = v.InferOutput<
	typeof adminCatalogResourceSchema
>;
export type CatalogMutationError = v.InferOutput<
	typeof catalogMutationErrorSchema
>;
