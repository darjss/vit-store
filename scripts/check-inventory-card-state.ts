import {
	unverifiedInventoryCardPresentation,
	verifiedInventoryCardPresentation,
} from "../apps/storev2/src/components/product/inventory-card-state";

const transitions = [
	unverifiedInventoryCardPresentation("checking"),
	unverifiedInventoryCardPresentation("degraded"),
	unverifiedInventoryCardPresentation("checking"),
	verifiedInventoryCardPresentation({ status: "active", stock: 12 }),
	verifiedInventoryCardPresentation({ status: "active", stock: 3 }),
	verifiedInventoryCardPresentation({ status: "out_of_stock", stock: 0 }),
];

const expected = [
	["checking", "Нөөц шалгаж байна", false],
	["degraded", "Нөөц баталгаажаагүй", false],
	["checking", "Нөөц шалгаж байна", false],
	["in", "Бэлэн байна", true],
	["low", "Цөөхөн үлдсэн (3)", true],
	["out", "Дууссан", true],
] as const;

for (const [index, presentation] of transitions.entries()) {
	const [state, label, verified] = expected[index];
	if (
		presentation.state !== state ||
		presentation.availabilityLabel !== label ||
		presentation.verified !== verified
	) {
		throw new Error(
			`Inventory transition ${index} mismatch: ${JSON.stringify(presentation)}`,
		);
	}
}

const reconcilerPath = new URL(
	"../apps/storev2/src/components/product/inventory-reconciler.tsx",
	import.meta.url,
);
const serverCardPath = new URL(
	"../apps/storev2/src/components/product/server-product-card.astro",
	import.meta.url,
);
const actionPath = new URL(
	"../apps/storev2/src/components/product/card-add-button.tsx",
	import.meta.url,
);
const [reconcilerSource, serverCardSource, actionSource] = await Promise.all([
	Bun.file(reconcilerPath).text(),
	Bun.file(serverCardPath).text(),
	Bun.file(actionPath).text(),
]);

for (const state of ["checking", "degraded", "in", "low", "out"]) {
	if (!serverCardSource.includes(`data-inventory-state="${state}"`)) {
		throw new Error(`Server card has no visual treatment for ${state}`);
	}
}
if (
	!serverCardSource.includes('unverifiedInventoryCardPresentation("checking")')
) {
	throw new Error("SSR card does not start with an honest checking state");
}
if (
	(reconcilerSource.match(/dataset\.inventoryState\s*=/gu) ?? []).length !== 1
) {
	throw new Error("Inventory card state has more than one DOM writer");
}

const verificationBody = reconcilerSource.slice(
	reconcilerSource.indexOf("function publishVerification"),
	reconcilerSource.indexOf("function markInventoryChecking"),
);
if (
	verificationBody.indexOf("reconcileServerProductCards") < 0 ||
	verificationBody.indexOf("reconcileServerProductCards") >
		verificationBody.indexOf("for (const listener")
) {
	throw new Error(
		"Unverified card state is not applied before action listeners",
	);
}

const inventoryBody = reconcilerSource.slice(
	reconcilerSource.indexOf("function publishInventory"),
	reconcilerSource.indexOf("export function subscribeInventory"),
);
const verifiedOrder = [
	inventoryBody.indexOf("reconcileDocument(snapshot)"),
	inventoryBody.indexOf("listener(snapshot)"),
	inventoryBody.indexOf("publishVerification(snapshot.id"),
];
if (
	verifiedOrder.some((position) => position < 0) ||
	verifiedOrder.some((position, index) =>
		index === 0 ? false : position <= verifiedOrder[index - 1],
	)
) {
	throw new Error(
		"Verified stock/visual state is not applied before enabling action",
	);
}
if (
	!actionSource.includes("useInventoryVerification") ||
	!actionSource.includes("disabled={!isInventoryVerified()")
) {
	throw new Error(
		"Card action is not gated by the shared inventory coordinator",
	);
}

console.log(
	JSON.stringify(
		{
			transitions,
			canonicalDomWriters: 1,
			unverifiedAppliedBeforeAction: true,
			verifiedSnapshotAppliedBeforeAction: true,
		},
		null,
		2,
	),
);
