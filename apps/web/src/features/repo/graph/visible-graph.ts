import type { OnnxEdge, OnnxGraphPayload, OnnxNode, OpFamily, TensorInfo } from '@mieru/shared';

export const MAX_VISIBLE = 300;
export const HARD_CAP = 1500;
const CHUNK_SIZE = 50;
const ROOT = '';

export interface GroupInfo {
  path: string;
  label: string;
  depth: number;
  parent: string | null;
  childGroups: string[];
  directNodes: string[];
  nodeCount: number;
  paramCount: number;
  families: Partial<Record<OpFamily, number>>;
}

export interface GroupTree {
  groups: Map<string, GroupInfo>;
  /** Group path of each node (after chunking ungrouped graphs). */
  nodeGroup: Map<string, string>;
  maxDepth: number;
}

export type VisibleItem =
  | { kind: 'node'; id: string; node: OnnxNode }
  | { kind: 'group'; id: string; group: GroupInfo }
  | { kind: 'io'; id: string; tensor: TensorInfo; direction: 'in' | 'out' };

export interface VisibleEdge {
  id: string;
  source: string;
  target: string;
  tensor: TensorInfo;
  /** Number of underlying edges merged into this one (collapsed groups). */
  weight: number;
}

export interface VisibleGraph {
  items: VisibleItem[];
  edges: VisibleEdge[];
  isCapped: boolean;
}

const groupId = (path: string) => `g:${path}`;

function ensureGroup(groups: Map<string, GroupInfo>, segments: string[]): string {
  let parent = ROOT;
  for (let depth = 0; depth < segments.length; depth += 1) {
    const path = segments.slice(0, depth + 1).join('/');
    if (!groups.has(path)) {
      groups.set(path, {
        path,
        label: segments[depth] ?? path,
        depth: depth + 1,
        parent,
        childGroups: [],
        directNodes: [],
        nodeCount: 0,
        paramCount: 0,
        families: {},
      });
      groups.get(parent)?.childGroups.push(path);
    }
    parent = path;
  }
  return parent;
}

/**
 * Builds the group hierarchy from exporter node names. Graphs whose nodes carry no hierarchy
 * and are too big to show at once are split into topological blocks so they stay navigable.
 */
export function buildGroupTree(nodes: readonly OnnxNode[]): GroupTree {
  const groups = new Map<string, GroupInfo>();
  groups.set(ROOT, {
    path: ROOT,
    label: '',
    depth: 0,
    parent: null,
    childGroups: [],
    directNodes: [],
    nodeCount: 0,
    paramCount: 0,
    families: {},
  });
  const ungrouped = nodes.filter((node) => node.groupPath.length === 0);
  const shouldChunk = ungrouped.length > MAX_VISIBLE;
  const nodeGroup = new Map<string, string>();
  let ungroupedIndex = 0;
  for (const node of nodes) {
    let segments = node.groupPath;
    if (segments.length === 0 && shouldChunk) {
      segments = [`블록 ${Math.floor(ungroupedIndex / CHUNK_SIZE) + 1}`];
      ungroupedIndex += 1;
    }
    const path = ensureGroup(groups, segments);
    groups.get(path)?.directNodes.push(node.id);
    nodeGroup.set(node.id, path);
    // Aggregate counts up the chain.
    let cursor: string | null = path;
    while (cursor !== null) {
      const group = groups.get(cursor);
      if (!group) break;
      group.nodeCount += 1;
      group.paramCount += node.paramCount;
      group.families[node.family] = (group.families[node.family] ?? 0) + 1;
      cursor = group.parent;
    }
  }
  let maxDepth = 0;
  for (const group of groups.values()) maxDepth = Math.max(maxDepth, group.depth);
  return { groups, nodeGroup, maxDepth };
}

function countVisible(tree: GroupTree, expanded: ReadonlySet<string>): number {
  let count = 0;
  for (const path of expanded) {
    const group = tree.groups.get(path);
    if (!group) continue;
    count += group.directNodes.length;
    count += group.childGroups.filter((child) => !expanded.has(child)).length;
  }
  return count;
}

function expandedToDepth(tree: GroupTree, depth: number): Set<string> {
  const expanded = new Set<string>();
  for (const group of tree.groups.values()) if (group.depth < depth) expanded.add(group.path);
  return expanded;
}

const MIN_USEFUL_ITEMS = 8;

/** Expands groups that are the only child of an expanded group (wrappers like `model`). */
function expandWrappers(tree: GroupTree, expanded: Set<string>): Set<string> {
  let changed = true;
  while (changed) {
    changed = false;
    for (const path of expanded) {
      const group = tree.groups.get(path);
      const onlyChild =
        group?.childGroups.length === 1 && group.directNodes.length === 0
          ? group.childGroups[0]
          : undefined;
      if (onlyChild !== undefined && !expanded.has(onlyChild)) {
        expanded.add(onlyChild);
        changed = true;
      }
    }
  }
  return expanded;
}

function expandedToLevel(tree: GroupTree, depth: number): Set<string> {
  const expanded = expandWrappers(tree, expandedToDepth(tree, depth));
  return expanded;
}

/**
 * The deepest uniform expansion level that keeps the canvas at or under `maxVisible` items,
 * skipping single-child wrappers. If that view would be nearly empty (a few huge blocks),
 * the next level is used as long as it stays under the hard cap.
 */
export function initialExpanded(tree: GroupTree, maxVisible = MAX_VISIBLE): Set<string> {
  let best = expandedToLevel(tree, 1);
  for (let depth = 2; depth <= tree.maxDepth + 1; depth += 1) {
    const candidate = expandedToLevel(tree, depth);
    const count = countVisible(tree, candidate);
    if (count > maxVisible) {
      if (countVisible(tree, best) < MIN_USEFUL_ITEMS && count <= HARD_CAP) best = candidate;
      break;
    }
    best = candidate;
  }
  return best;
}

/** Item id that represents a node on screen: the node itself, or its outermost collapsed group. */
export function representativeOf(
  nodeId: string,
  tree: GroupTree,
  expanded: ReadonlySet<string>,
): string {
  const chain: string[] = [];
  let cursor: string | null = tree.nodeGroup.get(nodeId) ?? ROOT;
  while (cursor !== null && cursor !== ROOT) {
    chain.unshift(cursor);
    cursor = tree.groups.get(cursor)?.parent ?? null;
  }
  for (const path of chain) {
    // A collapsed group holding a single node would only hide it behind an extra box.
    if (!expanded.has(path) && (tree.groups.get(path)?.nodeCount ?? 0) > 1) return groupId(path);
  }
  return nodeId;
}

/** Expands every ancestor group of a node (used when search jumps to it). */
export function expandAncestors(
  nodeId: string,
  tree: GroupTree,
  expanded: ReadonlySet<string>,
): Set<string> {
  const next = new Set(expanded);
  let cursor: string | null = tree.nodeGroup.get(nodeId) ?? ROOT;
  while (cursor !== null) {
    next.add(cursor);
    cursor = tree.groups.get(cursor)?.parent ?? null;
  }
  return next;
}

/** Computes what the canvas shows for the current expansion state. */
export function buildVisibleGraph(
  payload: OnnxGraphPayload,
  tree: GroupTree,
  expanded: ReadonlySet<string>,
): VisibleGraph {
  const nodesById = new Map(payload.nodes.map((node) => [node.id, node]));
  const items: VisibleItem[] = payload.inputs.map((tensor) => ({
    kind: 'io' as const,
    id: `in:${tensor.name}`,
    tensor,
    direction: 'in' as const,
  }));
  const seenGroups = new Set<string>();
  for (const node of payload.nodes) {
    const representative = representativeOf(node.id, tree, expanded);
    if (representative === node.id) {
      items.push({ kind: 'node', id: node.id, node });
    } else if (!seenGroups.has(representative)) {
      seenGroups.add(representative);
      const group = tree.groups.get(representative.slice(2));
      if (group) items.push({ kind: 'group', id: representative, group });
    }
  }
  for (const tensor of payload.outputs)
    items.push({ kind: 'io', id: `out:${tensor.name}`, tensor, direction: 'out' });

  const isCapped = items.length > HARD_CAP;
  const visibleIds = new Set(items.map((item) => item.id));
  const resolve = (id: string) => (nodesById.has(id) ? representativeOf(id, tree, expanded) : id);
  const merged = new Map<string, VisibleEdge>();
  for (const edge of payload.edges as readonly OnnxEdge[]) {
    const source = resolve(edge.source);
    const target = resolve(edge.target);
    if (source === target || !visibleIds.has(source) || !visibleIds.has(target)) continue;
    const key = `${source}->${target}`;
    const existing = merged.get(key);
    if (existing) existing.weight += 1;
    else merged.set(key, { id: key, source, target, tensor: edge.tensor, weight: 1 });
  }
  return {
    items: isCapped ? items.slice(0, HARD_CAP) : items,
    edges: [...merged.values()],
    isCapped,
  };
}

/** All item ids upstream and downstream of `id` (for hover highlighting). */
export function connectedIds(id: string, edges: readonly VisibleEdge[]): Set<string> {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of edges) {
    forward.set(edge.source, [...(forward.get(edge.source) ?? []), edge.target]);
    backward.set(edge.target, [...(backward.get(edge.target) ?? []), edge.source]);
  }
  const result = new Set([id]);
  for (const adjacency of [forward, backward]) {
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) break;
      for (const next of adjacency.get(current) ?? []) {
        if (!result.has(next)) {
          result.add(next);
          queue.push(next);
        }
      }
    }
  }
  return result;
}
