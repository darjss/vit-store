import { productQueries } from "~/queries";
import type { RestockError, RestockSubscriptionResult } from "@vit/shared";
import { Result } from "better-result";
import { restockErrors } from "~/errors/factories/restock";
import {
	subscribeToRestock,
	type RestockContactInput,
} from "~/lib/restock/subscribe";
import type { CustomerSessionClaims } from "~/lib/session/checkout-access";

export const subscribeToRestockOperation = async (
	input: {
		productId: number;
		contacts: RestockContactInput[];
		requestIp: string;
	},
	customer: CustomerSessionClaims,
) => {
	if (customer.trust !== "phone_verified") {
		return Result.err<RestockSubscriptionResult, RestockError>(
			restockErrors.contactNotVerified(),
		);
	}

	const product = await productQueries.store.getProductStockStatus(
		input.productId,
	);
	if (
		!product ||
		(product.status !== "active" && product.status !== "out_of_stock")
	) {
		return Result.err<RestockSubscriptionResult, RestockError>(
			restockErrors.productNotFound(),
		);
	}
	if (product.stock > 0) {
		return Result.err<RestockSubscriptionResult, RestockError>(
			restockErrors.productAlreadyInStock(),
		);
	}

	return subscribeToRestock({
		...input,
		verifiedPhone: String(customer.phone),
	});
};
