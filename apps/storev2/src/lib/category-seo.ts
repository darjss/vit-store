export type CategoryFaq = {
	answer: string;
	question: string;
};

/** Code-only FAQs for high-intent hubs. Title, description, and intro come from the DB. */
export const CATEGORY_FAQS = {
	"magni-ba-erdes": [
		{
			answer:
				"Үнэ брэндийн тун, капсулын тооноос хамаарна. Энэ ангиллын бүтээгдэхүүнүүдийн үнийг картан дээр шууд харна. Хямдралтай байвал бүтээгдэхүүн бүрийн хуудас дээр харагдана.",
			question: "Magnesium glycinate Монголд хэдэн төгрөг вэ?",
		},
		{
			answer:
				"Өөр өөр давс/хэлбэр нь шингээлт, ходоодны мэдрэмж, зориулалтаар ялгаатай гэж үздэг. Жишээ нь glycinate-ийг олон хүн нойр/тайвшралын зорилгоор, malate-ийг өдрийн эрч хүчинд сонгодог. Өөрт тохирохыг шошго, эмчийн зөвлөгөөгөөр шийднэ.",
			question: "Glycinate, malate, citrate юугаараа ялгаатай вэ?",
		},
		{
			answer:
				"Тийм, хүүхдэд зориулсан шингэн/дусал хэлбэрийн магни бүтээгдэхүүн энэ ангилалд байж болно. Нас, тунг шошгоноос шалгаж, хүүхдийн эмчид хандана уу.",
			question: "Хүүхдийн магни дусал байдаг уу?",
		},
	],
	"omega-ba-toson-khuchil": [
		{
			answer:
				"Америк Витамин дээрх Омега ба Тосон Хүчил ангиллаас fish oil, omega-3 нэмэлтийг захиалж, Монголд хүргүүлнэ.",
			question: "Fish oil / омега-3-г Монголд хаанаас авах вэ?",
		},
		{
			answer:
				"Nordic Naturals-ийн түгээмэл omega-3 fish oil бүтээгдэхүүн. Softgel тоо, EPA/DHA-г бүтээгдэхүүн бүрийн хуудаснаас харна. Брэндийн бусад бүтээгдэхүүнийг /products/brand/nordic-naturals/1 хаягаас үзнэ.",
			question: "Nordic Naturals Ultimate Omega гэж юу вэ?",
		},
		{
			answer:
				"Omega-3-ийн гол тосны хүчлүүд. Бүтээгдэхүүн бүрийн шошго дээр serving-д ногдох EPA/DHA мг-ыг бичсэн байдаг — харьцуулахдаа нийт softgel тооноос илүү энэ тоог хар.",
			question: "EPA болон DHA гэж юу вэ?",
		},
	],
	"vitamin-c": [
		{
			answer:
				"Тийм. Америк Витамин дээрх энэ ангиллаас витамин C нэмэлтийг онлайн захиалж, Монголд хүргүүлнэ.",
			question: "Витамин C-г Монголд худалдаж авч болох уу?",
		},
		{
			answer:
				"Олон нэмэлт витамин C-г цайр (zinc)-тай хослуулдаг. Дархлааг дэмжих зорилгоор түгээмэл сонголт. Найрлага, мг-ыг бүтээгдэхүүн бүрийн хуудаснаас шалгаарай.",
			question: "Витамин C + Zinc гэж юу вэ?",
		},
		{
			answer:
				"Liposomal хэлбэр нь өөхөнд уусдаг хүргэлтийн технологийг ашигладаг гэж үйлдвэрлэгчид тайлбарладаг. Сонголт нь таны хэрэгцээ, төсвөөс хамаарна.",
			question: "Liposomal vitamin C ялгаатай юу?",
		},
	],
	"vitamin-d": [
		{
			answer:
				"Америк Витамин дэлгүүрээс АНУ-ын брэндүүдийн витамин D3, D3+K2-г онлайн захиалж, Монголд хүргүүлэх боломжтой. Энэ ангилалд тун, хэлбэр (капсул, softgel, дусал)-аар шүүж сонгоно.",
			question: "Витамин D-г Монголд хаанаас авах вэ?",
		},
		{
			answer:
				"D3 нь витамин D-ийн идэвхтэй хэлбэр. K2 (ихэвчлэн MK-7) нь кальцийн тэнцвэртэй шингээлтийг дэмжих зорилгоор D3-тай хамт санал болгодог. Аль нь тохирохыг бүтээгдэхүүн бүрийн шошго, эмчийн зөвлөгөөгөөр шийднэ.",
			question: "D3 болон D3+K2 юугаараа ялгаатай вэ?",
		},
		{
			answer:
				"Өндөр тунтай D3 бүтээгдэхүүнүүд байдаг. Өдөр тутмын бага тунгаас ялгаатай тул хэрэглэх давтамж, зааврыг бүтээгдэхүүн бүрийн шошгоноос шалгаарай. Өөрөө тунг нэмэхээс өмнө эмчид хандана уу.",
			question: "Витамин D 50000 IU гэж юу вэ?",
		},
	],
} satisfies Record<string, Array<CategoryFaq>>;

const DEFAULT_INTRO = (name: string) =>
	`${name} ангиллын АНУ-ын витамин, нэмэлт тэжээлүүдийг Америк Витамин дэлгүүрээс сонгон захиалаарай. Бүтээгдэхүүн бүрийн найрлага, хэмжээ, үнэ болон брэндийг харьцуулж өөрт тохирох сонголтоо олоорой.`;

function introParagraphs(description: string | null | undefined, name: string) {
	const trimmed = description?.trim();
	if (!trimmed) {
		return [DEFAULT_INTRO(name)];
	}
	const paragraphs = trimmed
		.split(/\n\n+/)
		.map((p) => p.trim())
		.filter(Boolean);
	return paragraphs.length > 0 ? paragraphs : [DEFAULT_INTRO(name)];
}

export function resolveCategorySeo(input: {
	description?: string | null;
	name: string;
	page: number;
	seoDescription?: string | null;
	seoTitle?: string | null;
	slug: string;
	totalCount: number;
	totalPages: number;
}) {
	const pageSuffix = input.page > 1 ? ` Хуудас ${input.page}/${input.totalPages}.` : "";

	const seoTitle =
		input.page === 1
			? input.seoTitle || `${input.name} - Витамин, нэмэлт тэжээл`
			: `${input.name} - Хуудас ${input.page}`;

	const seoDescription =
		input.seoDescription ||
		`${input.name} ангилалд ${input.totalCount} бүтээгдэхүүн байна.${pageSuffix}`;

	const intro = input.page === 1 ? introParagraphs(input.description, input.name) : [];
	const faqs = input.page === 1 ? (CATEGORY_FAQS[input.slug] ?? []) : [];

	return { faqs, intro, seoDescription, seoTitle };
}
