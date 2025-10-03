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
export const getPaymentStatusColor = (status: string) => {
	switch (status) {
	  case "success":
		return "border-emerald-200 bg-emerald-50 text-emerald-800";
	  case "pending":
		return "border-amber-200 bg-amber-50 text-amber-800";
	  case "failed":
		return "border-rose-200 bg-rose-50 text-rose-800";
	  default:
		return "border-slate-200 bg-slate-50 text-slate-800";
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
        badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
        border: "border-l-emerald-500",
      };
    case "shipped":
      return {
        badge: "border-sky-200 bg-sky-50 text-sky-800",
        border: "border-l-sky-500",
      };
    case "pending":
      return {
        badge: "border-amber-200 bg-amber-50 text-amber-800",
        border: "border-l-amber-500",
      };
    case "cancelled":
    case "canceled":
      return {
        badge: "border-rose-200 bg-rose-50 text-rose-800",
        border: "border-l-rose-500",
      };
    default:
      return {
        badge: "border-slate-200 bg-slate-50 text-slate-800",
        border: "border-l-slate-500",
      };
  }
};