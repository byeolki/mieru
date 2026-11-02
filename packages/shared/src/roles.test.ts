import { describe, expect, it } from 'vitest';
import { hasRoleAtLeast, strongerRole } from './roles.js';

describe('hasRoleAtLeast', () => {
  it('orders viewer < editor < owner', () => {
    expect(hasRoleAtLeast('viewer', 'viewer')).toBe(true);
    expect(hasRoleAtLeast('viewer', 'editor')).toBe(false);
    expect(hasRoleAtLeast('editor', 'viewer')).toBe(true);
    expect(hasRoleAtLeast('owner', 'editor')).toBe(true);
    expect(hasRoleAtLeast('editor', 'owner')).toBe(false);
  });
});

describe('strongerRole', () => {
  it('treats null as no access', () => {
    expect(strongerRole(null, null)).toBeNull();
    expect(strongerRole(null, 'viewer')).toBe('viewer');
    expect(strongerRole('editor', null)).toBe('editor');
  });

  it('picks the higher role', () => {
    expect(strongerRole('viewer', 'editor')).toBe('editor');
    expect(strongerRole('owner', 'editor')).toBe('owner');
  });
});
