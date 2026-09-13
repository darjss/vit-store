import {
	CHUNK_DELAY_MS,
	DEFAULT_DENSITY,
	DEFAULT_MEDIA,
	DEFAULT_SPEED,
	DELAY_AFTER_FOOTER_MS,
	DELAY_BEFORE_FOOTER_MS,
	DELAY_INIT_MS,
	LABEL_WIDTH_BYTES,
} from "./constants";
import {
	buildFooter,
	buildRasterHeader,
	chunkPayload,
	cmdDensity,
	cmdMedia,
	cmdSpeed,
} from "./protocol";
import type { PhoneRaster } from "./raster";
import {
	PrinterError,
	type PrinterTransport,
	WebBluetoothTransport,
} from "./web-bluetooth";

export type PrintOptions = {
	speed?: number;
	density?: number;
	media?: number;
};

function sleep(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Structured M110 print sequence from pyphomemo printer.py.
 * Discrete command writes + delays — do not merge into one chunked stream.
 */
export class M110Printer {
	constructor(private readonly transport: PrinterTransport) {}

	get connected() {
		return this.transport.connected;
	}

	connect() {
		return this.transport.connect();
	}

	disconnect() {
		return this.transport.disconnect();
	}

	async print(raster: PhoneRaster, options: PrintOptions = {}) {
		if (!this.transport.connected) {
			throw new PrinterError("Принтер холбогдоогүй");
		}
		const widthBytes = raster.widthBytes || LABEL_WIDTH_BYTES;
		if (raster.bytes.length !== widthBytes * raster.height) {
			throw new PrinterError(
				`Raster size ${raster.bytes.length} != ${widthBytes}*${raster.height}`,
			);
		}

		const speed = options.speed ?? DEFAULT_SPEED;
		const density = options.density ?? DEFAULT_DENSITY;
		const media = options.media ?? DEFAULT_MEDIA;

		await this.transport.write(cmdSpeed(speed));
		await sleep(DELAY_INIT_MS);
		await this.transport.write(cmdDensity(density));
		await sleep(DELAY_INIT_MS);
		await this.transport.write(cmdMedia(media));
		await sleep(DELAY_INIT_MS);

		await this.transport.write(buildRasterHeader(raster.height, widthBytes));
		for (const chunk of chunkPayload(raster.bytes)) {
			await this.transport.write(chunk);
			await sleep(CHUNK_DELAY_MS);
		}

		await sleep(DELAY_BEFORE_FOOTER_MS);
		await this.transport.write(buildFooter());
		await sleep(DELAY_AFTER_FOOTER_MS);
	}
}

export function createPrinter() {
	return new M110Printer(new WebBluetoothTransport());
}
