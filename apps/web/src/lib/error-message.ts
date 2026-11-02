import type { TFunction } from 'i18next';
import { ApiError } from './api-error.js';

const KNOWN_CODES = new Set([
  'invalid_credentials',
  'email_taken',
  'rate_limited',
  'validation_failed',
  'wrong_password',
  'username_taken',
  'username_cooldown',
  'invalid_username',
  'confirm_mismatch',
]);

/** Turns any thrown value into a Korean sentence that says what happened. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.code === 'account_locked') {
      const seconds = Number(error.details?.retryAfterSec ?? 60);
      return t('errors.account_locked', { minutes: Math.max(1, Math.ceil(seconds / 60)) });
    }
    if (KNOWN_CODES.has(error.code)) return t(`errors.${error.code}`);
    return t('errors.unknown');
  }
  if (error instanceof TypeError) return t('errors.network');
  return t('errors.unknown');
}
