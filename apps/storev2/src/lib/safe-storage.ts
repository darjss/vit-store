import { isServer } from "@/lib/runtime";

export const safeStorage: Storage = {
	clear: () => {
		if (isServer) {
			return;
		}
		try {
			localStorage.clear();
		} catch {}
	},
	getItem: (key: string) => {
		if (isServer) {
			return null;
		}
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	key: (index: number) => {
		if (isServer) {
			return null;
		}
		try {
			return localStorage.key(index);
		} catch {
			return null;
		}
	},
	get length() {
		if (isServer) {
			return 0;
		}
		try {
			return localStorage.length;
		} catch {
			return 0;
		}
	},
	removeItem: (key: string) => {
		if (isServer) {
			return;
		}
		try {
			localStorage.removeItem(key);
		} catch {}
	},
	setItem: (key: string, value: string) => {
		if (isServer) {
			return;
		}
		try {
			localStorage.setItem(key, value);
		} catch {}
	},
};
