import ElkConstructor from 'elkjs/lib/elk-api.js';
import type { VisibleEdge, VisibleItem } from './visible-graph.js';

export const NODE_SIZE = {
  node: { width: 188, height: 56 },
  group: { width: 232, height: 76 },
  io: { width: 168, height: 40 },
} as const;

// One worker for the whole page: ELK's layered algorithm can take a while on big graphs.
let elk: InstanceType<typeof ElkConstructor> | null = null;

function getElk() {
  elk ??= new ElkConstructor({
    workerFactory: () => new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url)),
  });
  return elk;
}

export type Positions = Map<string, { x: number; y: number }>;

/** Lays items out top-to-bottom off the main thread. */
export async function layoutGraph(
  items: readonly VisibleItem[],
  edges: readonly VisibleEdge[],
): Promise<Positions> {
  const result = await getElk().layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '44',
      'elk.spacing.nodeNode': '28',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: items.map((item) => ({ id: item.id, ...NODE_SIZE[item.kind] })),
    edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  const positions: Positions = new Map();
  for (const child of result.children ?? [])
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  return positions;
}
