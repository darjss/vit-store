export function shouldRetryRestockDelivery(input: {
	channel: "sms" | "email";
	providerResult: "failed" | "ambiguous";
}) {
	return input.channel === "email" && input.providerResult === "failed";
}
