import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next.js';

describe('safeNextPath', () => {
  it('keeps relative paths', () => {
    expect(safeNextPath('/m/abc?tab=graph')).toBe('/m/abc?tab=graph');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeNextPath('https://evil.example')).toBe('/dashboard');
    expect(safeNextPath('//evil.example')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard');
    expect(safeNextPath(null)).toBe('/dashboard');
  });
});
