import argon2 from 'argon2';

// OWASP's argon2id baseline: 19 MiB memory, 2 iterations, 1 lane.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/** True when a stored hash was made with weaker parameters than the current policy. */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}

/**
 * Burns the same CPU time as a real verification for unknown or locked accounts,
 * so response timing doesn't reveal which emails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= argon2.hash('mieru-dummy-password', HASH_OPTIONS);
  await argon2.verify(await dummyHash, password);
}
