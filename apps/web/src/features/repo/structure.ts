import type { ModuleNode, OpFamily, ParsedModel } from '@mieru/shared';
import type { OnnxNode } from '@mieru/shared';
import {
  buildGroupTree,
  ROOT_GROUP,
  type GroupInfo,
  type GroupTree,
} from './graph/visible-graph.js';

/** One top-level block of a model, as the overview lists it. */
export interface StructureBlock {
  key: string;
  label: string;
  /** Graph nodes (ONNX) or tensors (safetensors) inside the block. */
  count: number;
  countUnit: '노드' | '텐서';
  paramCount: number;
  families: Partial<Record<OpFamily, number>>;
}

function countTensors(module: ModuleNode): number {
  return module.children.reduce((sum, child) => sum + countTensors(child), module.tensors.length);
}

/** Skips wrappers with a single child (`model` → `model.layers`) so the list starts where it branches. */
function firstBranch(module: ModuleNode): ModuleNode {
  let current = module;
  while (current.children.length === 1 && current.tensors.length === 0) {
    const [only] = current.children;
    if (!only) break;
    current = only;
  }
  return current;
}

/** Same idea for ONNX groups: skip single-child wrappers with no nodes of their own. */
function firstGroupBranch(tree: GroupTree): GroupInfo | undefined {
  let current = tree.groups.get(ROOT_GROUP);
  while (current && current.childGroups.length === 1 && current.directNodes.length === 0) {
    const next = tree.groups.get(current.childGroups[0] ?? '');
    if (!next) break;
    current = next;
  }
  return current;
}

type Entry = { group: GroupInfo } | { node: OnnxNode };

/** The list opens blocks until it has at least this many entries… */
const MIN_BLOCKS = 8;
/** …but never past this many. */
const MAX_BLOCKS = 40;

function groupBlock(group: GroupInfo): StructureBlock {
  return {
    key: group.path,
    label: group.label,
    count: group.nodeCount,
    countUnit: '노드',
    paramCount: group.paramCount,
    families: group.families,
  };
}

function nodeBlock(node: OnnxNode): StructureBlock {
  return {
    key: node.id,
    label: node.opType,
    count: 1,
    countUnit: '노드',
    paramCount: node.paramCount,
    families: { [node.family]: 1 },
  };
}

/**
 * The blocks a model is made of, from the first level where it branches: layers and other
 * top-level groups for ONNX, top-level modules for safetensors.
 */
export function structureBlocks(parsed: ParsedModel): StructureBlock[] {
  const { payload } = parsed;
  if (payload.kind === 'safetensors-tree') {
    const branch = firstBranch(payload.root);
    return branch.children.map((child) => ({
      key: child.path,
      label: child.path || child.name,
      count: countTensors(child),
      countUnit: '텐서',
      paramCount: child.paramCount,
      families: {},
    }));
  }
  const tree = buildGroupTree(payload.nodes);
  const branch = firstGroupBranch(tree);
  if (!branch) return [];
  const nodesById = new Map(payload.nodes.map((node) => [node.id, node]));
  const contentsOf = (group: GroupInfo): Entry[] => [
    ...group.childGroups.flatMap((path): Entry[] => {
      const child = tree.groups.get(path);
      return child ? [{ group: child }] : [];
    }),
    ...group.directNodes.flatMap((id): Entry[] => {
      const node = nodesById.get(id);
      return node ? [{ node }] : [];
    }),
  ];
  let entries = contentsOf(branch);
  // A branch like `model` + `lm_head` says little; open the biggest block until the list has
  // enough entries to show the model's shape, without dissolving it into single ops.
  while (entries.length < MIN_BLOCKS) {
    const biggest = entries
      .filter((entry): entry is { group: GroupInfo } => 'group' in entry)
      .filter((entry) => entry.group.childGroups.length > 0)
      .sort((a, b) => b.group.nodeCount - a.group.nodeCount)[0];
    if (!biggest) break;
    const opened = contentsOf(biggest.group);
    if (entries.length - 1 + opened.length > MAX_BLOCKS) break;
    entries = entries.flatMap((entry) => (entry === biggest ? opened : [entry]));
  }
  return entries.map((entry) =>
    'group' in entry ? groupBlock(entry.group) : nodeBlock(entry.node),
  );
}
