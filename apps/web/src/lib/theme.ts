import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

// public/theme-init.js reads the same key before the first paint.
const STORAGE_KEY = 'mieru.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch (error) {
    console.warn('Theme preference is unavailable; following the system', error);
    return 'system';
  }
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function apply(): void {
  document.documentElement.dataset.theme = resolve(readPreference());
  for (const listener of listeners) listener();
}

/** Follows OS theme changes while the preference is `system`; call once at startup. */
export function watchSystemTheme(): void {
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (readPreference() === 'system') apply();
  });
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch (error) {
    console.warn('Could not save the theme preference', error);
  }
  apply();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The saved preference and the theme actually shown. */
export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme } {
  const preference = useSyncExternalStore(subscribe, readPreference);
  const resolved = useSyncExternalStore(subscribe, () =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  return { preference, resolved };
}
