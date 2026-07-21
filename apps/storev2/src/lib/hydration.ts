import {
	dehydrate,
	hydrate,
	QueryClient,
	type QueryKey,
} from "@tanstack/solid-query";
import { SuperJSON } from "superjson";

type QuerySeed = {
	queryKey: QueryKey;
	data: unknown;
};

export const dehydrateSeeds = (seeds: QuerySeed[]) => {
	const client = new QueryClient();
	for (const seed of seeds) {
		client.setQueryData(seed.queryKey, seed.data);
	}
	const serialized = SuperJSON.stringify(dehydrate(client));
	client.clear();
	return serialized;
};

const hydratedPayloads = new Set<string>();

export const hydrateServerState = (
	client: QueryClient,
	serialized: string | null | undefined,
) => {
	if (!serialized || hydratedPayloads.has(serialized)) {
		return;
	}
	hydratedPayloads.add(serialized);
	hydrate(client, SuperJSON.parse(serialized));
};
