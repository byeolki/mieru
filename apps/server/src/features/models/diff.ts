import type { AttrValue, ModelDiff, NodeChange, OnnxNode, ParsedModel } from '@mieru/shared';
import type { TensorIndexEntry } from '../../parsing/tensor-index.js';

interface TensorSide {
  index: readonly TensorIndexEntry[];
  /** Content hash per tensor name; only needed for tensors present in both versions. */
  hashes: ReadonlyMap<string, string>;
}

type Counts = ModelDiff['summary']['nodes'];

const emptyCounts = (): Counts => ({ added: 0, removed: 0, changed: 0, unchanged: 0 });

function sameShape(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((dim, index) => dim === b[index]);
}

/** Names of tensors whose dtype, shape or bytes differ between two versions. */
export function changedTensorNames(from: TensorSide, to: TensorSide): Set<string> {
  const toByName = new Map(to.index.map((entry) => [entry.name, entry]));
  const changed = new Set<string>();
  for (const entry of from.index) {
    const other = toByName.get(entry.name);
    if (!other) continue;
    const isDifferent =
      entry.dtype !== other.dtype ||
      !sameShape(entry.shape, other.shape) ||
      from.hashes.get(entry.name) !== to.hashes.get(entry.name);
    if (isDifferent) changed.add(entry.name);
  }
  return changed;
}

function stableAttributes(attributes: Record<string, AttrValue>): string {
  return JSON.stringify(
    Object.keys(attributes)
      .sort()
      .map((key) => [key, attributes[key]]),
  );
}

function nodeChanges(
  from: OnnxNode,
  to: OnnxNode,
  changedTensors: ReadonlySet<string>,
): NodeChange[] {
  const changes: NodeChange[] = [];
  if (from.opType !== to.opType) changes.push('op');
  if (stableAttributes(from.attributes) !== stableAttributes(to.attributes))
    changes.push('attributes');
  if (from.inputs.join('\u0000') !== to.inputs.join('\u0000')) changes.push('inputs');
  if (to.params.some((param) => changedTensors.has(param.name))) changes.push('weights');
  return changes;
}

function diffNodes(from: ParsedModel, to: ParsedModel, changedTensors: ReadonlySet<string>) {
  const counts = emptyCounts();
  const nodes: ModelDiff['nodes'] = [];
  if (from.payload.kind !== 'onnx-graph' || to.payload.kind !== 'onnx-graph')
    return { nodes, counts };
  const fromByName = new Map(from.payload.nodes.map((node) => [node.name, node]));
  const seen = new Set<string>();
  for (const node of to.payload.nodes) {
    const previous = fromByName.get(node.name);
    seen.add(node.name);
    if (!previous) {
      counts.added++;
      nodes.push({ name: node.name, opType: node.opType, status: 'added', changes: [] });
      continue;
    }
    const changes = nodeChanges(previous, node, changedTensors);
    if (changes.length === 0) {
      counts.unchanged++;
      continue;
    }
    counts.changed++;
    nodes.push({ name: node.name, opType: node.opType, status: 'changed', changes });
  }
  for (const node of from.payload.nodes) {
    if (seen.has(node.name)) continue;
    counts.removed++;
    nodes.push({ name: node.name, opType: node.opType, status: 'removed', changes: [] });
  }
  return { nodes, counts };
}

function diffTensors(from: TensorSide, to: TensorSide, changedTensors: ReadonlySet<string>) {
  const counts = emptyCounts();
  const tensors: ModelDiff['tensors'] = [];
  const fromByName = new Map(from.index.map((entry) => [entry.name, entry]));
  const toNames = new Set(to.index.map((entry) => entry.name));
  for (const entry of to.index) {
    const previous = fromByName.get(entry.name);
    if (!previous) {
      counts.added++;
      tensors.push({ name: entry.name, status: 'added', fromShape: null, toShape: entry.shape });
    } else if (changedTensors.has(entry.name)) {
      counts.changed++;
      tensors.push({
        name: entry.name,
        status: 'changed',
        fromShape: previous.shape,
        toShape: entry.shape,
      });
    } else {
      counts.unchanged++;
    }
  }
  for (const entry of from.index) {
    if (toNames.has(entry.name)) continue;
    counts.removed++;
    tensors.push({ name: entry.name, status: 'removed', fromShape: entry.shape, toShape: null });
  }
  return { tensors, counts };
}

/**
 * Compares two parsed versions. Nodes match by name (ONNX only); tensors match by name and
 * count as changed when dtype, shape or content hash differ.
 */
export function computeModelDiff(
  versions: { from: number; to: number },
  parsed: { from: ParsedModel; to: ParsedModel },
  tensors: { from: TensorSide; to: TensorSide },
): ModelDiff {
  const changedTensors = changedTensorNames(tensors.from, tensors.to);
  const nodeDiff = diffNodes(parsed.from, parsed.to, changedTensors);
  const tensorDiff = diffTensors(tensors.from, tensors.to, changedTensors);
  return {
    from: versions.from,
    to: versions.to,
    nodes: nodeDiff.nodes,
    tensors: tensorDiff.tensors,
    summary: {
      nodes: nodeDiff.counts,
      tensors: tensorDiff.counts,
      paramsFrom: parsed.from.summary.totalParams,
      paramsTo: parsed.to.summary.totalParams,
    },
  };
}
