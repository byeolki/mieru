/** A repository's URL: /{owner}/{slug}. Old /m/{id} links redirect here. */
export function modelPath(model: { slug: string; owner: { username: string } }): string {
  return `/${model.owner.username}/${model.slug}`;
}

/** Same, for payloads that carry the owner's username as a flat field. */
export function modelPathOf(ownerUsername: string, slug: string): string {
  return `/${ownerUsername}/${slug}`;
}
