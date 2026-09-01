export const safeStorage: Storage = {
	clear: () => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.clear();
		} catch {}
	},
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
	removeItem: (key: string) => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.removeItem(key);
		} catch {}
	},
	setItem: (key: string, value: string) => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.setItem(key, value);
		} catch {}
	},
};
