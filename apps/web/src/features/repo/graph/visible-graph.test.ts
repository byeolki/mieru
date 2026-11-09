import { describe, expect, it } from 'vitest';
import type { OnnxGraphPayload, OnnxNode } from '@mieru/shared';
import {
  HARD_CAP,
  MAX_VISIBLE,
  buildGroupTree,
  buildVisibleGraph,
  connectedIds,
  expandAncestors,
  foldIo,
  initialExpanded,
  representativeOf,
} from './visible-graph.js';

function node(id: string, groupPath: string[], opType = 'MatMul'): OnnxNode {
  return {
    id,
    name: [...groupPath, opType].join('/'),
    opType,
    domain: '',
    family: 'compute',
    groupPath,
    inputs: [],
    outputs: [],
    params: [],
    paramCount: 10,
    attributes: {},
  };
}

function chainPayload(nodes: OnnxNode[]): OnnxGraphPayload {
  const edges = nodes.slice(1).map((target, index) => ({
    id: `e${index}`,
    source: nodes[index]?.id ?? '',
    target: target.id,
    tensor: { name: `t${index}`, dtype: null, shape: null },
  }));
  return {
    kind: 'onnx-graph',
    inputs: [{ name: 'x', dtype: 'float32', shape: [1] }],
    outputs: [{ name: 'y', dtype: 'float32', shape: [1] }],
    nodes,
    edges: [
      {
        id: 'ein',
        source: 'in:x',
        target: nodes[0]?.id ?? '',
        tensor: { name: 'x', dtype: null, shape: null },
      },
      ...edges,
      {
        id: 'eout',
        source: nodes.at(-1)?.id ?? '',
        target: 'out:y',
        tensor: { name: 'y', dtype: null, shape: null },
      },
    ],
    metadata: {},
  };
}

/** `layers` transformer-like layers with 12 nodes each, nested model/layers.N/block. */
function layeredNodes(layers: number): OnnxNode[] {
  const nodes: OnnxNode[] = [];
  for (let layer = 0; layer < layers; layer += 1) {
    for (let index = 0; index < 12; index += 1) {
      nodes.push(
        node(`n${layer}_${index}`, ['model', `layers.${layer}`, index < 6 ? 'attn' : 'mlp']),
      );
    }
  }
  return nodes;
}

describe('group tree and level of detail', () => {
  it('aggregates node and parameter counts up the hierarchy', () => {
    const tree = buildGroupTree(layeredNodes(2));
    expect(tree.groups.get('model')?.nodeCount).toBe(24);
    expect(tree.groups.get('model/layers.0')?.paramCount).toBe(120);
    expect(tree.groups.get('model/layers.0/attn')?.directNodes).toHaveLength(6);
    expect(tree.maxDepth).toBe(3);
  });

  it('keeps a 2,000-node graph at or under the visible budget initially', () => {
    const nodes = layeredNodes(170);
    expect(nodes.length).toBeGreaterThan(2000);
    const payload = chainPayload(nodes);
    const tree = buildGroupTree(nodes);
    const expanded = initialExpanded(tree);
    const visible = buildVisibleGraph(payload, tree, expanded);
    // 170 layer cards exceed the budget, but beat a single block holding everything.
    expect(visible.items.filter((item) => item.kind !== 'io').length).toBeLessThanOrEqual(HARD_CAP);
    expect(visible.items.every((item) => item.kind !== 'node')).toBe(true);
  });

  it('opens a small LLM folded at its layers instead of as one long chain', () => {
    // Gemma-3 270M: 18 layers, about 20 nodes each.
    const nodes: OnnxNode[] = [];
    for (let layer = 0; layer < 18; layer += 1) {
      for (let index = 0; index < 20; index += 1) {
        nodes.push(
          node(`n${layer}_${index}`, ['model', `layers.${layer}`, index < 10 ? 'attn' : 'mlp']),
        );
      }
    }
    const tree = buildGroupTree(nodes);
    const visible = buildVisibleGraph(chainPayload(nodes), tree, initialExpanded(tree));
    const shown = visible.items.filter((item) => item.kind !== 'io');
    expect(shown.length).toBeLessThanOrEqual(MAX_VISIBLE);
    expect(shown.every((item) => item.kind === 'group')).toBe(true);
  });

  it('shows everything when the graph is small', () => {
    const nodes = layeredNodes(2);
    const tree = buildGroupTree(nodes);
    const visible = buildVisibleGraph(chainPayload(nodes), tree, initialExpanded(tree));
    expect(visible.items.filter((item) => item.kind === 'node')).toHaveLength(24);
  });

  it('merges edges between collapsed groups and drops internal ones', () => {
    const nodes = layeredNodes(3);
    const tree = buildGroupTree(nodes);
    const collapsed = new Set(['', 'model']);
    const visible = buildVisibleGraph(chainPayload(nodes), tree, collapsed);
    const groupIds = visible.items.filter((item) => item.kind === 'group').map((item) => item.id);
    expect(groupIds).toEqual(['g:model/layers.0', 'g:model/layers.1', 'g:model/layers.2']);
    expect(visible.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'in:x->g:model/layers.0',
      'g:model/layers.0->g:model/layers.1',
      'g:model/layers.1->g:model/layers.2',
      'g:model/layers.2->out:y',
    ]);
  });

  it('expanding a group increases what is visible', () => {
    const nodes = layeredNodes(3);
    const tree = buildGroupTree(nodes);
    const collapsed = new Set(['', 'model']);
    const before = buildVisibleGraph(chainPayload(nodes), tree, collapsed).items.length;
    const after = buildVisibleGraph(
      chainPayload(nodes),
      tree,
      new Set([...collapsed, 'model/layers.1']),
    ).items.length;
    expect(after).toBeGreaterThan(before);
  });

  it('chunks big graphs without names into topological blocks', () => {
    const nodes = Array.from({ length: 400 }, (_, index) => node(`n${index}`, []));
    const tree = buildGroupTree(nodes);
    expect(tree.groups.get('블록 1')?.nodeCount).toBe(50);
    expect(tree.groups.get('블록 8')?.nodeCount).toBe(50);
  });

  it('finds representatives and expands ancestors for search jumps', () => {
    const nodes = layeredNodes(2);
    const tree = buildGroupTree(nodes);
    const collapsed = new Set(['', 'model']);
    expect(representativeOf('n1_3', tree, collapsed)).toBe('g:model/layers.1');
    const expanded = expandAncestors('n1_3', tree, collapsed);
    expect(representativeOf('n1_3', tree, expanded)).toBe('n1_3');
  });

  it('collects upstream and downstream items', () => {
    const edges = [
      {
        id: '1',
        source: 'a',
        target: 'b',
        tensor: { name: '', dtype: null, shape: null },
        weight: 1,
      },
      {
        id: '2',
        source: 'b',
        target: 'c',
        tensor: { name: '', dtype: null, shape: null },
        weight: 1,
      },
      {
        id: '3',
        source: 'x',
        target: 'y',
        tensor: { name: '', dtype: null, shape: null },
        weight: 1,
      },
    ];
    expect([...connectedIds('b', edges)].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('initial expansion of deep single-root graphs', () => {
  it('skips the wrapper and shows layer blocks instead of one giant box', () => {
    const nodes = layeredNodes(770);
    const tree = buildGroupTree(nodes);
    const visible = buildVisibleGraph(chainPayload(nodes), tree, initialExpanded(tree));
    const groups = visible.items.filter((item) => item.kind === 'group');
    expect(groups.length).toBe(770);
    expect(groups[0]?.id).toBe('g:model/layers.0');
  });
});

describe('single-node groups', () => {
  it('shows the node instead of a one-node group box', () => {
    const nodes = [
      node('a', ['model', 'only']),
      node('b', ['model', 'pair']),
      node('c', ['model', 'pair']),
    ];
    const tree = buildGroupTree(nodes);
    const collapsed = new Set(['', 'model']);
    expect(representativeOf('a', tree, collapsed)).toBe('a');
    expect(representativeOf('b', tree, collapsed)).toBe('g:model/pair');
  });
});

describe('hard cap', () => {
  it('only keeps edges between drawn items when a graph is cut at the cap', () => {
    const nodes = Array.from({ length: HARD_CAP + 20 }, (_, index) => node(`n${index}`, []));
    const payload = chainPayload(nodes);
    const tree = buildGroupTree(nodes);
    const everything = new Set(tree.groups.keys());
    const visible = buildVisibleGraph(payload, tree, everything);
    const ids = new Set(visible.items.map((item) => item.id));
    expect(visible.isCapped).toBe(true);
    expect(visible.items).toHaveLength(HARD_CAP);
    expect(visible.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
  });
});

describe('foldIo', () => {
  const tensor = (name: string) => ({ name, dtype: 'float32', shape: [1] });

  it('folds a numbered KV-cache family and keeps the rest', () => {
    const cache = Array.from({ length: 6 }, (_, index) => [
      tensor(`past_key_values.${String(index)}.key`),
      tensor(`past_key_values.${String(index)}.value`),
    ]).flat();
    const { items, aliases } = foldIo([tensor('input_ids'), ...cache], 'in');
    expect(items.map((item) => [item.tensor.name, item.count])).toEqual([
      ['input_ids', 1],
      ['past_key_values.*', 12],
    ]);
    expect(aliases.get('in:past_key_values.3.value')).toBe('in:past_key_values.*');
    expect(aliases.get('in:input_ids')).toBe('in:input_ids');
  });

  it('leaves small numbered groups alone', () => {
    const { items } = foldIo([tensor('x.0'), tensor('x.1')], 'out');
    expect(items).toHaveLength(2);
  });
});
