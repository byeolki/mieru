/** True when MySQL rejected a write because of a unique key (ER_DUP_ENTRY). */
export function isDuplicateKeyError(error: unknown, keyName?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, sqlMessage } = error as { code?: unknown; sqlMessage?: unknown };
  if (code !== 'ER_DUP_ENTRY') return false;
  return keyName === undefined || (typeof sqlMessage === 'string' && sqlMessage.includes(keyName));
}
