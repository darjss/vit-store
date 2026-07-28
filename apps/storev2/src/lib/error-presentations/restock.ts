import type { RestockError } from "@vit/shared";
import { match } from "dismatch";
import type { ErrorPresentation } from "./types";

export const presentRestockError = (error: RestockError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		InvalidContact: ({ channel }) => ({
			title:
				channel === "sms"
					? "Утасны дугаар буруу байна"
					: "Имэйл хаяг буруу байна",
			description: "Мэдээллээ шалгаад дахин оролдоно уу.",
			actions: [{ kind: "edit-contact", label: "Мэдээлэл засах" }],
		}),
		ContactNotVerified: () => ({
			title: "Утасны дугаар баталгаажаагүй байна",
			description:
				"Мэдэгдэл авахын тулд энэ дугаараар код ашиглан нэвтэрнэ үү.",
			actions: [{ kind: "sign-in", label: "Нэвтрэх" }],
		}),
		SubscriptionLimitReached: () => ({
			title: "Мэдэгдлийн захиалгын хязгаарт хүрлээ",
			description:
				"Одоо бүртгэлтэй бүтээгдэхүүний мэдэгдэл ирсний дараа дахин оролдоно уу.",
			reassurance: "Өмнөх мэдэгдлийн захиалгууд хэвээр байна.",
			actions: [{ kind: "browse-products", label: "Бүтээгдэхүүн үзэх" }],
		}),
		RestockRateLimited: ({ retryAfterSeconds }) => ({
			title: "Хүсэлт түр хязгаарлагдлаа",
			description: `${retryAfterSeconds} секундын дараа дахин оролдоно уу.`,
			reassurance: "Өмнө амжилттай бүртгүүлсэн мэдэгдэл хэвээр байна.",
			actions: [{ kind: "retry", label: "Дахин оролдох" }],
		}),
		ProductNotFound: () => ({
			title: "Бүтээгдэхүүн олдсонгүй",
			description:
				"Хуудас хуучирсан байж магадгүй. Бүтээгдэхүүний жагсаалт руу буцна уу.",
			actions: [{ kind: "browse-products", label: "Жагсаалт үзэх" }],
		}),
		ProductAlreadyInStock: () => ({
			title: "Бүтээгдэхүүн нөөцөд байна",
			description:
				"Мэдэгдэл хүлээх шаардлагагүй. Та бүтээгдэхүүнийг одоо сагсалж болно.",
			actions: [{ kind: "go-back", label: "Бүтээгдэхүүн рүү буцах" }],
		}),
	});
