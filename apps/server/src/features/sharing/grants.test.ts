import { describe, expect, it } from 'vitest';
import { combineGrants, type GrantInputs, type LinkGrant } from './grants.js';

const now = new Date('2026-11-02T00:00:00Z');
const past = new Date('2026-11-01T00:00:00Z');
const future = new Date('2026-12-01T00:00:00Z');

function inputs(overrides: Partial<GrantInputs> = {}): GrantInputs {
  return {
    model: { ownerId: 'owner', visibility: 'private', publicAllowDownload: true, takenDown: false },
    userId: 'someone',
    isAdmin: false,
    share: null,
    headerLink: null,
    visitedLinks: [],
    now,
    ...overrides,
  };
}

const link = (overrides: Partial<LinkGrant> = {}): LinkGrant => ({
  role: 'viewer',
  allowDownload: false,
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

const withVisibility = (
  visibility: GrantInputs['model']['visibility'],
  extra: Partial<GrantInputs['model']> = {},
) => ({
  model: { ownerId: 'owner', visibility, publicAllowDownload: true, takenDown: false, ...extra },
});

describe('combineGrants (plan §7.3)', () => {
  it('owner always owns', () => {
    expect(combineGrants(inputs({ userId: 'owner' }))).toEqual({
      role: 'owner',
      canDownload: true,
      via: 'owner',
    });
  });

  it('private models are invisible to everyone else, shares and links stay dormant', () => {
    expect(combineGrants(inputs({ share: { role: 'editor', allowDownload: true } }))).toBeNull();
    expect(combineGrants(inputs({ headerLink: link() }))).toBeNull();
    expect(combineGrants(inputs({ userId: null }))).toBeNull();
  });

  it('direct shares apply from "specific people" upward, with their download setting', () => {
    const viewer = combineGrants(
      inputs({ ...withVisibility('users'), share: { role: 'viewer', allowDownload: false } }),
    );
    expect(viewer).toEqual({ role: 'viewer', canDownload: false, via: 'share' });
    const editor = combineGrants(
      inputs({ ...withVisibility('users'), share: { role: 'editor', allowDownload: false } }),
    );
    expect(editor).toEqual({ role: 'editor', canDownload: true, via: 'share' });
  });

  it('links need "anyone with the link" or public visibility', () => {
    expect(combineGrants(inputs({ ...withVisibility('users'), headerLink: link() }))).toBeNull();
    expect(combineGrants(inputs({ ...withVisibility('link'), headerLink: link() }))?.via).toBe(
      'link',
    );
  });

  it('caps anonymous link visitors at viewer, even on editor links', () => {
    const access = combineGrants(
      inputs({
        ...withVisibility('link'),
        userId: null,
        headerLink: link({ role: 'editor', allowDownload: false }),
      }),
    );
    expect(access).toEqual({ role: 'viewer', canDownload: false, via: 'link' });
  });

  it('gives signed-in visitors the link role, including through a remembered visit', () => {
    expect(
      combineGrants(inputs({ ...withVisibility('link'), headerLink: link({ role: 'editor' }) }))
        ?.role,
    ).toBe('editor');
    expect(
      combineGrants(inputs({ ...withVisibility('link'), visitedLinks: [link({ role: 'editor' })] }))
        ?.role,
    ).toBe('editor');
    expect(
      combineGrants(
        inputs({
          ...withVisibility('link'),
          userId: null,
          visitedLinks: [link({ role: 'editor' })],
        }),
      ),
    ).toBeNull();
  });

  it('ignores expired and revoked links', () => {
    expect(
      combineGrants(inputs({ ...withVisibility('link'), headerLink: link({ expiresAt: past }) })),
    ).toBeNull();
    expect(
      combineGrants(inputs({ ...withVisibility('link'), headerLink: link({ revokedAt: past }) })),
    ).toBeNull();
    expect(
      combineGrants(inputs({ ...withVisibility('link'), headerLink: link({ expiresAt: future }) })),
    ).not.toBeNull();
  });

  it('public models are viewable by anyone, download per owner choice', () => {
    expect(combineGrants(inputs({ ...withVisibility('public'), userId: null }))).toEqual({
      role: 'viewer',
      canDownload: true,
      via: 'public',
    });
    expect(
      combineGrants(
        inputs({ ...withVisibility('public', { publicAllowDownload: false }), userId: null }),
      )?.canDownload,
    ).toBe(false);
  });

  it('takes the strongest role and ORs download rights across sources', () => {
    const access = combineGrants(
      inputs({
        ...withVisibility('public', { publicAllowDownload: false }),
        share: { role: 'viewer', allowDownload: false },
        headerLink: link({ role: 'viewer', allowDownload: true }),
      }),
    );
    expect(access).toMatchObject({ role: 'viewer', canDownload: true });
  });

  it('takedown hides the model from everyone but the owner (read-only) and admins', () => {
    const takenDown = withVisibility('public', { takenDown: true });
    expect(combineGrants(inputs({ ...takenDown, userId: null }))).toBeNull();
    expect(
      combineGrants(inputs({ ...takenDown, share: { role: 'editor', allowDownload: true } })),
    ).toBeNull();
    expect(combineGrants(inputs({ ...takenDown, userId: 'owner' }))).toEqual({
      role: 'viewer',
      canDownload: false,
      via: 'owner',
    });
    expect(combineGrants(inputs({ ...takenDown, isAdmin: true }))).toEqual({
      role: 'viewer',
      canDownload: false,
      via: 'admin',
    });
  });

  it('admins can view any model for moderation', () => {
    expect(combineGrants(inputs({ isAdmin: true }))).toEqual({
      role: 'viewer',
      canDownload: false,
      via: 'admin',
    });
  });
});
