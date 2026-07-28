import { match } from "dismatch";
import * as v from "valibot";

export const assistantCheckoutErrorSchema = v.variant("_tag", [
	v.strictObject({ _tag: v.literal("CheckoutNotStarted") }),
	v.strictObject({ _tag: v.literal("CartNotConfirmed") }),
	v.strictObject({ _tag: v.literal("InvalidPhone") }),
	v.strictObject({ _tag: v.literal("AddressRequired") }),
	v.strictObject({ _tag: v.literal("DeliveryZoneNotSelected") }),
	v.strictObject({ _tag: v.literal("CheckoutAlreadyCreating") }),
	v.strictObject({ _tag: v.literal("SummaryNotConfirmed") }),
	v.strictObject({
		_tag: v.literal("OrderCreationFailed"),
		retryable: v.boolean(),
		recovery: v.variant("_tag", [
			v.strictObject({ _tag: v.literal("Retry") }),
			v.strictObject({ _tag: v.literal("CheckOrderHistory") }),
			v.strictObject({ _tag: v.literal("ContactSupport") }),
		]),
	}),
]);

export type AssistantCheckoutError = v.InferOutput<
	typeof assistantCheckoutErrorSchema
>;

export const assistantCheckoutErrorMessage = (error: AssistantCheckoutError) =>
	match(
		error,
		"_tag",
	)<string>({
		CheckoutNotStarted: () =>
			"Эхлээд захиалга баталгаажуулъя. Сагсаа баталгаажуулсны дараа утасны дугаараа өгнө үү.",
		CartNotConfirmed: () =>
			"Захиалга эхлүүлэхийн өмнө сагсаа баталгаажуулна уу.",
		InvalidPhone: () =>
			"Утасны дугаар буруу байна. 8 оронтой, 6-9-өөр эхэлсэн дугаараа бичнэ үү (ж: 99112233).",
		AddressRequired: () =>
			"Хүргэлтийн хаягаа бичнэ үү (дүүрэг, хороо, байр/тоот).",
		DeliveryZoneNotSelected: () =>
			"Хүргэлтийн бүс сонгогдоогүй байна. Санал болгосон жагсаалтаас сонгоно уу.",
		CheckoutAlreadyCreating: () =>
			"Захиалга үүсэж байна. Давхар захиалга үүсгэхгүйн тулд түр хүлээнэ үү.",
		SummaryNotConfirmed: () => "Захиалгын мэдээллээ шалгаад баталгаажуулна уу.",
		OrderCreationFailed: ({ recovery }) =>
			match(
				recovery,
				"_tag",
			)<string>({
				Retry: () =>
					"Захиалга үүссэнгүй. Мэдээллээ өөрчлөхгүйгээр дахин оролдоно уу.",
				CheckOrderHistory: () =>
					"Хариу тодорхойгүй байна. Давхар захиалга үүсгэхгүйн тулд захиалгын түүхээ шалгана уу.",
				ContactSupport: () =>
					"Захиалга үүсгэх боломжгүй байна. Дэмжлэгтэй холбогдоно уу.",
			}),
	});

export const aiOperationErrorSchema = v.variant("_tag", [
	v.strictObject({ _tag: v.literal("InvalidSource") }),
	v.strictObject({
		_tag: v.literal("ExtractionFailed"),
		retryable: v.boolean(),
	}),
	v.strictObject({ _tag: v.literal("InvalidModelOutput") }),
	v.strictObject({
		_tag: v.literal("ProductResolutionRequired"),
		lines: v.array(v.pipe(v.number(), v.integer(), v.minValue(0))),
	}),
	v.strictObject({ _tag: v.literal("NoUsableImages") }),
	v.strictObject({
		_tag: v.literal("ProviderUnavailable"),
		retryable: v.boolean(),
	}),
]);

export type AiOperationError = v.InferOutput<typeof aiOperationErrorSchema>;
