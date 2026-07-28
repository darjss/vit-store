import type {
	CheckoutError,
	OrderAccessError,
	PaymentError,
	PaymentStatusType,
	TransferReconciliation,
} from "@vit/shared";
import { match } from "dismatch";

export type ErrorAction =
	| "retry"
	| "edit_cart"
	| "track_order"
	| "choose_transfer";

export type ErrorPresentation = {
	title: string;
	description: string;
	reassurance?: string;
	actions: readonly ErrorAction[];
};

export const unexpectedCommerceError: ErrorPresentation = {
	title: "Холболтын алдаа гарлаа",
	description:
		"Мэдээллийг шинэчилж чадсангүй. Түр хүлээгээд дахин оролдоно уу.",
	reassurance: "Дахин оролдох нь давхар захиалга эсвэл төлбөр үүсгэхгүй.",
	actions: ["retry", "track_order"],
};

export const checkoutErrorPresentation = (
	error: CheckoutError,
): ErrorPresentation =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		CartEmpty: () => ({
			title: "Сагс хоосон байна",
			description: "Бараагаа сагсанд нэмээд дахин оролдоно уу.",
			actions: ["edit_cart"],
		}),
		CartChanged: () => ({
			title: "Сагсны мэдээлэл шинэчлэгдлээ",
			description:
				"Тоо ширхэг өөрчлөгдсөн тул сагсаа шалгаад дахин батална уу.",
			reassurance: "Захиалга үүсээгүй.",
			actions: ["edit_cart", "retry"],
		}),
		InvalidCheckoutDetails: () => ({
			title: "Мэдээллээ шалгана уу",
			description: "Утас, хаяг болон хүргэлтийн бүсээ зөв бөглөнө үү.",
			actions: ["retry"],
		}),
		ProductUnavailable: () => ({
			title: "Бараа захиалах боломжгүй байна",
			description: "Сагснаасаа тухайн барааг хасаад өөр сонголт хийнэ үү.",
			reassurance: "Захиалга үүсээгүй.",
			actions: ["edit_cart"],
		}),
		InsufficientStock: () => ({
			title: "Үлдэгдэл хүрэлцэхгүй байна",
			description: "Сагсан дахь тоо ширхэгийг багасгаад дахин оролдоно уу.",
			reassurance: "Захиалга үүсээгүй.",
			actions: ["edit_cart", "retry"],
		}),
		DeliveryUnavailable: () => ({
			title: "Хүргэлтийн мэдээлэл бэлэн биш байна",
			description: "Түр хүлээгээд хүргэлтийн бүсээ дахин сонгоно уу.",
			actions: ["retry"],
		}),
		CheckoutKeyConflict: () => ({
			title: "Захиалгын мэдээлэл өөрчлөгдсөн байна",
			description: "Шинэ мэдээллээ шалгаад дахин захиална уу.",
			reassurance: "Өмнөх хүсэлтээр давхар захиалга үүсгэхгүй.",
			actions: ["retry", "track_order"],
		}),
		CheckoutRecoveryRequired: ({ orderNumber }) => ({
			title: "Захиалга үүссэн байна",
			description: orderNumber
				? `${orderNumber} дугаартай захиалгаа хянах хэсгээс үргэлжлүүлнэ үү.`
				: "Захиалгаа хянах хэсгээс төлөвөө шалгана уу.",
			reassurance: "Дахин төлөх эсвэл дахин захиалах шаардлагагүй.",
			actions: ["retry", "track_order"],
		}),
	});

export const paymentErrorPresentation = (
	error: PaymentError,
): ErrorPresentation =>
	match(
		error,
		"_tag",
	)<ErrorPresentation>({
		PaymentNotFound: () => ({
			title: "Төлбөр олдсонгүй",
			description:
				"Захиалгын дугаараа шалгаад хянах хэсгээс дахин оролдоно уу.",
			actions: ["track_order"],
		}),
		PaymentAccessDenied: () => ({
			title: "Төлбөрийн мэдээлэл хамгаалагдсан байна",
			description: "Захиалгад ашигласан утасны дугаараар баталгаажуулна уу.",
			actions: ["track_order"],
		}),
		PaymentAlreadyConfirmed: () => ({
			title: "Төлбөр баталгаажсан байна",
			description: "Захиалгын явцаа хянах хэсгээс харна уу.",
			reassurance: "Дахин төлөх шаардлагагүй.",
			actions: ["track_order"],
		}),
		PaymentNotPending: () => ({
			title: "Төлбөрийн төлөв өөрчлөгдсөн байна",
			description:
				"Захиалгын явцаа хянаад шаардлагатай бол өөр төлбөрийн хэлбэр сонгоно уу.",
			actions: ["track_order", "retry"],
		}),
		PaymentMethodMismatch: () => ({
			title: "Төлбөрийн хэлбэр тохирохгүй байна",
			description: "Төлбөрийн хуудсаас зөв хэлбэрээ сонгоно уу.",
			actions: ["retry", "choose_transfer"],
		}),
		PaymentProviderUnavailable: ({ retryable, fallbackMethods }) => {
			const canChooseTransfer = fallbackMethods.includes("transfer");
			return {
				title: "Төлбөрийн үйлчилгээ түр ажиллахгүй байна",
				description: canChooseTransfer
					? "Дансаар шилжүүлэх хэлбэрийг сонгож болно."
					: "Төлбөр хийсэн бол дахин төлөхгүйгээр түр хүлээгээд шалгана уу.",
				reassurance: canChooseTransfer
					? "Одоогоор төлбөр баталгаажаагүй байна."
					: "Төлбөрийн үр дүн тодорхой болтол өөр төлбөр бүү хийгээрэй.",
				actions: canChooseTransfer
					? (["choose_transfer"] as const)
					: retryable
						? (["retry"] as const)
						: (["track_order"] as const),
			};
		},
		PaymentConfirmationConflict: () => ({
			title: "Төлбөрийг шалгаж байна",
			description: "Түр хүлээгээд төлөвөө дахин шинэчилнэ үү.",
			reassurance: "Дахин төлөх шаардлагагүй.",
			actions: ["retry", "track_order"],
		}),
		BankTransactionAlreadyConsumed: () => ({
			title: "Төлбөрийг гараар шалгана",
			description: "Ажилтан банкны гүйлгээг захиалгатай тулгаж шалгана.",
			reassurance: "Одоогоор дахин шилжүүлэг хийх шаардлагагүй.",
			actions: ["track_order"],
		}),
		ManualReviewRequired: () => ({
			title: "Төлбөрийг гараар шалгаж байна",
			description: "Захиалгын төлөв шинэчлэгдэх хүртэл түр хүлээнэ үү.",
			reassurance: "Дахин төлөх шаардлагагүй.",
			actions: ["track_order", "retry"],
		}),
	});

export const orderAccessErrorPresentation = (
	error: OrderAccessError,
): ErrorPresentation =>
	error._tag === "OrderNotFound"
		? {
				title: "Захиалга олдсонгүй",
				description: "Захиалгын дугаараа шалгаад дахин оролдоно уу.",
				actions: ["retry"],
			}
		: {
				title: "Захиалгын мэдээлэл хамгаалагдсан байна",
				description: "Захиалгад ашигласан утасны дугаараар баталгаажуулна уу.",
				actions: ["retry"],
			};

type PaymentState =
	| { _tag: "pending" }
	| { _tag: "customer_claimed_paid" }
	| { _tag: "success" }
	| { _tag: "failed" };

export const paymentState = (status: PaymentStatusType): PaymentState => ({
	_tag: status,
});

export const paymentStatusCopy = (status: PaymentStatusType) =>
	match(
		paymentState(status),
		"_tag",
	)<{
		title: string;
		terminal: boolean;
		view: "waiting" | "success" | "failed";
	}>({
		pending: () => ({
			title: "Төлбөр хүлээгдэж байна",
			terminal: false,
			view: "waiting" as const,
		}),
		customer_claimed_paid: () => ({
			title: "Төлбөрийг шалгаж байна",
			terminal: false,
			view: "waiting" as const,
		}),
		success: () => ({
			title: "Төлбөр баталгаажлаа",
			terminal: true,
			view: "success" as const,
		}),
		failed: () => ({
			title: "Төлбөр амжилтгүй боллоо",
			terminal: true,
			view: "failed" as const,
		}),
	});

type ReconciliationState = {
	[K in TransferReconciliation["status"]]: { _tag: K };
}[TransferReconciliation["status"]];

export const reconciliationPresentation = (
	status: TransferReconciliation["status"],
) =>
	match(
		{ _tag: status } as ReconciliationState,
		"_tag",
	)({
		polling: () => ({ manualReview: false, terminal: false }),
		matched: () => ({ manualReview: false, terminal: false }),
		confirmed: () => ({ manualReview: false, terminal: true }),
		timeout: () => ({ manualReview: true, terminal: true }),
		auth_required: () => ({ manualReview: true, terminal: true }),
		ambiguous: () => ({ manualReview: true, terminal: true }),
		failed: () => ({ manualReview: true, terminal: true }),
	});
