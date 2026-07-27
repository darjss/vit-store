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
				padding: "12px 20px",
				borderRadius: 999,
				backgroundColor,
				fontSize: 20,
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
					width: "68%",
					padding: "58px 30px 48px 60px",
				},
			},
			h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: 14 } },
				h("div", {
					style: {
						display: "flex",
						width: 34,
						height: 34,
						borderRadius: 12,
						backgroundColor: colors.butter,
						boxShadow: `0 3px 0 ${colors.butterDeep}`,
					},
				}),
				h(
					"div",
					{ style: { display: "flex", fontSize: 24, fontWeight: 700 } },
					"amerikvitamin.mn",
				),
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
							fontSize: 68,
							fontWeight: 700,
							lineHeight: 1.08,
							letterSpacing: "-0.02em",
						},
					},
					"Өдөр бүрт тань хэрэгтэй витамин",
				),
				h(
					"div",
					{
						style: {
							display: "flex",
							fontSize: 27,
							fontWeight: 600,
							color: colors.muted,
						},
					},
					"АНУ-аас импортолсон жинхэнэ бүтээгдэхүүн",
				),
			),
			h(
				"div",
				{ style: { display: "flex", gap: 12 } },
				pill("Өргөн сонголт", colors.butter),
				pill("Хурдан хүргэлт", colors.mint),
			),
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "32%",
					backgroundColor: colors.butter,
				},
			},
			h(
				"div",
				{
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 246,
						height: 246,
						borderRadius: 123,
						backgroundColor: colors.card,
						border: `2px solid ${colors.foreground}`,
					},
				},
				h(
					"div",
					{
						style: {
							display: "flex",
							fontFamily: "Unbounded",
							fontSize: 43,
							fontWeight: 700,
							lineHeight: 1.05,
							textAlign: "center",
						},
					},
					"Америк Витамин",
				),
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
					width: "60%",
					padding: "50px 38px 46px 56px",
				},
			},
			h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: 12 } },
				pill(product.brand || "Америк Витамин", colors.butter),
				product.category ? pill(product.category, "#f1eee5") : null,
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
							fontSize: product.name.length > 48 ? 45 : 54,
							fontWeight: 700,
							lineHeight: 1.12,
							letterSpacing: "-0.02em",
							maxHeight: 190,
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
									fontSize: 42,
									fontWeight: 700,
								},
							},
							formatPrice(product.price),
						)
					: null,
			),
			h(
				"div",
				{ style: { display: "flex", fontSize: 22, fontWeight: 700 } },
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
					width: "40%",
					padding: 42,
					backgroundColor: colors.peach,
				},
			},
			product.imageUrl
				? h("img", {
						src: product.imageUrl,
						width: 390,
						height: 470,
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
