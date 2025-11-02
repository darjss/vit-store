import { QueryClient } from '@tanstack/solid-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  
      gcTime: 1000 * 60 * 60,  
    },
    mutations: {
      onSettled: async () => {
        await queryClient.invalidateQueries();
      },
      onError: (error) => {
        console.error(error);
      },
    },
  },
});