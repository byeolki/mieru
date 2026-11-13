import { randomInt } from 'node:crypto';
import { USERNAME_PATTERN } from '@mieru/shared';

const MAX_BASE_LENGTH = 20;
const MIN_LENGTH = 3;
const FALLBACK_BASE = 'user';

// Route segments and words that would make a profile URL ambiguous or impersonate staff.
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'dashboard',
  'explore',
  'help',
  'login',
  'logout',
  'me',
  'mieru',
  'moderator',
  'new',
  'root',
  'settings',
  'signup',
  'support',
  'system',
  'u',
  'm',
  's',
  // Top-level pages and static folders: /{username}/{slug} would shadow or be shadowed by them.
  'activity',
  'assets',
  'brand',
  'designs',
  'og',
  'stars',
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username) && !isReservedUsername(username);
}

/** Derives a username candidate from the email's local part: `Kai.Dev+x@…` → `kai-dev-x`. */
export function usernameBaseFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  const base = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/[-_]+$/, '');
  return base.length >= MIN_LENGTH && isValidUsername(base) ? base : FALLBACK_BASE;
}

export function withRandomSuffix(base: string): string {
  return `${base}-${String(randomInt(0, 10_000)).padStart(4, '0')}`;
}
