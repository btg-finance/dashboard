'use client';

/**
 * Server state.
 *
 * The dashboard is read-only, so there is exactly one query and no mutations.
 * Everything a page needs arrives in a single payload.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardData, SessionUser } from './types';

export const dashboardKey = ['dashboard'] as const;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is it running?');
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = (payload as { error?: string } | null)?.error;
    throw new ApiError(response.status, detail ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export function useDashboard(): UseQueryResult<DashboardData, Error> {
  return useQuery({
    queryKey: dashboardKey,
    queryFn: () => getJson<DashboardData>('/api/dashboard'),
    staleTime: 30_000,
  });
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => getJson<{ user: SessionUser | null }>('/api/auth/session'),
    staleTime: 60_000,
  });
}

export async function signOut(): Promise<void> {
  await getJson('/api/auth/logout', { method: 'POST' });
}
