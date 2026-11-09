import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

// public/theme-init.js reads the same key before the first paint.
const STORAGE_KEY = 'mieru.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

/** The theme the visitor picked, or null while the system setting decides. */
function savedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch (error) {
    console.warn('Theme choice is unavailable; following the system', error);
    return null;
  }
}

function apply(): void {
  const theme = savedTheme() ?? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  for (const listener of listeners) listener();
}

/** Follows OS theme changes until the visitor picks a theme; call once at startup. */
export function watchSystemTheme(): void {
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (savedTheme() === null) apply();
  });
}

/** Saves the visitor's choice and applies it. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Could not save the theme choice', error);
  }
  apply();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The theme currently shown. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
}
