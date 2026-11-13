import { MODEL_SLUG_MAX, modelSlugFromName } from '@mieru/shared';
import { selectRows, type Queryable } from '../../db/query.js';

/** Room kept at the end of a slug for a `-N` suffix when the owner already uses the base. */
const SUFFIX_ROOM = 5;

/**
 * A slug for `name` that no other repository of this owner uses. Taken slugs get `-2`, `-3`, ….
 * The unique key on (owner_id, slug) still guards against a concurrent insert.
 */
export async function freeSlug(
  db: Queryable,
  ownerId: string,
  name: string,
  exceptModelId: string | null = null,
): Promise<string> {
  const base = modelSlugFromName(name)
    .slice(0, MODEL_SLUG_MAX - SUFFIX_ROOM)
    .replace(/-+$/, '');
  const rows = await selectRows<{ slug: string }>(
    db,
    `SELECT slug FROM models
      WHERE owner_id = ? AND (slug = ? OR slug LIKE ?) AND id <> ?`,
    [ownerId, base, `${base}-%`, exceptModelId ?? ''],
  );
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${String(suffix)}`;
    if (!taken.has(candidate)) return candidate;
  }
}
