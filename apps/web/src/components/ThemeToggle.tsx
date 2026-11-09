import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { setThemePreference, useTheme, type ThemePreference } from '../lib/theme.js';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const LABELS: Record<ThemePreference, string> = {
  system: '시스템 설정',
  light: '라이트',
  dark: '다크',
};

const ICONS: Record<ThemePreference, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

/** Cycles system → light → dark; the label says what is on now and what a click does. */
export function ThemeToggle() {
  const { preference } = useTheme();
  const Icon = ICONS[preference];
  const next = NEXT[preference];
  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      aria-label={`테마: ${LABELS[preference]}. 눌러서 ${LABELS[next]}로 바꾸기`}
      title={`테마: ${LABELS[preference]}`}
      className="grid size-9 place-items-center rounded-full text-slate hover:bg-haze hover:text-sumi"
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
