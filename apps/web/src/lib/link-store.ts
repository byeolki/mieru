// Share-link tokens opened in this tab, keyed by model id. Kept in memory only: the token is a
// bearer credential, so it never goes to storage or stays in the address bar.
const tokensByModel = new Map<string, string>();

export function rememberLinkToken(modelId: string, token: string): void {
  tokensByModel.set(modelId, token);
}

const MODEL_PATH = /^\/api\/models\/([0-9a-f-]{36})(?:\/|$|\?)/;

/** The link token to send with a request to `path`, if that path belongs to a linked model. */
export function linkTokenFor(path: string): string | null {
  const modelId = MODEL_PATH.exec(path)?.[1];
  return modelId ? (tokensByModel.get(modelId) ?? null) : null;
}
