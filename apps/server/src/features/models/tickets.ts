import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Principal } from '../sharing/access-service.js';

export const TICKET_TTL_MS = 60_000;

interface TicketPayload {
  modelId: string;
  versionId: string;
  kind: 'model' | 'labels';
  userId: string | null;
  linkTokenHash: string | null;
  expiresAt: number;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * A 60-second bearer URL for one file. It records who asked (user or link) rather than
 * granting access itself: the download route re-checks permissions with that principal,
 * so revoking a share or link takes effect on the very next byte-range request.
 */
export function createTicket(
  payload: Omit<TicketPayload, 'expiresAt'>,
  secret: string,
  now: Date,
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + TICKET_TTL_MS);
  const body = Buffer.from(JSON.stringify({ ...payload, expiresAt: expiresAt.getTime() })).toString(
    'base64url',
  );
  return { token: `${body}.${sign(body, secret)}`, expiresAt };
}

export interface VerifiedTicket {
  modelId: string;
  versionId: string;
  kind: 'model' | 'labels';
  principal: Principal;
}

export function verifyTicket(token: string, secret: string, now: Date): VerifiedTicket | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TicketPayload;
  } catch {
    return null;
  }
  if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= now.getTime()) return null;
  return {
    modelId: payload.modelId,
    versionId: payload.versionId,
    kind: payload.kind,
    principal: {
      userId: payload.userId,
      linkTokenHash: payload.linkTokenHash ? Buffer.from(payload.linkTokenHash, 'hex') : null,
    },
  };
}
