/*
 * Order domain-error mapping.
 *
 * Transport errors are tRPC INTERNAL_SERVER_ERROR (sanitized generic message
 * — never show it raw). Expected conflicts come back as BAD_REQUEST / NOT_FOUND
 * with Mongolian domain messages (contract §3) and may be shown as-is.
 * Never surface raw library/DB text.
 */
import { isTRPCClientError } from "@trpc/client";

const GENERIC_MESSAGE = "Үйлдэл амжилтгүй боллоо. Дахин оролдоно уу.";

export function orderErrorMessage(error: unknown): string {
	if (isTRPCClientError(error)) {
		const code = error.data?.code;
		if (code === "BAD_REQUEST" || code === "NOT_FOUND") {
			return error.message || GENERIC_MESSAGE;
		}
	}
	return GENERIC_MESSAGE;
}
