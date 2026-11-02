import { describe, expect, it } from 'vitest';
import { isValidUsername, usernameBaseFromEmail, withRandomSuffix } from './username.js';

describe('usernameBaseFromEmail', () => {
  it('normalizes the local part', () => {
    expect(usernameBaseFromEmail('kai.dev@x.com')).toBe('kai-dev');
    expect(usernameBaseFromEmail('Kai.Dev+tag@x.com')).toBe('kai-dev-tag');
    expect(usernameBaseFromEmail('__mio__@x.com')).toBe('mio');
  });

  it('falls back for short, empty, non-latin or reserved local parts', () => {
    expect(usernameBaseFromEmail('ab@x.com')).toBe('user');
    expect(usernameBaseFromEmail('김철수@x.com')).toBe('user');
    expect(usernameBaseFromEmail('admin@x.com')).toBe('user');
  });

  it('caps the length so a suffix still fits', () => {
    const base = usernameBaseFromEmail(`${'a'.repeat(40)}@x.com`);
    expect(base).toHaveLength(20);
    expect(isValidUsername(withRandomSuffix(base))).toBe(true);
  });
});

describe('withRandomSuffix', () => {
  it('appends four digits', () => {
    expect(withRandomSuffix('kai')).toMatch(/^kai-\d{4}$/);
  });
});
