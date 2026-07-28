import type {
	AuthError,
	LoginError,
	SendOtpError,
	SessionError,
} from "@vit/shared";

export const authErrors = {
	otpSendRateLimited: (retryAfterSeconds: number) =>
		({
			_tag: "OtpSendRateLimited",
			retryAfterSeconds,
		}) satisfies SendOtpError,
	otpAttemptRateLimited: (retryAfterSeconds: number) =>
		({
			_tag: "OtpAttemptRateLimited",
			retryAfterSeconds,
		}) satisfies LoginError,
	otpInvalidOrExpired: () =>
		({ _tag: "OtpInvalidOrExpired" }) satisfies LoginError,
	otpDeliveryUnavailable: (retryable: boolean) =>
		({ _tag: "OtpDeliveryUnavailable", retryable }) satisfies SendOtpError,
	phoneVerificationRequired: () =>
		({ _tag: "PhoneVerificationRequired" }) satisfies AuthError,
	sessionExpired: () => ({ _tag: "SessionExpired" }) satisfies SessionError,
};
