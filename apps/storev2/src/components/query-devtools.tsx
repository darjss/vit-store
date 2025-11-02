import { QueryClientProvider } from '@tanstack/solid-query';
import { SolidQueryDevtools as Devtools } from '@tanstack/solid-query-devtools';
import { queryClient } from '../lib/query';

export default function QueryDevtools() {
	return (
		<QueryClientProvider client={queryClient}>
			<Devtools />
		</QueryClientProvider>
	);
}
