export const safeStorage: Storage = {
	getItem: (key: string) => {
		if (typeof window === "undefined") {
			return null;
		}
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	setItem: (key: string, value: string) => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.setItem(key, value);
		} catch {}
	},
	removeItem: (key: string) => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.removeItem(key);
		} catch {}
	},
	clear: () => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.clear();
		} catch {}
	},
	get length() {
		if (typeof window === "undefined") {
			return 0;
		}
		try {
			return localStorage.length;
		} catch {
			return 0;
		}
	},
	key: (index: number) => {
		if (typeof window === "undefined") {
			return null;
		}
		try {
			return localStorage.key(index);
		} catch {
			return null;
		}
	},
};
