/** Only same-origin relative paths are allowed as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null, fallback = '/dashboard'): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
