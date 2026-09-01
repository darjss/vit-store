import { api } from "@/lib/trpc";

export interface StaticNavigationCategory {
	id: number;
	name: string;
	productCount?: number;
	slug: string;
}

export interface StaticNavigationBrand {
	id: number;
	logoUrl?: string | null;
	name: string;
	productCount?: number;
	slug: string;
}

interface StaticNavigationData {
	brands: Array<StaticNavigationBrand>;
	categories: Array<StaticNavigationCategory>;
}

let navigationDataPromise: Promise<StaticNavigationData> | undefined;

async function getWithBuildFallback<T>(
	label: string,
	promise: Promise<T>,
	fallback: T,
): Promise<T> {
	try {
		return await promise;
	} catch (error) {
		console.warn(`Failed to load ${label} for static navigation`, error);
		return fallback;
	}
}

export function getStaticNavigationData() {
	// Header/sidebar is rendered for every prerendered page. Cache these shared
	// lookups during the build so a large product catalog does not hammer the API.
	navigationDataPromise ??= Promise.all([
		getWithBuildFallback(
			"categories",
			api.category.getAllCategoriesWithStock.query(),
			[] satisfies Array<StaticNavigationCategory>,
		),
		getWithBuildFallback(
			"brands",
			api.brand.getAllBrandsWithStock.query(),
			[] satisfies Array<StaticNavigationBrand>,
		),
	]).then(([categories, brands]) => ({ brands, categories }));

	return navigationDataPromise;
}
