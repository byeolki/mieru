import type { OnnxGraphPayload, OpFamily } from '@mieru/shared';

/** Upper bound on exposed tensors: each one is copied out of the runtime after every run. */
export const MAX_INTERMEDIATES = 48;

const VISIBLE_FAMILIES: ReadonlySet<OpFamily> = new Set([
  'compute',
  'attention',
  'normalization',
  'activation',
]);

export interface Intermediate {
  /** Tensor name to request from the runtime. */
  output: string;
  nodeName: string;
  opType: string;
  family: OpFamily;
}

/**
 * Chooses node outputs worth showing as feature maps, in graph order. Shape plumbing
 * (Reshape, Transpose, ...) is skipped; long graphs are sampled evenly so early, middle and
 * late layers are all represented.
 */
export function pickIntermediates(
  graph: Pick<OnnxGraphPayload, 'nodes' | 'outputs'>,
  limit = MAX_INTERMEDIATES,
): Intermediate[] {
  const graphOutputs = new Set(graph.outputs.map((tensor) => tensor.name));
  const candidates = graph.nodes.flatMap((node) => {
    const output = node.outputs[0];
    if (!output || graphOutputs.has(output) || !VISIBLE_FAMILIES.has(node.family)) return [];
    return [{ output, nodeName: node.name, opType: node.opType, family: node.family }];
  });
  if (candidates.length <= limit) return candidates;
  const step = candidates.length / limit;
  return Array.from({ length: limit }, (_, index) => candidates[Math.floor(index * step)]).filter(
    (candidate): candidate is Intermediate => candidate !== undefined,
  );
}
