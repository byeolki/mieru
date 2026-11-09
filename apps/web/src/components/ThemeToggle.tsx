import { Moon, Sun } from 'lucide-react';
import { setTheme, useTheme } from '../lib/theme.js';

/**
 * Switches between light and dark. Until the visitor picks one the system setting decides; the
 * first click saves the opposite of what is showing.
 */
export function ThemeToggle() {
  const isDark = useTheme() === 'dark';
  // The icon shows where a click goes, matching the label.
  const Icon = isDark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
      title={isDark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
      className="grid size-9 place-items-center rounded-full text-slate hover:bg-haze hover:text-sumi"
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
