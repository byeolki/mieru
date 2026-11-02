import { describe, expect, it } from 'vitest';
import { TICKET_TTL_MS, createTicket, verifyTicket } from './tickets.js';

const secret = 't'.repeat(48);
const now = new Date('2026-11-02T00:00:00Z');
const payload = {
  modelId: 'm',
  versionId: 'v',
  kind: 'model' as const,
  userId: 'u',
  linkTokenHash: null,
};

describe('download tickets', () => {
  it('round-trips the principal', () => {
    const { token } = createTicket(payload, secret, now);
    expect(verifyTicket(token, secret, now)).toEqual({
      modelId: 'm',
      versionId: 'v',
      kind: 'model',
      principal: { userId: 'u', linkTokenHash: null },
    });
  });

  it('expires after a minute', () => {
    const { token } = createTicket(payload, secret, now);
    expect(verifyTicket(token, secret, new Date(now.getTime() + TICKET_TTL_MS + 1))).toBeNull();
  });

  it('rejects tampering and foreign secrets', () => {
    const { token } = createTicket(payload, secret, now);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...payload, userId: 'admin', expiresAt: now.getTime() + 1000 }),
    ).toString('base64url');
    expect(verifyTicket(`${forged}.${signature}`, secret, now)).toBeNull();
    expect(verifyTicket(token, 'o'.repeat(48), now)).toBeNull();
    expect(verifyTicket('garbage', secret, now)).toBeNull();
  });
});
