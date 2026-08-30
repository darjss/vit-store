import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
	type OgFonts,
	renderHomeOgSvg,
	renderProductOgSvg,
} from "../src/lib/og-image";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(appRoot, "tmp/og-preview");

const readFont = async (name: string) => {
	const font = await readFile(resolve(appRoot, `public/og-assets/${name}`));
	return Uint8Array.from(font).buffer;
};

const fonts: OgFonts = {
	sansRegular: await readFont("noto-sans-regular.ttf"),
	sansBold: await readFont("noto-sans-bold.ttf"),
	unboundedSemibold: await readFont("unbounded-semibold.ttf"),
	unboundedBold: await readFont("unbounded-bold.ttf"),
};

await mkdir(outputDirectory, { recursive: true });

const homeSvg = await renderHomeOgSvg(fonts);
await sharp(Buffer.from(homeSvg))
	.png()
	.toFile(resolve(outputDirectory, "home.png"));

const sourceImage =
	"https://cdn.darjs.dev/products/micro-ingredients-vitamin-d3-1000-iu--k2-mk-7-25-mcg-300-softgels/mtYTvLk3i5W_2MPgvft3T.webp";
const productImageUrl = `https://cdn.darjs.dev/cdn-cgi/image/width=980,height=980,quality=82,fit=contain,format=png/${sourceImage}`;
const imageResponse = await fetch(productImageUrl);
if (!imageResponse.ok)
	throw new Error("Could not load the sample product image");
const imageType = imageResponse.headers.get("content-type") || "image/webp";
const imageData = Buffer.from(await imageResponse.arrayBuffer()).toString(
	"base64",
);

const productSvg = await renderProductOgSvg(
	{
		name: "Micro Ingredients Vitamin D3 1000 IU + K2 MK-7 25 мкг",
		price: 69_900,
		brand: "Micro Ingredients",
		category: "Витамин D",
		imageUrl: `data:${imageType};base64,${imageData}`,
	},
	fonts,
);
await sharp(Buffer.from(productSvg))
	.png()
	.toFile(resolve(outputDirectory, "product.png"));

console.log(`OG previews written to ${outputDirectory}`);
