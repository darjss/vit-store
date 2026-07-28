import type {
	AdminOrderError,
	AiOperationError,
	CatalogMutationError,
	PaymentError,
	PurchaseError,
	UploadError,
} from "@vit/shared";
import { match } from "dismatch";
import type { ErrorPresentation } from "./types";

export const presentCatalogError = (error: CatalogMutationError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		ResourceNotFound: () => ({
			title: "Мэдээлэл олдсонгүй",
			description: "Мэдээлэл устсан эсвэл өөр хэрэглэгч шинэчилсэн байна.",
			actions: ["refresh", "go-back"],
		}),
		DuplicateResource: () => ({
			title: "Давхардсан мэдээлэл",
			description:
				"Ижил мэдээлэл өмнө нь бүртгэгдсэн байна. Утгыг өөрчилнө үү.",
			actions: ["edit"],
		}),
		DeleteBlocked: () => ({
			title: "Устгах боломжгүй",
			description: "Энэ мэдээлэл бусад бүртгэлд ашиглагдаж байна.",
			reassurance: "Одоогийн мэдээлэл өөрчлөгдөөгүй.",
			actions: ["go-back"],
		}),
		InvalidCatalogState: () => ({
			title: "Мэдээллээ шалгана уу",
			description: "Оруулсан утгуудын заримыг энэ төлөвт хадгалах боломжгүй.",
			actions: ["edit"],
		}),
		StockConflict: () => ({
			title: "Нөөц өөрчлөгдсөн байна",
			description: "Хамгийн сүүлийн нөөцийг ачаалаад дахин оролдоно уу.",
			actions: ["refresh", "retry"],
		}),
		ConcurrentUpdate: () => ({
			title: "Зэрэг шинэчлэлт хийгдлээ",
			description: "Шинэ мэдээллийг ачаалаад өөрчлөлтөө дахин хийнэ үү.",
			actions: ["refresh", "retry"],
		}),
	});

export const presentAdminOrderError = (error: AdminOrderError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		OrderNotFound: () => ({
			title: "Захиалга олдсонгүй",
			description: "Захиалга устсан эсвэл өөр хэрэглэгч шинэчилсэн байна.",
			actions: ["refresh", "go-back"],
		}),
		InvalidOrderTransition: () => ({
			title: "Төлөв солих боломжгүй",
			description: "Захиалгын одоогийн төлөв энэ үйлдлийг зөвшөөрөхгүй байна.",
			reassurance: "Захиалгын төлөв өөрчлөгдөөгүй.",
			actions: ["refresh"],
		}),
		StockConflict: () => ({
			title: "Нөөц хүрэлцэхгүй байна",
			description: "Зарим барааны нөөц өөрчлөгдсөн тул захиалгыг хадгалсангүй.",
			reassurance: "Нөөц болон борлуулалтын өөрчлөлтийг буцаасан.",
			actions: ["refresh", "edit"],
		}),
		DeliverySubmissionFailed: ({ retryable }) => ({
			title: "Хүргэлтэд илгээж чадсангүй",
			description: retryable
				? "Хүргэлтийн үйлчилгээ түр хариу өгөхгүй байна. Дахин оролдоно уу."
				: "Хүргэлтийн мэдээллийг шалгаад дахин илгээнэ үү.",
			reassurance: "Захиалгыг илгээгдсэн гэж тэмдэглээгүй.",
			actions: retryable ? ["retry", "go-back"] : ["edit", "go-back"],
		}),
		BatchPartiallyFailed: ({ failures, succeeded, total }) => ({
			title: "Багц үйлдэл хэсэгчлэн дууслаа",
			description: `${total}-с ${succeeded} амжилттай, ${failures.length} амжилтгүй боллоо.`,
			reassurance: "Амжилттай мөрүүдийг дахин ажиллуулахгүй.",
			actions: ["refresh", "retry"],
		}),
	});

export const presentPurchaseError = (error: PurchaseError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		PurchaseNotFound: () => ({
			title: "Худалдан авалт олдсонгүй",
			description: "Бүртгэл устсан эсвэл өөр хэрэглэгч шинэчилсэн байна.",
			actions: ["refresh", "go-back"],
		}),
		PurchaseItemNotFound: () => ({
			title: "Барааны мөр олдсонгүй",
			description: "Жагсаалтыг шинэчлээд өөрчлөлтөө дахин хийнэ үү.",
			actions: ["refresh", "edit"],
		}),
		CannotRemoveReceivedItem: () => ({
			title: "Хүлээн авсан барааг хасах боломжгүй",
			description: "Хүлээн авалттай мөрийг хадгалж, бусад утгыг засна уу.",
			reassurance: "Худалдан авалт өөрчлөгдөөгүй.",
			actions: ["edit"],
		}),
		OrderedQuantityBelowReceived: ({ received }) => ({
			title: "Захиалсан тоо хэт бага байна",
			description: `Хамгийн багадаа хүлээн авсан ${received} ширхэгээр хадгална уу.`,
			reassurance: "Хүлээн авалтын бүртгэл өөрчлөгдөөгүй.",
			actions: ["edit"],
		}),
		CancelledPurchaseCannotReceive: () => ({
			title: "Цуцалсан худалдан авалт",
			description: "Цуцалсан бүртгэлд хүлээн авалт нэмэх боломжгүй.",
			actions: ["go-back"],
		}),
		ReceiptItemsMismatch: () => ({
			title: "Барааны жагсаалт өөрчлөгдсөн байна",
			description:
				"Худалдан авалтыг шинэчлээд хүлээн авалтаа дахин оруулна уу.",
			reassurance: "Хүлээн авалт болон нөөцөд өөрчлөлт ороогүй.",
			actions: ["refresh", "retry"],
		}),
		ReceiptExceedsRemaining: ({ remaining }) => ({
			title: "Үлдсэн тооноос их байна",
			description: `Энэ мөрөөс хамгийн ихдээ ${remaining} ширхэг хүлээн авч болно.`,
			reassurance: "Хүлээн авалт болон нөөцөд өөрчлөлт ороогүй.",
			actions: ["edit"],
		}),
		CannotDeletePurchaseWithReceipts: () => ({
			title: "Устгах боломжгүй",
			description: "Хүлээн авалттай худалдан авалтыг хадгалах шаардлагатай.",
			reassurance: "Одоогийн бүртгэл өөрчлөгдөөгүй.",
			actions: ["go-back"],
		}),
		InvalidPurchaseTransition: () => ({
			title: "Төлөв солих боломжгүй",
			description:
				"Худалдан авалтын одоогийн төлөв энэ үйлдлийг зөвшөөрөхгүй байна.",
			actions: ["refresh", "go-back"],
		}),
	});

export const presentPaymentError = (error: PaymentError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		PaymentNotFound: () => ({
			title: "Төлбөр олдсонгүй",
			description: "Төлбөрийн жагсаалтыг шинэчлээд дахин шалгана уу.",
			actions: ["refresh", "go-back"],
		}),
		PaymentAccessDenied: () => ({
			title: "Хандах эрхгүй",
			description: "Энэ төлбөрийг шалгах эрх таны бүртгэлд байхгүй байна.",
			actions: ["go-back"],
		}),
		PaymentAlreadyConfirmed: () => ({
			title: "Төлбөр баталгаажсан байна",
			description: "Энэ төлбөрийг дахин баталгаажуулах шаардлагагүй.",
			reassurance: "Захиалгын төлбөр амжилттай хэвээр байна.",
			actions: ["refresh", "go-back"],
		}),
		PaymentNotPending: () => ({
			title: "Төлбөрийн төлөв өөрчлөгдсөн",
			description: "Хамгийн сүүлийн төлөвийг ачаалаад дахин шалгана уу.",
			actions: ["refresh"],
		}),
		PaymentMethodMismatch: () => ({
			title: "Төлбөрийн арга тохирохгүй байна",
			description: "Сонгосон төлбөрийн аргад тохирох үйлдэл хийнэ үү.",
			actions: ["go-back"],
		}),
		PaymentProviderUnavailable: ({ retryable }) => ({
			title: "Төлбөрийн үйлчилгээ ажиллахгүй байна",
			description: retryable
				? "Түр хүлээгээд дахин оролдоно уу."
				: "Өөр төлбөрийн арга сонгоно уу.",
			actions: retryable ? ["retry", "go-back"] : ["go-back"],
		}),
		PaymentConfirmationConflict: ({ retryable }) => ({
			title: "Төлбөрийг баталгаажуулж чадсангүй",
			description: "Төлбөрийн төлөв зэрэг өөрчлөгдсөн байна.",
			reassurance: "Давхар баталгаажуулалт хийгдээгүй.",
			actions: retryable ? ["retry", "refresh"] : ["refresh"],
		}),
		BankTransactionAlreadyConsumed: () => ({
			title: "Гүйлгээ аль хэдийн ашиглагдсан",
			description: "Энэ гүйлгээг өөр захиалгатай тулгаж баталгаажуулсан байна.",
			reassurance: "Одоогийн төлбөрийг баталгаажуулаагүй.",
			actions: ["go-back"],
		}),
		ManualReviewRequired: () => ({
			title: "Гараар шалгах шаардлагатай",
			description: "Төлбөрийн баримт болон захиалгыг харьцуулж шалгана уу.",
			actions: ["go-back"],
		}),
	});

export const presentAiError = (error: AiOperationError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		InvalidSource: () => ({
			title: "Эх сурвалж олдсонгүй",
			description: "Холбоос эсвэл зургийг шалгаад дахин оруулна уу.",
			actions: ["edit", "retry"],
		}),
		ExtractionFailed: ({ retryable }) => ({
			title: "Мэдээлэл ялгаж чадсангүй",
			description: retryable
				? "Үйлчилгээ түр хариу өгөхгүй байна. Дахин оролдоно уу."
				: "Өөр эх сурвалж ашиглана уу.",
			actions: retryable ? ["retry", "edit"] : ["edit"],
		}),
		InvalidModelOutput: () => ({
			title: "AI мэдээлэл дутуу байна",
			description: "Өөр зураг эсвэл холбоосоор дахин оролдоно уу.",
			actions: ["edit", "retry"],
		}),
		ProductResolutionRequired: ({ lines }) => ({
			title: "Бүтээгдэхүүн сонгох шаардлагатай",
			description: `${lines.length} мөрийн бүтээгдэхүүнийг тохируулсны дараа хадгална уу.`,
			reassurance: "Худалдан авалтыг хараахан хадгалаагүй.",
			actions: ["edit"],
		}),
		NoUsableImages: () => ({
			title: "Ашиглах зураг олдсонгүй",
			description: "Илүү тод зураг эсвэл өөр холбоос сонгоно уу.",
			actions: ["edit", "retry"],
		}),
		ProviderUnavailable: ({ retryable }) => ({
			title: "AI үйлчилгээ ажиллахгүй байна",
			description: retryable
				? "Түр хүлээгээд дахин оролдоно уу."
				: "Үйлчилгээний тохиргоог шалгана уу.",
			actions: retryable ? ["retry", "go-back"] : ["go-back"],
		}),
	});

export const presentUploadError = (error: UploadError) =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		ImageRequired: () => ({
			title: "Зураг сонгоно уу",
			description: "Үргэлжлүүлэхийн өмнө дор хаяж нэг зураг нэмнэ үү.",
			actions: ["edit"],
		}),
		UnsupportedImageType: () => ({
			title: "Зургийн төрөл дэмжигдэхгүй",
			description: "Дэмжигдсэн төрлийн зураг сонгоно уу.",
			actions: ["edit"],
		}),
		ImageTooLarge: () => ({
			title: "Зураг хэт том байна",
			description: "Зургийн хэмжээг багасгаад дахин оруулна уу.",
			actions: ["edit"],
		}),
		TooManyImages: () => ({
			title: "Хэт олон зураг сонгосон",
			description: "Зургийн тоог багасгаад дахин оролдоно уу.",
			actions: ["edit"],
		}),
		ImageFetchFailed: ({ retryable }) => ({
			title: "Зургийг татаж чадсангүй",
			description: "Эх холбоосыг шалгаад дахин оролдоно уу.",
			actions: retryable ? ["retry", "edit"] : ["edit"],
		}),
		ImageTransformFailed: () => ({
			title: "Зургийг боловсруулж чадсангүй",
			description: "Өөр зураг сонгоно уу.",
			actions: ["edit"],
		}),
		StorageUnavailable: ({ retryable }) => ({
			title: "Зураг хадгалж чадсангүй",
			description: retryable
				? "Хадгалах үйлчилгээ түр ажиллахгүй байна. Дахин оролдоно уу."
				: "Хадгалах үйлчилгээний тохиргоог шалгана уу.",
			actions: retryable ? ["retry", "go-back"] : ["go-back"],
		}),
	});
