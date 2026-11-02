import { describe, expect, it } from 'vitest';
import { formatBytes, formatParams, formatRelative, formatShape } from './format.js';

describe('formatters', () => {
  it('formats parameter counts', () => {
    expect(formatParams(25_557_032)).toBe('25.6M');
    expect(formatParams(110_000_000)).toBe('110M');
    expect(formatParams(999)).toBe('999');
    expect(formatParams(null)).toBe('—');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(98 * 1024 * 1024)).toBe('98.0 MB');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats relative times in Korean', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    expect(formatRelative('2026-11-02T11:57:00Z', now)).toBe('3분 전');
  });

  it('formats shapes with symbolic and unknown dims', () => {
    expect(formatShape(['batch', 3, null])).toBe('[batch, 3, ?]');
    expect(formatShape(null)).toBe('?');
  });
});
