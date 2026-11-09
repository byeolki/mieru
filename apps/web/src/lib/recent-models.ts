import { useSyncExternalStore } from 'react';
import type { OpFamily } from '@mieru/shared';

export interface RecentModel {
  id: string;
  name: string;
  ownerUsername: string;
  /** Dominant op family, used to color the model's ring in the sidebar. */
  family: OpFamily | null;
}

const STORAGE_KEY = 'mieru.recentModels';
const MAX_RECENT = 5;
const listeners = new Set<() => void>();
const EMPTY: RecentModel[] = [];
let cache: { raw: string | null; items: RecentModel[] } = { raw: null, items: EMPTY };

function isRecentModel(value: unknown): value is RecentModel {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.ownerUsername === 'string'
  );
}

function read(): RecentModel[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cache.raw) return cache.items;
  let items: RecentModel[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) items = parsed.filter(isRecentModel);
  } catch (error) {
    // A corrupt entry only loses the history; start over rather than breaking the sidebar.
    console.warn('Ignoring unreadable recent models', error);
  }
  cache = { raw, items };
  return items;
}

/** Remembers a repository the user opened, most recent first. */
export function rememberModel(model: RecentModel): void {
  const items = [model, ...read().filter((item) => item.id !== model.id)].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  for (const listener of listeners) listener();
}

/** Drops a repository that no longer exists or can't be opened. */
export function forgetModel(id: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(read().filter((item) => item.id !== id)));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useRecentModels(): RecentModel[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
