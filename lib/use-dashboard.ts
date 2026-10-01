'use client';

/**
 * Server state.
 *
 * The dashboard is read-only, so there is exactly one query and no mutations.
 * Everything a page needs arrives in a single payload.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { NO_ACCESS, type Access } from './access';
import type { DashboardData, SessionUser } from './types';

export const dashboardKey = ['dashboard'] as const;

const SESSION_REFRESH_MS = 60_000;

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

/**
 * Who is signed in and what they may do. Asked again every minute, so a tab
 * left open picks up a change of role, or the end of access, without a reload.
 */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => getJson<{ user: SessionUser | null; access: Access | null }>('/api/auth/session'),
    staleTime: SESSION_REFRESH_MS,
    refetchInterval: SESSION_REFRESH_MS,
  });
}

/** What the signed-in person may do. Nothing, until the session is known. */
export function useAccess(): Access {
  return useSession().data?.access ?? NO_ACCESS;
}

export async function signOut(): Promise<void> {
  await getJson('/api/auth/logout', { method: 'POST' });
}
