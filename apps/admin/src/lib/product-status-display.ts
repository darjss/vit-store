import { status as productStatusValues } from "@vit/shared/constants";
import type { status as productStatus } from "@vit/shared/constants";
import * as v from "valibot";
import { productStatusLabel } from "@/lib/enum-labels";

type ProductStatusType = (typeof productStatus)[number];

const productStatusSchema = v.picklist(productStatusValues);

export function labelForProductStatus(status: string | undefined): string {
	if (!status) {
		return "";
	}
	const parsed = v.safeParse(productStatusSchema, status);
	return parsed.success ? productStatusLabel[parsed.output] : status;
}
