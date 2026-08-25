import {
	CHUNK_SIZE,
	DEFAULT_DENSITY,
	DEFAULT_MEDIA,
	DEFAULT_SPEED,
	LABEL_WIDTH_BYTES,
} from "./constants";

function u16le(value: number) {
	const buf = new Uint8Array(2);
	buf[0] = value & 0xff;
	buf[1] = (value >> 8) & 0xff;
	return buf;
}

export function cmdSpeed(speed = DEFAULT_SPEED) {
	return new Uint8Array([0x1b, 0x4e, 0x0d, speed]);
}

export function cmdDensity(density = DEFAULT_DENSITY) {
	return new Uint8Array([0x1b, 0x4e, 0x04, density]);
}

export function cmdMedia(media = DEFAULT_MEDIA) {
	return new Uint8Array([0x1f, 0x11, media]);
}

export function buildRasterHeader(
	height: number,
	widthBytes = LABEL_WIDTH_BYTES,
) {
	const header = new Uint8Array(8);
	header.set([0x1d, 0x76, 0x30, 0x00], 0);
	header.set(u16le(widthBytes), 4);
	header.set(u16le(height), 6);
	return header;
}

export function buildFooter() {
	return new Uint8Array([0x1f, 0xf0, 0x05, 0x00, 0x1f, 0xf0, 0x03, 0x00]);
}

export function* chunkPayload(
	payload: Uint8Array,
	chunkSize = CHUNK_SIZE,
): Generator<Uint8Array> {
	for (let i = 0; i < payload.length; i += chunkSize) {
		yield payload.subarray(i, i + chunkSize);
	}
}
