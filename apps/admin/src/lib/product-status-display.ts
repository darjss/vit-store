import { status as productStatusValues } from "@vit/shared/constants";
import { picklist, safeParse } from "valibot";
import { productStatusLabel } from "@/lib/enum-labels";

const productStatusSchema = picklist(productStatusValues);

export function labelForProductStatus(status: string | undefined): string {
	if (!status) {
		return "";
	}
	const parsed = safeParse(productStatusSchema, status);
	return parsed.success ? productStatusLabel[parsed.output] : status;
}
