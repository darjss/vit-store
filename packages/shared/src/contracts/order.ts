import * as v from "valibot";
import {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
} from "../constants";
import { publicErrorSchema } from "./errors";

export const orderAccessErrorSchema = v.variant("_tag", [
	publicErrorSchema("OrderNotFound", {
		message: v.literal("Захиалга олдсонгүй."),
	}),
	publicErrorSchema("OrderAccessDenied", {
		message: v.literal("Энэ захиалгын мэдээллийг харах эрхгүй байна."),
	}),
]);

const orderProductSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	price: v.pipe(v.number(), v.integer(), v.minValue(0)),
	brand: v.strictObject({ name: v.string() }),
	images: v.array(v.strictObject({ url: v.string() })),
});

const orderDetailSchema = v.strictObject({
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
	product: orderProductSchema,
});

const orderPaymentSchema = v.strictObject({
	paymentNumber: v.string(),
	status: v.picklist(paymentStatus),
	provider: v.picklist(paymentProvider),
	createdAt: v.date(),
});

export const orderTrackingSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	orderNumber: v.string(),
	customerPhone: v.pipe(v.number(), v.integer()),
	status: v.picklist(orderStatus),
	total: v.pipe(v.number(), v.integer(), v.minValue(0)),
	notes: v.nullable(v.string()),
	address: v.string(),
	deliveryProvider: v.picklist(deliveryProvider),
	createdAt: v.date(),
	updatedAt: v.nullable(v.date()),
	payments: v.array(orderPaymentSchema),
	orderDetails: v.array(orderDetailSchema),
});

export type OrderAccessError = v.InferOutput<typeof orderAccessErrorSchema>;
export type OrderTracking = v.InferOutput<typeof orderTrackingSchema>;
