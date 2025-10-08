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
			return "bg-[#00ff88] text-black border-black";
		case "OUT_OF_STOCK":
			return "bg-[#ff4757] text-white border-black";
		case "DISCONTINUED":
			return "bg-[#2c2c54] text-white border-black";
		default:
			return "bg-[#ff6b35] text-black border-black";
	}
};

export const getStockColor = (stock: number) => {
	if (stock > 10) return "text-[#00ff88]";
	if (stock > 0) return "text-[#ffa502]";
	return "text-[#ff4757]";
};
export const getPaymentStatusColor = (status: string) => {
	switch (status) {
		case "success":
			return "border-black bg-[#00ff88] text-black";
		case "pending":
			return "border-black bg-[#ffa502] text-black";
		case "failed":
			return "border-black bg-[#ff4757] text-white";
		default:
			return "border-black bg-[#5f27cd] text-white";
	}
};

export const getPaymentProviderIcon = (provider: string) => {
	switch (provider.toLowerCase()) {
		case "qpay":
			return "📱";
		case "cash":
			return "💵";
		case "transfer":
			return "🏦";
		default:
			return "💳";
	}
};
export function formatCurrency(amount: number): string {
	return amount + "₮";
}

// Order status styles for badges and left-border colors
export const getOrderStatusStyles = (status: string) => {
	switch (status.toLowerCase()) {
		case "delivered":
			return {
				badge: "border-black bg-[#00ff88] text-black",
				border: "border-l-[#00ff88]",
			};
		case "shipped":
			return {
				badge: "border-black bg-[#3742fa] text-white",
				border: "border-l-[#3742fa]",
			};
		case "pending":
			return {
				badge: "border-black bg-[#ffa502] text-black",
				border: "border-l-[#ffa502]",
			};
		case "cancelled":
		case "canceled":
			return {
				badge: "border-black bg-[#ff4757] text-white",
				border: "border-l-[#ff4757]",
			};
		default:
			return {
				badge: "border-black bg-[#5f27cd] text-white",
				border: "border-l-[#5f27cd]",
			};
	}
};
