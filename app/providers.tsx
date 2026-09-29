'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilterProvider } from '@/lib/filters';
import { ApiError } from '@/lib/use-dashboard';

export function Providers({ children }: { children: React.ReactNode }) {
  // Created once per browser session, not once per render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // A rejected request will not fix itself. An expired session and a
              // bad request both stay wrong on retry.
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <FilterProvider>{children}</FilterProvider>
    </QueryClientProvider>
  );
}
