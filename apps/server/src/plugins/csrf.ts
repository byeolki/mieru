import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

/** Exact APP_ORIGIN match; in development any local origin (Paseo assigns random ports). */
export function isAllowedOrigin(origin: string, config: AppConfig): boolean {
  if (origin === new URL(config.APP_ORIGIN).origin) return true;
  if (config.NODE_ENV !== 'development') return false;
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Guards the only cookie-authenticated routes (refresh, logout). Together with the
 * SameSite=Strict cookie, a matching Origin plus a JSON body means no other site can drive them.
 */
export function cookieRouteGuard(config: AppConfig) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const origin = request.headers.origin;
    if (!origin || !isAllowedOrigin(origin, config)) {
      throw new AppError(403, 'bad_origin', 'Request origin not allowed');
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      throw new AppError(415, 'json_required', 'Content-Type must be application/json');
    }
  };
}
