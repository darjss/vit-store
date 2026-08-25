import {
	DEVICE_ID_STORAGE_KEY,
	KNOWN_SERVICE_UUIDS,
	SERVICE_UUID,
	WRITE_CHAR_UUID,
} from "./constants";

export class PrinterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PrinterError";
	}
}

export type PrinterTransport = {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	write(data: Uint8Array): Promise<void>;
	readonly connected: boolean;
};

type GattCharacteristic = {
	properties: {
		writeWithoutResponse?: boolean;
		write?: boolean;
	};
	writeValueWithoutResponse(value: BufferSource): Promise<void>;
	writeValueWithResponse(value: BufferSource): Promise<void>;
	writeValue(value: BufferSource): Promise<void>;
};

type GattService = {
	getCharacteristic(uuid: string): Promise<GattCharacteristic>;
};

type GattServer = {
	connected: boolean;
	connect(): Promise<GattServer>;
	getPrimaryService(uuid: string): Promise<GattService>;
	disconnect(): void;
};

type BleDevice = {
	id: string;
	name?: string;
	gatt?: GattServer;
};

type BluetoothApi = {
	requestDevice(options: {
		filters?: Array<{ namePrefix?: string; services?: string[] }>;
		optionalServices?: string[];
		acceptAllDevices?: boolean;
	}): Promise<BleDevice>;
	getDevices?: () => Promise<BleDevice[]>;
};

function bluetoothApi() {
	const nav = navigator as Navigator & { bluetooth?: BluetoothApi };
	return nav.bluetooth;
}

export function isWebBluetoothAvailable() {
	return typeof navigator !== "undefined" && !!bluetoothApi();
}

export class WebBluetoothTransport implements PrinterTransport {
	#device: BleDevice | null = null;
	#characteristic: GattCharacteristic | null = null;
	#preferWithoutResponse = true;

	get connected() {
		return !!this.#device?.gatt?.connected && !!this.#characteristic;
	}

	async connect() {
		const bluetooth = bluetoothApi();
		if (!bluetooth) {
			throw new PrinterError(
				"Bluetooth боломжгүй. Bluefy хөтөчөөр нээнэ үү (Safari дэмжихгүй).",
			);
		}

		let device: BleDevice | null = null;
		const savedId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
		if (savedId && bluetooth.getDevices) {
			try {
				const known = await bluetooth.getDevices();
				device = known.find((d) => d.id === savedId) ?? null;
			} catch {
				device = null;
			}
		}

		if (!device) {
			try {
				device = await bluetooth.requestDevice({
					filters: [
						{ namePrefix: "M110" },
						{ namePrefix: "M120" },
						{ namePrefix: "M220" },
						{ services: [SERVICE_UUID] },
					],
					optionalServices: [...KNOWN_SERVICE_UUIDS],
				});
			} catch (first) {
				// Bare-serial advertisements (Q199…) often fail name filters.
				try {
					device = await bluetooth.requestDevice({
						acceptAllDevices: true,
						optionalServices: [...KNOWN_SERVICE_UUIDS],
					});
				} catch {
					throw first instanceof Error
						? first
						: new PrinterError("Принтер сонгосонгүй");
				}
			}
		}

		const server = device.gatt;
		if (!server) {
			throw new PrinterError("GATT сервер олдсонгүй");
		}

		await server.connect();
		const service = await server.getPrimaryService(SERVICE_UUID);
		const characteristic = await service.getCharacteristic(WRITE_CHAR_UUID);
		this.#preferWithoutResponse = !!characteristic.properties.writeWithoutResponse;
		this.#device = device;
		this.#characteristic = characteristic;
		localStorage.setItem(DEVICE_ID_STORAGE_KEY, device.id);
	}

	async disconnect() {
		try {
			this.#device?.gatt?.disconnect();
		} finally {
			this.#device = null;
			this.#characteristic = null;
		}
	}

	async write(data: Uint8Array) {
		const characteristic = this.#characteristic;
		if (!characteristic || !this.#device?.gatt?.connected) {
			throw new PrinterError("Принтер холбогдоогүй");
		}
		const buffer = data.buffer.slice(
			data.byteOffset,
			data.byteOffset + data.byteLength,
		) as ArrayBuffer;

		if (
			this.#preferWithoutResponse &&
			characteristic.writeValueWithoutResponse
		) {
			await characteristic.writeValueWithoutResponse(buffer);
			return;
		}
		if (characteristic.writeValueWithResponse) {
			await characteristic.writeValueWithResponse(buffer);
			return;
		}
		await characteristic.writeValue(buffer);
	}
}
