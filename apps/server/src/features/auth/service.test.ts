import { describe, expect, it } from 'vitest';
import { lockDurationMs } from './service.js';

describe('lockDurationMs', () => {
  it('allows four free failures', () => {
    expect(lockDurationMs(1)).toBeNull();
    expect(lockDurationMs(4)).toBeNull();
  });

  it('doubles from one minute and caps at thirty', () => {
    expect(lockDurationMs(5)).toBe(60_000);
    expect(lockDurationMs(6)).toBe(120_000);
    expect(lockDurationMs(9)).toBe(16 * 60_000);
    expect(lockDurationMs(10)).toBe(30 * 60_000);
    expect(lockDurationMs(50)).toBe(30 * 60_000);
  });
});
