import { api } from "@/lib/trpc";

export interface StaticNavigationCategory {
	id: number;
	name: string;
	slug: string;
	productCount?: number;
}

export interface StaticNavigationBrand {
	id: number;
	name: string;
	slug: string;
	logoUrl?: string | null;
	productCount?: number;
}

interface StaticNavigationData {
	categories: StaticNavigationCategory[];
	brands: StaticNavigationBrand[];
}

let navigationDataPromise: Promise<StaticNavigationData> | undefined;

export function getStaticNavigationData() {
	// Header/sidebar is rendered for every prerendered page. Cache these shared
	// lookups during the build so a large product catalog does not hammer the API.
	navigationDataPromise ??= Promise.all([
		api.v2.category.getAllCategoriesWithStock.query(),
		api.v2.brand.getAllBrandsWithStock.query(),
	]).then(([categories, brands]) => ({ categories, brands }));

	return navigationDataPromise;
}
