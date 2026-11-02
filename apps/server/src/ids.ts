import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUIDv7 for primary keys: unguessable in URLs, roughly sequential for InnoDB. */
export function newId(): string {
  return uuidv7();
}
