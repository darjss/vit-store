import type { CatalogResourceNotFound, ProductError } from "@vit/shared";
import { match } from "dismatch";
import type { ErrorPresentation } from "./types";

export const presentProductError = (error: ProductError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		ProductNotFound: () => ({
			title: "Бүтээгдэхүүн олдсонгүй",
			description:
				"Энэ бүтээгдэхүүн байхгүй эсвэл холбоос нь өөрчлөгдсөн байна.",
			actions: [{ kind: "browse-products", label: "Бүтээгдэхүүн үзэх" }],
		}),
		ProductUnavailable: () => ({
			title: "Бүтээгдэхүүн түр худалдаалагдахгүй байна",
			description: "Бусад бүтээгдэхүүнээс сонгох эсвэл дараа дахин шалгана уу.",
			reassurance: "Таны сагсны бусад бараа өөрчлөгдөөгүй.",
			actions: [{ kind: "browse-products", label: "Бусад бүтээгдэхүүн үзэх" }],
		}),
		InsufficientStock: ({ requested, available }) => ({
			title: "Хүссэн тоогоор нөөц хүрэлцэхгүй байна",
			description: `Та ${requested} ширхэг сонгосон. Одоогоор ${available} ширхэг байна.`,
			reassurance: "Захиалга үүсээгүй тул төлбөр аваагүй.",
			actions: [{ kind: "go-back", label: "Тоо ширхэг засах" }],
		}),
		SearchUnavailable: ({ retryable }) => ({
			title: "Хайлтыг ачаалж чадсангүй",
			description: retryable
				? "Хайлтын үйлчилгээ түр саатлаа. Дахин оролдоно уу."
				: "Одоогоор хайлт хийх боломжгүй байна. Бүтээгдэхүүний жагсаалтаас сонгоно уу.",
			reassurance: "Саатлыг хоосон хайлтын үр дүн гэж харуулаагүй.",
			actions: retryable
				? [{ kind: "retry", label: "Дахин хайх" }]
				: [{ kind: "browse-products", label: "Жагсаалт үзэх" }],
		}),
	});

export const presentCatalogError = (
	error: CatalogResourceNotFound,
): ErrorPresentation => ({
	title: error.resource === "brand" ? "Брэнд олдсонгүй" : "Ангилал олдсонгүй",
	description:
		error.resource === "brand"
			? "Энэ брэнд байхгүй эсвэл холбоос нь өөрчлөгдсөн байна."
			: "Энэ ангилал байхгүй эсвэл холбоос нь өөрчлөгдсөн байна.",
	actions: [{ kind: "browse-products", label: "Бүтээгдэхүүн үзэх" }],
});
