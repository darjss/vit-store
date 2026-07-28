import {
	ambiguousDelivery,
	type DeliveryFailure,
	invalidDelivery,
	permanentDeliveryFailure,
	retryableDeliveryFailure,
} from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import { Resend, type ErrorResponse } from "resend";
import * as v from "valibot";

export const resendClient = new Resend(
	process.env.RESEND_API_KEY ?? "re_not_configured",
);

const emailReceiptSchema = v.strictObject({
	id: v.pipe(v.string(), v.minLength(1)),
});

export type EmailReceipt = v.InferOutput<typeof emailReceiptSchema>;

export const classifyResendError = (error: ErrorResponse): DeliveryFailure => {
	if (
		error.name === "rate_limit_exceeded" ||
		error.name === "application_error" ||
		error.name === "internal_server_error" ||
		error.name === "concurrent_idempotent_requests"
	) {
		return retryableDeliveryFailure(
			"email",
			error.name === "rate_limit_exceeded"
				? "rate_limited"
				: "provider_unavailable",
		);
	}
	if (
		error.name === "missing_required_field" ||
		error.name === "invalid_idempotency_key" ||
		error.name === "invalid_idempotent_request" ||
		error.name === "invalid_parameter" ||
		error.name === "validation_error"
	) {
		return invalidDelivery("email", "invalid_payload");
	}
	return permanentDeliveryFailure("email", "provider_rejected");
};

export async function sendEmail(input: {
	to: string;
	subject: string;
	text: string;
	idempotencyKey?: string;
}): Promise<BetterResult<EmailReceipt, DeliveryFailure>> {
	if (!process.env.RESEND_API_KEY) {
		throw new Error("RESEND_API_KEY is not configured");
	}

	const from =
		process.env.RESTOCK_FROM_EMAIL ?? "Vit Store <noreply@amerikvitamin.mn>";
	let result: Awaited<ReturnType<typeof resendClient.emails.send>>;
	try {
		result = await resendClient.emails.send({
			from,
			to: input.to,
			subject: input.subject,
			text: input.text,
			...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
		});
	} catch {
		return Result.err(
			input.idempotencyKey
				? retryableDeliveryFailure("email", "network_failure")
				: ambiguousDelivery("email", "network_failure"),
		);
	}

	if (result.error) return Result.err(classifyResendError(result.error));
	const parsed = v.safeParse(emailReceiptSchema, result.data);
	if (!parsed.success) {
		return Result.err(
			input.idempotencyKey
				? retryableDeliveryFailure("email", "malformed_response")
				: ambiguousDelivery("email", "malformed_response"),
		);
	}
	return Result.ok(parsed.output);
}
