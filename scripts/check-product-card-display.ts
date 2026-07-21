import { projectProductCardDisplay } from "../packages/shared/src/domain/product/card-display";

type SourceProduct = {
	name: string;
	brand: string;
	potency?: string;
	amount?: string;
};

const source = (await Bun.file(
	new URL(
		"../packages/api/products-translated-final-final.json",
		import.meta.url,
	),
).json()) as SourceProduct[];

const project = (product: SourceProduct) =>
	projectProductCardDisplay({
		name: product.name,
		brand: product.brand,
		potency: product.potency,
		amount: product.amount,
	});

const byName = (name: string) => {
	const product = source.find((candidate) => candidate.name === name);
	if (!product) throw new Error(`Missing source fixture: ${name}`);
	return { product, display: project(product) };
};

const byAmount = (amount: string) => {
	const product = source.find((candidate) => candidate.amount === amount);
	if (!product) throw new Error(`Missing amount fixture: ${amount}`);
	return { product, display: project(product) };
};

const d3Names = [
	"Micro Ingredients Vitamin D3 1,000 IU + K2 MK-7 25 mcg, 300 Softgels",
	"Micro Ingredients Vitamin D3 2,000 IU + K2 MK-7 50 mcg, 300 Softgels",
	"Micro Ingredients Vitamin D3 10,000 IU + K2 MK-7 200 mcg, 300 Softgels",
] as const;
const d3Cards = d3Names.map(byName);
if (
	new Set(d3Cards.map(({ display }) => display.accessibleName)).size !==
	d3Cards.length
) {
	throw new Error("Near-identical D3/K2 variants are not distinct");
}

const fixtureChecks: Array<{
	label: string;
	card: ReturnType<typeof byName>;
	check: (display: ReturnType<typeof project>) => boolean;
}> = [
	{
		label: "weight package",
		card: byAmount("2 Pounds"),
		check: (display) =>
			display.packageQuantity === "2 Pounds" &&
			display.count === undefined &&
			display.form === "Нунтаг",
	},
	{
		label: "metric powder package",
		card: byAmount("500 Grams"),
		check: (display) =>
			display.packageQuantity === "500 Grams" && display.form === "Нунтаг",
	},
	{
		label: "liquid volume",
		card: byAmount("16 fl oz"),
		check: (display) =>
			display.packageQuantity === "16 fl oz" &&
			display.count === undefined &&
			display.form === "Шингэн",
	},
	{
		label: "item count distinct from bottle volume",
		card: byAmount("365 Drops (10.3 mL)"),
		check: (display) =>
			display.count === "365" &&
			display.form === "Дусал" &&
			display.packageQuantity === "(10.3 mL)",
	},
	{
		label: "lozenges",
		card: byAmount("60 Lozenges"),
		check: (display) =>
			display.count === "60" && display.form === "Хүлхдэг шахмал",
	},
	{
		label: "pills",
		card: byAmount("300 Pills"),
		check: (display) => display.count === "300" && display.form === "Үрэл",
	},
	{
		label: "VCaps and NOW Foods alias",
		card: byName("NOW Foods Selenium 200 mcg VCaps"),
		check: (display) =>
			display.shortName === "Selenium" &&
			display.form === "Капсул" &&
			display.count === "180",
	},
	{
		label: "long potency bounded",
		card: byAmount("60 Lozenges"),
		check: (display) =>
			(display.dose?.length ?? 0) <= 72 && display.accessibleName.length <= 180,
	},
];

for (const fixture of fixtureChecks) {
	if (!fixture.check(fixture.card.display)) {
		throw new Error(
			`${fixture.label} failed: ${JSON.stringify(fixture.card, null, 2)}`,
		);
	}
}

const cards = source.map((product) => ({ product, display: project(product) }));
for (const { product, display } of cards) {
	if (!display.shortName) throw new Error(`Empty short name: ${product.name}`);
	if (display.shortName.length > 68) {
		throw new Error(`Unbounded short name: ${product.name}`);
	}
	if ((display.dose?.length ?? 0) > 72) {
		throw new Error(`Unbounded dose: ${product.name}`);
	}
	if (display.accessibleName.length > 180) {
		throw new Error(`Unbounded accessible name: ${product.name}`);
	}
	if (display.count && !display.form) {
		throw new Error(`Unitless item count: ${product.name}`);
	}
	if (product.amount && !display.count && !display.packageQuantity) {
		throw new Error(`Dropped package quantity: ${product.name}`);
	}
}

const summary = {
	productsAudited: cards.length,
	withForm: cards.filter(({ display }) => display.form).length,
	withItemCount: cards.filter(({ display }) => display.count).length,
	withPackageQuantity: cards.filter(({ display }) => display.packageQuantity)
		.length,
	maxShortName: Math.max(
		...cards.map(({ display }) => display.shortName.length),
	),
	maxDose: Math.max(...cards.map(({ display }) => display.dose?.length ?? 0)),
	maxAccessibleName: Math.max(
		...cards.map(({ display }) => display.accessibleName.length),
	),
	fixtures: [...d3Cards, ...fixtureChecks.map(({ card }) => card)].map(
		({ product, display }) => ({ importedTitle: product.name, display }),
	),
};

console.log(JSON.stringify(summary, null, 2));
