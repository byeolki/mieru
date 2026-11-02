import { describe, expect, it } from 'vitest';
import { limitParam } from './query.js';

describe('limitParam', () => {
  it('binds pagination values as strings', () => {
    expect(limitParam(20)).toBe('20');
    expect(limitParam(0)).toBe('0');
  });

  it('rejects negative or fractional values', () => {
    expect(() => limitParam(-1)).toThrow(RangeError);
    expect(() => limitParam(1.5)).toThrow(RangeError);
  });
});
