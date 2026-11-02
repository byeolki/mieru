import { describe, expect, it } from 'vitest';
import { decryptLinkToken, encryptLinkToken } from './link-tokens.js';

describe('link token encryption', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const secret = 'k'.repeat(48);
    const a = encryptLinkToken('token-value', secret);
    const b = encryptLinkToken('token-value', secret);
    expect(a.equals(b)).toBe(false);
    expect(decryptLinkToken(a, secret)).toBe('token-value');
  });

  it('fails with another key or tampered bytes', () => {
    const payload = encryptLinkToken('token-value', 'k'.repeat(48));
    expect(() => decryptLinkToken(payload, 'o'.repeat(48))).toThrow();
    const tampered = Buffer.from(payload);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => decryptLinkToken(tampered, 'k'.repeat(48))).toThrow();
  });
});
