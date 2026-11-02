import { describe, expect, it } from 'vitest';
import { linkTokenFor, rememberLinkToken } from './link-store.js';

describe('link token store', () => {
  it('attaches tokens only to requests for the linked model', () => {
    const modelId = '01933c1e-7a6b-7cde-8f00-123456789abc';
    rememberLinkToken(modelId, 'secret-token');
    expect(linkTokenFor(`/api/models/${modelId}`)).toBe('secret-token');
    expect(linkTokenFor(`/api/models/${modelId}/graph?version=1`)).toBe('secret-token');
    expect(linkTokenFor('/api/models/01933c1e-7a6b-7cde-8f00-000000000000')).toBeNull();
    expect(linkTokenFor('/api/me')).toBeNull();
  });
});
