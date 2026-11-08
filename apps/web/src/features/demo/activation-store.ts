import { createContext, useContext, useSyncExternalStore } from 'react';

/** Small preview of one tensor from the last demo run, drawn on graph nodes. */
export interface ActivationPreview {
  dataUrl: string;
  dims: number[];
}

interface Snapshot {
  modelId: string | null;
  previews: ReadonlyMap<string, ActivationPreview>;
}

let snapshot: Snapshot = { modelId: null, previews: new Map() };
const listeners = new Set<() => void>();

/** Replaces the previews with those from a new run of `modelId`. */
export function publishActivations(
  modelId: string,
  previews: Map<string, ActivationPreview>,
): void {
  snapshot = { modelId, previews };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Which repository the graph belongs to, so another model's previews never show up on it. */
export const ActivationModelContext = createContext<string | null>(null);

export function useActivationPreview(tensorName: string | undefined): ActivationPreview | null {
  const modelId = useContext(ActivationModelContext);
  const current = useSyncExternalStore(subscribe, () => snapshot);
  if (!tensorName || !modelId || current.modelId !== modelId) return null;
  return current.previews.get(tensorName) ?? null;
}
