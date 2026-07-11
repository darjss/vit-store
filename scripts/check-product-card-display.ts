import { projectProductCardDisplay } from "../packages/shared/src/domain/product/card-display";

type SourceProduct = {
	name: string;
	brand: string;
	potency: string;
	amount: string;
};

const source = (await Bun.file(
	new URL(
		"../packages/api/products-translated-final-final.json",
		import.meta.url,
	),
).json()) as SourceProduct[];

const fixtureNames = [
	"Micro Ingredients Vitamin D3 1,000 IU + K2 MK-7 25 mcg, 300 Softgels",
	"Micro Ingredients Vitamin D3 2,000 IU + K2 MK-7 50 mcg, 300 Softgels",
	"Micro Ingredients Vitamin D3 10,000 IU + K2 MK-7 200 mcg, 300 Softgels",
] as const;

const cards = fixtureNames.map((name) => {
	const product = source.find((candidate) => candidate.name === name);
	if (!product) throw new Error(`Missing source fixture: ${name}`);
	return {
		importedTitle: product.name,
		display: projectProductCardDisplay({
			name: product.name,
			brand: product.brand,
			potency: product.potency,
			amount: product.amount,
		}),
	};
});

for (const card of cards) {
	if (
		!card.display.shortName ||
		!card.display.dose ||
		!card.display.form ||
		!card.display.count
	) {
		throw new Error(`Incomplete card projection: ${card.importedTitle}`);
	}
	if (
		card.display.shortName.toLocaleLowerCase().includes("micro ingredients")
	) {
		throw new Error(`Brand leaked into short name: ${card.display.shortName}`);
	}
}

if (
	new Set(cards.map((card) => card.display.accessibleName)).size !==
	cards.length
) {
	throw new Error(
		"Near-identical D3/K2 variants do not have distinct card names",
	);
}

console.log(JSON.stringify(cards, null, 2));
