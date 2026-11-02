import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config.js';
import { REFRESH_TOKEN_TTL_MS } from './sessions.js';

export const REFRESH_COOKIE = 'mieru_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

function isSecureOrigin(config: AppConfig): boolean {
  return new URL(config.APP_ORIGIN).protocol === 'https:';
}

export function setRefreshCookie(reply: FastifyReply, token: string, config: AppConfig): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isSecureOrigin(config),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  });
}

export function clearRefreshCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isSecureOrigin(config),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

export function readRefreshCookie(request: FastifyRequest): string | null {
  return request.cookies[REFRESH_COOKIE] ?? null;
}
