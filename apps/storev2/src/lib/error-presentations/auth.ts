import type { AuthError } from "@vit/shared";
import { match } from "dismatch";
import type { ErrorPresentation } from "./types";

export const presentAuthError = (error: AuthError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		OtpSendRateLimited: ({ retryAfterSeconds }) => ({
			title: "Код авах хүсэлт түр хязгаарлагдлаа",
			description: `${retryAfterSeconds} секундын дараа дахин код авна уу.`,
			reassurance: "Таны нэвтрэх мэдээлэл өөрчлөгдөөгүй.",
			actions: [{ kind: "retry", label: "Дахин оролдох" }],
		}),
		OtpAttemptRateLimited: ({ retryAfterSeconds }) => ({
			title: "Оролдлогын тоо хэтэрлээ",
			description: `${retryAfterSeconds} секундын дараа дахин оролдоно уу.`,
			reassurance: "Таны бүртгэл хэвээр байна.",
			actions: [{ kind: "request-code", label: "Шинэ код авах" }],
		}),
		OtpInvalidOrExpired: () => ({
			title: "Код буруу эсвэл хугацаа нь дууссан",
			description: "Кодоо шалгах эсвэл шинэ код аваад дахин оролдоно уу.",
			actions: [{ kind: "request-code", label: "Шинэ код авах" }],
		}),
		OtpDeliveryUnavailable: ({ retryable }) => ({
			title: "Код илгээж чадсангүй",
			description: retryable
				? "Мессежийн үйлчилгээ түр саатлаа. Хэсэг хүлээгээд дахин оролдоно уу."
				: "Одоогоор код илгээх боломжгүй байна. Дараа дахин оролдоно уу.",
			reassurance: "Таны дугаар болон бүртгэл өөрчлөгдөөгүй.",
			actions: retryable
				? [{ kind: "retry", label: "Дахин оролдох" }]
				: [{ kind: "go-back", label: "Буцах" }],
		}),
		PhoneVerificationRequired: () => ({
			title: "Утасны дугаараа баталгаажуулна уу",
			description: "Энэ үйлдлийг хийхийн тулд кодоор нэвтэрнэ үү.",
			actions: [{ kind: "sign-in", label: "Нэвтрэх" }],
		}),
		SessionExpired: () => ({
			title: "Нэвтрэх хугацаа дууссан",
			description: "Үргэлжлүүлэхийн тулд дахин нэвтэрнэ үү.",
			reassurance: "Таны бүртгэл болон захиалгын мэдээлэл хэвээр байна.",
			actions: [{ kind: "sign-in", label: "Нэвтрэх" }],
		}),
	});
