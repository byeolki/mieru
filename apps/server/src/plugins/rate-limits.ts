import rateLimit from '@fastify/rate-limit';
import type { FastifyContextConfig, FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';

const GLOBAL_MAX_PER_MINUTE = 300;

export interface RouteLimit {
  max: number;
  timeWindow: string;
}

/** Per-route limits from the plan (§6.9). Keyed on the client IP unless stated otherwise. */
export const LIMITS = {
  login: { max: 10, timeWindow: '1 minute' },
  signup: { max: 5, timeWindow: '1 hour' },
  refresh: { max: 30, timeWindow: '1 minute' },
  sensitiveAccountChange: { max: 10, timeWindow: '1 hour' },
} satisfies Record<string, RouteLimit>;

export async function registerRateLimits(
  app: FastifyInstance,
  options: { enabled: boolean },
): Promise<void> {
  await app.register(rateLimit, {
    global: options.enabled,
    max: options.enabled ? GLOBAL_MAX_PER_MINUTE : Number.MAX_SAFE_INTEGER,
    timeWindow: '1 minute',
    // Thrown as an AppError so the shared error handler renders the standard error shape.
    errorResponseBuilder: (_request, context) =>
      new AppError(429, 'rate_limited', 'Too many requests', {
        retryAfterSec: Math.ceil(context.ttl / 1000),
      }),
  });
}

/** Route config enabling a specific limit (no-op when rate limiting is disabled in tests). */
export function routeLimit(limit: RouteLimit, enabled: boolean): FastifyContextConfig {
  return { rateLimit: enabled ? limit : false };
}
