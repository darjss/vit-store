/** Provisional until warehouse label stock is measured (Phase 0). */
export const LABEL_WIDTH_MM = 40;
export const LABEL_HEIGHT_MM = 30;

/** 203 dpi ≈ 8 dots/mm (pyphomemo / phomemo-tools). */
export const PX_PER_MM = 8;

export const PRINTER_WIDTH_PX = 384;

export const SERVICE_UUID = "0000ff00-0000-1000-8000-00805f9b34fb";
export const WRITE_CHAR_UUID = "0000ff02-0000-1000-8000-00805f9b34fb";
export const NOTIFY_CHAR_UUID = "0000ff03-0000-1000-8000-00805f9b34fb";

export const KNOWN_SERVICE_UUIDS = [
	SERVICE_UUID,
	"0000ffe0-0000-1000-8000-00805f9b34fb",
	"0000ae30-0000-1000-8000-00805f9b34fb",
	"49535343-fe7d-4ae5-8fa9-9fafd205e455",
] as const;

export const CHUNK_SIZE = 128;
export const CHUNK_DELAY_MS = 20;
export const DELAY_INIT_MS = 30;
export const DELAY_BEFORE_FOOTER_MS = 300;
export const DELAY_AFTER_FOOTER_MS = 500;
/** Pause between sequential labels so the M110 can settle. */
export const DELAY_BETWEEN_JOBS_MS = 800;

export const DEFAULT_SPEED = 0x05;
export const DEFAULT_DENSITY = 0x0f;
export const MEDIA_LABEL_WITH_GAPS = 0x0a;
export const MEDIA_CONTINUOUS = 0x0b;
export const DEFAULT_MEDIA = MEDIA_LABEL_WITH_GAPS;

export const DEVICE_ID_STORAGE_KEY = "vit-m110-device-id";

export function mmToPx(mm: number) {
	const px = Math.round(mm * PX_PER_MM);
	return Math.ceil(px / 8) * 8;
}

export const LABEL_WIDTH_PX = Math.min(mmToPx(LABEL_WIDTH_MM), PRINTER_WIDTH_PX);
export const LABEL_HEIGHT_PX = mmToPx(LABEL_HEIGHT_MM);
export const LABEL_WIDTH_BYTES = LABEL_WIDTH_PX / 8;
