import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
	ZodArray,
	ZodBoolean,
	ZodEnum,
	ZodNumber,
	ZodObject,
	ZodOptional,
	ZodString,
	type ZodSchema,
	type ZodTypeAny,
} from "zod";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
export const generateDefaultValues = (schema: ZodSchema) => {
	if (!(schema instanceof ZodObject)) {
		throw new Error("Schema must be a ZodObject");
	}

	const shape = schema.shape;
	const defaultValues: Record<string, any> = {};

	Object.keys(shape).forEach((key) => {
		const fieldSchema = shape[key] as ZodTypeAny;
		if (fieldSchema instanceof ZodString) {
			defaultValues[key] = "";
		} else if (fieldSchema instanceof ZodNumber) {
			defaultValues[key] = 0;
		} else if (fieldSchema instanceof ZodBoolean) {
			defaultValues[key] = false;
		} else if (fieldSchema instanceof ZodOptional) {
			defaultValues[key] = undefined;
		} else if (fieldSchema instanceof ZodArray) {
			// Initialize arrays as empty arrays
			defaultValues[key] = [];
		} else if (fieldSchema instanceof ZodObject) {
			// Recursively handle nested objects
			defaultValues[key] = generateDefaultValues(fieldSchema);
		} else if (fieldSchema instanceof ZodEnum) {
			// Get the first value of the enum
			defaultValues[key] = fieldSchema.options[0];
		} else {
			defaultValues[key] = undefined;
		}
	});
	// console.log("default",defaultValues)
	return defaultValues;
};

export const getStatusColor = (status: string) => {
	switch (status) {
		case "ACTIVE":
			return "bg-green-100 text-green-800 border-green-300";
		case "OUT_OF_STOCK":
			return "bg-red-100 text-red-800 border-red-300";
		case "DISCONTINUED":
			return "bg-gray-100 text-gray-800 border-gray-300";
		default:
			return "bg-blue-100 text-blue-800 border-blue-300";
	}
};

export const getStockColor = (stock: number) => {
	if (stock > 10) return "text-green-600";
	if (stock > 0) return "text-amber-600";
	return "text-red-600";
};
