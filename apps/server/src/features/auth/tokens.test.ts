import { describe, expect, it } from 'vitest';
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken, verifyAccessToken } from './tokens.js';

const secret = 's'.repeat(48);
const now = new Date('2026-11-02T00:00:00Z');

describe('access tokens', () => {
  it('round-trips claims', async () => {
    const token = await signAccessToken({ userId: 'u1', sessionId: 'f1' }, secret, now);
    expect(await verifyAccessToken(token, secret, now)).toEqual({ userId: 'u1', sessionId: 'f1' });
  });

  it('rejects expired tokens', async () => {
    const token = await signAccessToken({ userId: 'u1', sessionId: 'f1' }, secret, now);
    const later = new Date(now.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    expect(await verifyAccessToken(token, secret, later)).toBeNull();
  });

  it('rejects tokens signed with another secret or tampered with', async () => {
    const token = await signAccessToken({ userId: 'u1', sessionId: 'f1' }, secret, now);
    expect(await verifyAccessToken(token, 'o'.repeat(48), now)).toBeNull();
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', sid: 'f1' })).toString(
      'base64url',
    );
    expect(
      await verifyAccessToken(`${header}.${forgedPayload}.${signature}`, secret, now),
    ).toBeNull();
  });
});
