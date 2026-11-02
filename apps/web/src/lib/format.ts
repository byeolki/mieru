const PARAM_UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** 25_557_032 → "25.6M"; small counts stay exact. */
export function formatParams(count: number | null | undefined): string {
  if (count === null || count === undefined) return '—';
  for (const [threshold, unit] of PARAM_UNITS) {
    if (count >= threshold)
      return `${(count / threshold).toFixed(count / threshold >= 100 ? 0 : 1)}${unit}`;
  }
  return String(count);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${BYTE_UNITS[unit] ?? 'B'}`;
}

const relative = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
const STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.35, 'week'],
  [12, 'month'],
  [Number.POSITIVE_INFINITY, 'year'],
];

/** "3분 전", "어제", "2주 전". */
export function formatRelative(iso: string, now = Date.now()): string {
  let delta = (new Date(iso).getTime() - now) / 1000;
  for (const [size, unit] of STEPS) {
    if (Math.abs(delta) < size) return relative.format(Math.round(delta), unit);
    delta /= size;
  }
  return relative.format(Math.round(delta), 'year');
}

export function formatShape(shape: readonly (number | string | null)[] | null): string {
  if (!shape) return '?';
  return `[${shape.map((dim) => (dim === null ? '?' : String(dim))).join(', ')}]`;
}
