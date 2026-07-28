import { match } from "dismatch";

export type PaymentWebhookOutcome =
	| { _tag: "InvalidRequest" }
	| { _tag: "Acknowledged" }
	| { _tag: "ProviderAmbiguous" }
	| { _tag: "ProcessingFailed" };

/** Preserve QPay's existing acknowledgment contract: only bad input is 4xx. */
export const qpayWebhookStatus = (outcome: PaymentWebhookOutcome) =>
	match(
		outcome,
		"_tag",
	)<200 | 400>({
		InvalidRequest: () => 400,
		Acknowledged: () => 200,
		ProviderAmbiguous: () => 200,
		ProcessingFailed: () => 200,
	});
