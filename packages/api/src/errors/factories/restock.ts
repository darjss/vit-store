import type { RestockError } from "@vit/shared";

export const restockErrors = {
	invalidContact: (channel: "sms" | "email") =>
		({ _tag: "InvalidContact", channel }) satisfies RestockError,
	contactNotVerified: () =>
		({ _tag: "ContactNotVerified" }) satisfies RestockError,
	subscriptionLimitReached: () =>
		({ _tag: "SubscriptionLimitReached" }) satisfies RestockError,
	rateLimited: (retryAfterSeconds: number) =>
		({
			_tag: "RestockRateLimited",
			retryAfterSeconds,
		}) satisfies RestockError,
	productNotFound: () => ({ _tag: "ProductNotFound" }) satisfies RestockError,
	productAlreadyInStock: () =>
		({ _tag: "ProductAlreadyInStock" }) satisfies RestockError,
};
