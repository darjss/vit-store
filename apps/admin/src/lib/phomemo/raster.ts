import {
	LABEL_HEIGHT_PX,
	LABEL_WIDTH_BYTES,
	LABEL_WIDTH_PX,
} from "./constants";

export type PhoneRaster = {
	bytes: Uint8Array;
	widthBytes: number;
	height: number;
};

/** Space Mongolian mobile numbers for sticker readability (88119922 → 8811 9922). */
export function formatPhoneForLabel(phone: string | number) {
	const digits = String(phone).replace(/\D/g, "");
	if (digits.length === 8) {
		return `${digits.slice(0, 4)} ${digits.slice(4)}`;
	}
	return digits || String(phone);
}

/**
 * Render a phone number onto a fixed label canvas and pack 1bpp M110 raster.
 * Bit set = black; MSB = leftmost pixel (pyphomemo / phomemo-tools polarity).
 */
export function renderPhoneRaster(phone: string | number): PhoneRaster {
	const width = LABEL_WIDTH_PX;
	const height = LABEL_HEIGHT_PX;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("Canvas 2D context unavailable");
	}

	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, width, height);

	const text = formatPhoneForLabel(phone);
	ctx.fillStyle = "#000000";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	let fontSize = Math.floor(height * 0.42);
	ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
	while (fontSize > 16 && ctx.measureText(text).width > width - 16) {
		fontSize -= 2;
		ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
	}
	ctx.fillText(text, width / 2, height / 2);

	const { data } = ctx.getImageData(0, 0, width, height);
	const widthBytes = LABEL_WIDTH_BYTES;
	const bytes = new Uint8Array(widthBytes * height);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const r = data[i] ?? 255;
			const g = data[i + 1] ?? 255;
			const b = data[i + 2] ?? 255;
			const luminance = (r + g + b) / 3;
			if (luminance < 128) {
				const byteIndex = y * widthBytes + (x >> 3);
				bytes[byteIndex]! |= 0x80 >> (x & 7);
			}
		}
	}

	return { bytes, widthBytes, height };
}
