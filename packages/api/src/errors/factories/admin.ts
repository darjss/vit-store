import type {
	AdminBatchFailure,
	AdminCatalogResource,
	AdminOrderError,
	AiOperationError,
	CatalogMutationError,
	PaymentError,
	PurchaseError,
	UploadError,
} from "@vit/shared";

export const catalogResourceNotFound = (
	resource: AdminCatalogResource,
	id: number | string,
) =>
	({
		_tag: "ResourceNotFound",
		resource,
		id,
		message: "Хүссэн мэдээлэл олдсонгүй.",
	}) satisfies CatalogMutationError;

export const duplicateCatalogResource = (
	resource: AdminCatalogResource,
	field: string,
) =>
	({
		_tag: "DuplicateResource",
		resource,
		field,
		message: "Ижил мэдээлэл өмнө нь бүртгэгдсэн байна.",
	}) satisfies CatalogMutationError;

export const catalogDeleteBlocked = (
	resource: AdminCatalogResource,
	reason: "has-products" | "has-orders" | "has-receipts" | "in-use",
) =>
	({
		_tag: "DeleteBlocked",
		resource,
		reason,
		message: "Энэ мэдээлэл ашиглагдаж байгаа тул устгах боломжгүй.",
	}) satisfies CatalogMutationError;

export const invalidCatalogState = (
	resource: AdminCatalogResource,
	reason:
		| "missing-id"
		| "invalid-image-url"
		| "image-not-owned-by-product"
		| "invalid-stock",
) =>
	({
		_tag: "InvalidCatalogState",
		resource,
		reason,
		message: "Оруулсан мэдээллийг энэ төлөвт хадгалах боломжгүй.",
	}) satisfies CatalogMutationError;

export const catalogStockConflict = (productId: number, available?: number) =>
	({
		_tag: "StockConflict",
		productId,
		...(available === undefined ? {} : { available }),
		message: "Бүтээгдэхүүний нөөц зэрэг өөрчлөгдсөн байна.",
	}) satisfies CatalogMutationError;

export const purchaseNotFound = () =>
	({
		_tag: "PurchaseNotFound",
		message: "Худалдан авалт олдсонгүй.",
	}) satisfies PurchaseError;

export const purchaseItemNotFound = () =>
	({
		_tag: "PurchaseItemNotFound",
		message: "Худалдан авалтын бараа олдсонгүй.",
	}) satisfies PurchaseError;

export const cannotRemoveReceivedItem = () =>
	({
		_tag: "CannotRemoveReceivedItem",
		message: "Хүлээн авсан барааг худалдан авалтаас хасах боломжгүй.",
	}) satisfies PurchaseError;

export const orderedQuantityBelowReceived = (received: number) =>
	({
		_tag: "OrderedQuantityBelowReceived",
		received,
		message: "Захиалсан тоо нь хүлээн авсан тооноос бага байж болохгүй.",
	}) satisfies PurchaseError;

export const cancelledPurchaseCannotReceive = () =>
	({
		_tag: "CancelledPurchaseCannotReceive",
		message: "Цуцалсан худалдан авалтад хүлээн авалт бүртгэх боломжгүй.",
	}) satisfies PurchaseError;

export const receiptItemsMismatch = () =>
	({
		_tag: "ReceiptItemsMismatch",
		message: "Хүлээн авах барааны жагсаалт худалдан авалттай тохирохгүй байна.",
	}) satisfies PurchaseError;

export const receiptExceedsRemaining = (remaining: number) =>
	({
		_tag: "ReceiptExceedsRemaining",
		remaining,
		message: "Үлдсэн тооноос их бараа хүлээн авах боломжгүй.",
	}) satisfies PurchaseError;

export const cannotDeletePurchaseWithReceipts = () =>
	({
		_tag: "CannotDeletePurchaseWithReceipts",
		message: "Хүлээн авалттай худалдан авалтыг устгах боломжгүй.",
	}) satisfies PurchaseError;

export const orderNotFound = () =>
	({
		_tag: "OrderNotFound",
		message: "Захиалга олдсонгүй.",
	}) satisfies AdminOrderError;

export const invalidOrderTransition = (
	from:
		| "created"
		| "pending"
		| "shipped"
		| "delivered"
		| "cancelled"
		| "refunded",
	to:
		| "created"
		| "pending"
		| "shipped"
		| "delivered"
		| "cancelled"
		| "refunded",
) =>
	({
		_tag: "InvalidOrderTransition",
		from,
		to,
		message: "Захиалгыг энэ төлөвт шилжүүлэх боломжгүй.",
	}) satisfies AdminOrderError;

export const orderStockConflict = (
	items: Array<{ productId: number; requested: number; available?: number }>,
) =>
	({
		_tag: "StockConflict",
		items,
		message: "Зарим барааны нөөц хүрэлцэхгүй эсвэл өөрчлөгдсөн байна.",
	}) satisfies AdminOrderError;

export const deliverySubmissionFailed = (retryable: boolean) =>
	({
		_tag: "DeliverySubmissionFailed",
		retryable,
		message: "Хүргэлтийн системд захиалга илгээж чадсангүй.",
	}) satisfies AdminOrderError;

export const batchPartiallyFailed = (
	total: number,
	succeeded: number,
	failures: AdminBatchFailure[],
) =>
	({
		_tag: "BatchPartiallyFailed",
		total,
		succeeded,
		failures,
		message: "Багц үйлдлийн зарим хэсгийг гүйцэтгэж чадсангүй.",
	}) satisfies AdminOrderError;

export const paymentNotFound = () =>
	({
		_tag: "PaymentNotFound",
		message: "Төлбөр олдсонгүй.",
	}) satisfies PaymentError;

export const paymentAlreadyConfirmed = (orderNumber?: string) =>
	({
		_tag: "PaymentAlreadyConfirmed",
		...(orderNumber ? { orderNumber } : {}),
		message: "Төлбөр аль хэдийн баталгаажсан байна.",
	}) satisfies PaymentError;

export const paymentNotPending = (
	status: "pending" | "customer_claimed_paid" | "success" | "failed",
) =>
	({
		_tag: "PaymentNotPending",
		status,
		message: "Төлбөр хүлээгдэж буй төлөвт биш байна.",
	}) satisfies PaymentError;

export const paymentMethodMismatch = (
	expected: "qpay" | "transfer" | "cash",
	actual: "qpay" | "transfer" | "cash",
) =>
	({
		_tag: "PaymentMethodMismatch",
		expected,
		actual,
		message: "Төлбөрийн арга тохирохгүй байна.",
	}) satisfies PaymentError;

export const bankTransactionAlreadyConsumed = () =>
	({
		_tag: "BankTransactionAlreadyConsumed",
		message: "Банкны гүйлгээ өөр захиалгад ашиглагдсан байна.",
	}) satisfies PaymentError;

export const paymentConfirmationConflict = (retryable = false) =>
	({
		_tag: "PaymentConfirmationConflict",
		retryable,
		message:
			"Төлбөр аль хэдийн баталгаажсан эсвэл хүлээгдэж буй төлөвт биш байна.",
	}) satisfies PaymentError;

export const aiInvalidSource = () =>
	({
		_tag: "InvalidSource",
		message: "Эх сурвалжийн холбоос эсвэл зураг хүчинтэй биш байна.",
	}) satisfies AiOperationError;

export const aiExtractionFailed = (retryable: boolean) =>
	({
		_tag: "ExtractionFailed",
		retryable,
		message: "Мэдээллийг эх сурвалжаас ялгаж чадсангүй.",
	}) satisfies AiOperationError;

export const aiInvalidModelOutput = () =>
	({
		_tag: "InvalidModelOutput",
		message: "AI-ийн буцаасан мэдээллийг баталгаажуулж чадсангүй.",
	}) satisfies AiOperationError;

export const aiProductResolutionRequired = (lines: number[]) =>
	({
		_tag: "ProductResolutionRequired",
		lines,
		message: "Зарим мөрийн бүтээгдэхүүнийг сонгох шаардлагатай.",
	}) satisfies AiOperationError;

export const aiNoUsableImages = () =>
	({
		_tag: "NoUsableImages",
		message: "Ашиглах боломжтой бүтээгдэхүүний зураг олдсонгүй.",
	}) satisfies AiOperationError;

export const aiProviderUnavailable = (retryable: boolean) =>
	({
		_tag: "ProviderUnavailable",
		retryable,
		message: "AI үйлчилгээ түр ажиллахгүй байна.",
	}) satisfies AiOperationError;

export const uploadImageFetchFailed = (index: number, retryable: boolean) =>
	({
		_tag: "ImageFetchFailed",
		index,
		retryable,
		message: "Зургийг эх сурвалжаас татаж чадсангүй.",
	}) satisfies UploadError;

export const uploadStorageUnavailable = (retryable: boolean) =>
	({
		_tag: "StorageUnavailable",
		retryable,
		message: "Зураг хадгалах үйлчилгээ түр ажиллахгүй байна.",
	}) satisfies UploadError;
