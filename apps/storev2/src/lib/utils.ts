import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export { formatCurrency } from "@vit/shared";

export function cn(...inputs: Array<ClassValue>) {
	return twMerge(clsx(inputs));
}
