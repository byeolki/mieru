import { useSyncExternalStore } from 'react';
import { sessionResponseSchema, type Me, type SessionResponse } from '@mieru/shared';
import { toApiError } from './api-error.js';

type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

interface AuthState {
  status: AuthStatus;
  user: Me | null;
}

// The access token lives only in this module: never in storage, so XSS can't lift it from disk.
let accessToken: string | null = null;
let state: AuthState = { status: 'loading', user: null };
const listeners = new Set<() => void>();
let refreshInFlight: Promise<boolean> | null = null;

function setState(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function applySession(session: SessionResponse): void {
  accessToken = session.accessToken;
  setState({ status: 'signed-in', user: session.user });
}

export function updateCurrentUser(user: Me): void {
  setState({ status: 'signed-in', user });
}

export function clearSession(): void {
  accessToken = null;
  setState({ status: 'signed-out', user: null });
}

const STALE_RETRY_DELAY_MS = 150;

async function requestRefresh(): Promise<boolean> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    credentials: 'same-origin',
  });
  if (response.ok) {
    applySession(sessionResponseSchema.parse(await response.json()));
    return true;
  }
  const error = await toApiError(response);
  if (error.code === 'stale_refresh') {
    // Another tab rotated the token a moment ago; the browser now holds the newer cookie.
    await new Promise((resolve) => setTimeout(resolve, STALE_RETRY_DELAY_MS));
    const retry = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      credentials: 'same-origin',
    });
    if (retry.ok) {
      applySession(sessionResponseSchema.parse(await retry.json()));
      return true;
    }
  }
  clearSession();
  return false;
}

/**
 * Refreshes the session once per tab at a time, and serializes across tabs with the
 * Web Locks API so two tabs never rotate the same refresh token simultaneously.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      if (typeof navigator !== 'undefined' && 'locks' in navigator) {
        return await navigator.locks.request('mieru-refresh', requestRefresh);
      }
      return await requestRefresh();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    credentials: 'same-origin',
  }).catch(() => undefined);
  clearSession();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state);
}
