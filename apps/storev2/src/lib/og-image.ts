import satori from "satori";
import { type CSSProperties, createElement, type JSXNode } from "satori/jsx";

const h = (
	type: string,
	props: Record<string, unknown> | null,
	...children: JSXNode[]
) => createElement(type, props, ...children) as unknown as JSXNode;

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export type OgFonts = {
	sansRegular: ArrayBuffer;
	sansBold: ArrayBuffer;
	unboundedSemibold: ArrayBuffer;
	unboundedBold: ArrayBuffer;
};

export type ProductOgData = {
	name: string;
	price: number;
	brand?: string | null;
	category?: string | null;
	imageUrl?: string | null;
};

const colors = {
	background: "#fffdf5",
	card: "#fffef9",
	foreground: "#332f2b",
	muted: "#736a60",
	border: "#e1d8bf",
	butter: "#f6df62",
	butterDeep: "#d7b92f",
	peach: "#f8c8a9",
	mint: "#ccebcf",
};

const fontOptions = (fonts: OgFonts) => [
	{ name: "Noto Sans", data: fonts.sansRegular, weight: 400 as const },
	{ name: "Noto Sans", data: fonts.sansBold, weight: 700 as const },
	{
		name: "Unbounded",
		data: fonts.unboundedSemibold,
		weight: 600 as const,
	},
	{ name: "Unbounded", data: fonts.unboundedBold, weight: 700 as const },
];

const base: CSSProperties = {
	display: "flex",
	width: "100%",
	height: "100%",
	fontFamily: "Noto Sans",
	color: colors.foreground,
	backgroundColor: colors.background,
};

const pill = (text: string, backgroundColor: string): JSXNode =>
	h(
		"div",
		{
			style: {
				display: "flex",
				alignItems: "center",
				padding: "14px 22px",
				borderRadius: 999,
				backgroundColor,
				fontSize: 24,
				fontWeight: 700,
			},
		},
		text,
	);

const frame = (children: JSXNode[]) =>
	h(
		"div",
		{
			style: {
				...base,
				padding: 34,
				backgroundImage:
					"radial-gradient(circle at 10% 8%, #f6df62 0, #f6df62 9%, transparent 9.2%), radial-gradient(circle at 95% 88%, #f8c8a9 0, #f8c8a9 13%, transparent 13.2%)",
			},
		},
		h(
			"div",
			{
				style: {
					display: "flex",
					width: "100%",
					height: "100%",
					borderRadius: 28,
					border: `2px solid ${colors.border}`,
					backgroundColor: colors.card,
					overflow: "hidden",
				},
			},
			...children,
		),
	);

export const renderHomeOgSvg = (fonts: OgFonts) => {
	const tree = frame([
		h(
			"div",
			{
				style: {
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					width: "100%",
					padding: "62px 68px 56px",
				},
			},
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: 28,
						fontWeight: 700,
						color: colors.muted,
					},
				},
				"amerikvitamin.mn",
			),
			h(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: 28 } },
				h(
					"div",
					{
						style: {
							display: "flex",
							fontFamily: "Unbounded",
							fontSize: 88,
							fontWeight: 700,
							lineHeight: 1.04,
							letterSpacing: "-0.025em",
						},
					},
					"Америк Витамин",
				),
				h(
					"div",
					{
						style: {
							display: "flex",
							fontSize: 38,
							fontWeight: 700,
						},
					},
					"Жинхэнэ витамин. Хурдан хүргэлт.",
				),
			),
			h(
				"div",
				{
					style: {
						display: "flex",
						alignItems: "center",
						alignSelf: "flex-start",
						padding: "16px 26px",
						borderRadius: 999,
						backgroundColor: colors.butter,
						fontSize: 25,
						fontWeight: 700,
					},
				},
				"АНУ-аас импортолсон бүтээгдэхүүн",
			),
		),
	]);

	return satori(tree, {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		fonts: fontOptions(fonts),
	});
};

const formatPrice = (price: number) =>
	price > 0 ? `${new Intl.NumberFormat("en-US").format(price)} MNT` : "";

export const renderProductOgSvg = (product: ProductOgData, fonts: OgFonts) => {
	const tree = frame([
		h(
			"div",
			{
				style: {
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					width: "57%",
					padding: "54px 34px 52px 56px",
				},
			},
			h(
				"div",
				{ style: { display: "flex", alignItems: "center" } },
				pill(product.brand || "Америк Витамин", colors.butter),
			),
			h(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: 24 } },
				h(
					"div",
					{
						style: {
							display: "flex",
							fontFamily: "Unbounded",
							fontSize: product.name.length > 48 ? 50 : 62,
							fontWeight: 700,
							lineHeight: 1.12,
							letterSpacing: "-0.02em",
							maxHeight: 220,
							overflow: "hidden",
						},
					},
					product.name,
				),
				product.price > 0
					? h(
							"div",
							{
								style: {
									display: "flex",
									fontFamily: "Unbounded",
									fontSize: 50,
									fontWeight: 700,
								},
							},
							formatPrice(product.price),
						)
					: null,
			),
			h(
				"div",
				{ style: { display: "flex", fontSize: 28, fontWeight: 700 } },
				"amerikvitamin.mn",
			),
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "43%",
					padding: 24,
					backgroundColor: colors.peach,
				},
			},
			product.imageUrl
				? h("img", {
						src: product.imageUrl,
						width: 440,
						height: 510,
						style: { objectFit: "contain" },
					})
				: h(
						"div",
						{
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 280,
								height: 360,
								borderRadius: 140,
								backgroundColor: colors.card,
								fontFamily: "Unbounded",
								fontSize: 34,
								fontWeight: 700,
								textAlign: "center",
							},
						},
						"Америк Витамин",
					),
		),
	]);

	return satori(tree, {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		fonts: fontOptions(fonts),
	});
};
