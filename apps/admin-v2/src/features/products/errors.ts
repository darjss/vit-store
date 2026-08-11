import { TRPCClientError } from "@trpc/client";

/**
 * Map a tRPC transport error to a clear Mongolian message. Never leaks raw
 * library or DB messages: INTERNAL_SERVER_ERROR is already sanitized
 * server-side, so the UI shows a stable generic message with a retry path.
 * BAD_REQUEST messages pass through — the contract says addProduct returns a
 * typed BAD_REQUEST with a Mongolian-readable message on invalid input, and
 * the form surfaces it.
 */
export function productErrorToMessage(
	error: unknown,
	fallback: string,
): string {
	if (error instanceof TRPCClientError) {
		switch (error.data?.code) {
			case "BAD_REQUEST":
				return error.message || "Хүсэлт буруу байна. Өөрчлөлтийг шалгана уу";
			case "NOT_FOUND":
				return "Бараа олдсонгүй";
			case "UNAUTHORIZED":
				return "Нэвтрэлт дууссан. Дахин нэвтэрнэ үү";
			case "INTERNAL_SERVER_ERROR":
				return "Серверийн алдаа гарлаа. Дахин оролдоно уу";
			default:
				return error.message || fallback;
		}
	}
	return fallback;
}

export function isNotFoundError(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
}
