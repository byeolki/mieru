import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import clsx from 'clsx';
import {
  Map as MapIcon,
  Maximize,
  Minus,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ModelSummary, OnnxGraphPayload, TensorInfo } from '@mieru/shared';
import { OP_COLORS } from '../../../design/op-palette.js';
import { Spinner } from '../../../design/ui/Spinner.js';
import { Inspector, type Selection } from './Inspector.js';
import { NODE_SIZE, layoutGraph, type Positions } from './layout.js';
import { NODE_TYPES, type DiffMark } from './nodes.js';
import {
  buildGroupTree,
  buildVisibleGraph,
  connectedIds,
  expandAncestors,
  initialExpanded,
} from './visible-graph.js';

const EDGE_COLOR = 'var(--color-edge)';
const EDGE_HIGHLIGHT = 'var(--color-primary)';
const SEARCH_RESULTS = 8;
const LARGE_VIEW_ITEMS = 60;
const START_VIEW_ITEMS = 5;

interface OnnxGraphViewProps {
  payload: OnnxGraphPayload;
  summary: ModelSummary;
  issueCounts?: ReadonlyMap<string, number>;
  /** Version-diff marks by node name; unmarked nodes are unchanged. */
  diffMarks?: ReadonlyMap<string, DiffMark>;
  tensorHref?: (name: string) => string;
  onOpenIssue?: (nodeRef: string) => void;
  /** Node to select and center on first render (deep links from issues). */
  initialFocusName?: string | null;
}

function ToolbarButton({
  label,
  onClick,
  children,
  isActive = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={isActive || undefined}
      className={clsx(
        'grid size-9 place-items-center rounded-full transition-colors',
        isActive ? 'bg-haze text-primary' : 'text-slate hover:bg-haze hover:text-sumi',
      )}
    >
      {children}
    </button>
  );
}

function GraphCanvas({
  payload,
  summary,
  issueCounts,
  diffMarks,
  tensorHref,
  onOpenIssue,
  initialFocusName,
}: OnnxGraphViewProps) {
  const flow = useReactFlow();
  const tree = useMemo(() => buildGroupTree(payload.nodes), [payload]);
  const initial = useMemo(() => initialExpanded(tree), [tree]);
  const initialFocus = useMemo(
    () =>
      initialFocusName
        ? (payload.nodes.find((node) => node.name === initialFocusName) ?? null)
        : null,
    [initialFocusName, payload],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    initialFocus ? expandAncestors(initialFocus.id, tree, initial) : initial,
  );
  const [selection, setSelection] = useState<Selection>(
    initialFocus ? { kind: 'node', node: initialFocus } : null,
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layout, setLayout] = useState<{ for: unknown; positions: Positions } | null>(null);
  const [layoutFailedFor, setLayoutFailedFor] = useState<unknown>(null);
  const [showMinimap, setShowMinimap] = useState(payload.nodes.length <= 1000);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [query, setQuery] = useState('');
  const pendingFocus = useRef<string | null>(initialFocus?.id ?? null);

  const visible = useMemo(
    () => buildVisibleGraph(payload, tree, expanded),
    [payload, tree, expanded],
  );

  useEffect(() => {
    let isCurrent = true;
    layoutGraph(visible.items, visible.edges).then(
      (positions) => {
        if (isCurrent) setLayout({ for: visible, positions });
      },
      (error: unknown) => {
        console.error('Graph layout failed', error);
        if (isCurrent) setLayoutFailedFor(visible);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [visible]);
  const positions = layout?.positions ?? null;
  const hasLayoutFailed = layoutFailedFor === visible;
  const isLayingOut = layout?.for !== visible && !hasLayoutFailed;

  useEffect(() => {
    if (!positions) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    requestAnimationFrame(() => {
      if (target) {
        void flow.fitView({ nodes: [{ id: target }], duration: 300, maxZoom: 1.2 });
        return;
      }
      if (positions.size <= LARGE_VIEW_ITEMS) {
        void flow.fitView({ duration: 0, padding: 0.12, maxZoom: 1 });
        return;
      }
      // Fitting hundreds of blocks makes them unreadable; start at the top of the graph instead.
      const firstIds = [...positions.entries()]
        .sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x)
        .slice(0, START_VIEW_ITEMS)
        .map(([id]) => ({ id }));
      void flow.fitView({ nodes: firstIds, duration: 0, padding: 0.2, maxZoom: 1 });
    });
  }, [positions, flow]);

  const outputShapes = useMemo(() => {
    const shapes = new Map<string, TensorInfo['shape']>();
    for (const edge of payload.edges) shapes.set(edge.tensor.name, edge.tensor.shape);
    return shapes;
  }, [payload]);

  const highlighted = useMemo(
    () => (hoveredId ? connectedIds(hoveredId, visible.edges) : null),
    [hoveredId, visible.edges],
  );
  const selectedId =
    selection?.kind === 'node'
      ? selection.node.id
      : selection?.kind === 'group'
        ? `g:${selection.group.path}`
        : selection?.kind === 'io'
          ? selection.tensor.name
          : null;

  const focusNode = (nodeId: string) => {
    const node = payload.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    pendingFocus.current = nodeId;
    setExpanded((current) => expandAncestors(nodeId, tree, current));
    setSelection({ kind: 'node', node });
    setIsInspectorOpen(true);
  };

  const nodes: Node[] = useMemo(() => {
    if (!positions) return [];
    return visible.items.flatMap((item): Node[] => {
      const position = positions.get(item.id);
      if (!position) return [];
      const isDimmed = highlighted !== null && !highlighted.has(item.id);
      const isSelected =
        item.id === selectedId || (item.kind === 'io' && item.tensor.name === selectedId);
      // Explicit sizes keep React Flow from hiding nodes to re-measure them on every update,
      // which would let clicks fall through to the pane.
      const size = NODE_SIZE[item.kind];
      if (item.kind === 'node') {
        return [
          {
            id: item.id,
            type: 'op',
            position,
            ...size,
            data: {
              node: item.node,
              outputShape: outputShapes.get(item.node.outputs[0] ?? '') ?? null,
              isSelected,
              isDimmed,
              issueCount: issueCounts?.get(item.node.name) ?? 0,
              diffMark: diffMarks?.get(item.node.name) ?? null,
            },
          },
        ];
      }
      if (item.kind === 'group') {
        const isInGroup = (name: string) =>
          name.startsWith(`/${item.group.path}/`) || name.startsWith(`${item.group.path}/`);
        let issueCount = 0;
        if (issueCounts) {
          for (const [name, count] of issueCounts) if (isInGroup(name)) issueCount += count;
        }
        let diffCount = 0;
        if (diffMarks) {
          for (const name of diffMarks.keys()) if (isInGroup(name)) diffCount += 1;
        }
        return [
          {
            id: item.id,
            type: 'group',
            position,
            ...size,
            data: { group: item.group, isSelected, isDimmed, issueCount, diffCount },
          },
        ];
      }
      return [
        {
          id: item.id,
          type: 'io',
          position,
          ...size,
          data: {
            tensor: item.tensor,
            direction: item.direction,
            isSelected,
            isDimmed,
            issueCount: 0,
          },
        },
      ];
    });
  }, [positions, visible.items, highlighted, selectedId, outputShapes, issueCounts, diffMarks]);

  const edges: Edge[] = useMemo(
    () =>
      visible.edges.map((edge) => {
        const isOnPath =
          highlighted !== null && highlighted.has(edge.source) && highlighted.has(edge.target);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          pathOptions: { borderRadius: 10 },
          style: {
            stroke: isOnPath ? EDGE_HIGHLIGHT : EDGE_COLOR,
            strokeWidth: isOnPath ? 2 : 1.4,
            opacity: highlighted && !isOnPath ? 0.35 : 1,
          },
        };
      }),
    [visible.edges, highlighted],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return payload.nodes
      .filter(
        (node) =>
          node.name.toLowerCase().includes(needle) || node.opType.toLowerCase().includes(needle),
      )
      .slice(0, SEARCH_RESULTS);
  }, [query, payload.nodes]);

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-(--radius-panel) bg-haze">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onlyRenderVisibleElements
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.05}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_event, node) => {
            const item = visible.items.find((candidate) => candidate.id === node.id);
            if (!item) return;
            setIsInspectorOpen(true);
            if (item.kind === 'node') setSelection({ kind: 'node', node: item.node });
            else if (item.kind === 'group') setSelection({ kind: 'group', group: item.group });
            else setSelection({ kind: 'io', tensor: item.tensor });
          }}
          onNodeDoubleClick={(_event, node) => {
            if (node.id.startsWith('g:'))
              setExpanded((current) => new Set([...current, node.id.slice(2)]));
          }}
          onNodeMouseEnter={(_event, node) => setHoveredId(node.id)}
          onNodeMouseLeave={() => setHoveredId(null)}
          onPaneClick={() => setSelection(null)}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1.2}
            color="var(--color-dots)"
          />
          {showMinimap && (
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="!rounded-xl !border !border-fog !bg-surface/90"
              nodeColor={(node) =>
                node.type === 'op'
                  ? OP_COLORS[
                      (node.data as { node: { family: keyof typeof OP_COLORS } }).node.family
                    ]
                  : 'var(--color-fog)'
              }
              maskColor="var(--color-mask)"
            />
          )}
        </ReactFlow>

        <div className="absolute top-4 left-4 z-10 w-[min(320px,calc(100%-2rem))]">
          <label className="flex h-10 items-center gap-2 rounded-full border border-fog bg-surface/95 px-3.5 shadow-(--shadow-soft) backdrop-blur focus-within:border-primary">
            <Search className="size-4 text-slate" aria-hidden="true" />
            <span className="sr-only">노드 검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="노드 이름이나 연산 검색"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate/70"
            />
          </label>
          {results.length > 0 && (
            <ul
              className="mt-2 overflow-hidden rounded-(--radius-panel) border border-fog bg-surface shadow-(--shadow-lift)"
              role="listbox"
              aria-label="검색 결과"
            >
              {results.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => {
                      focusNode(node.id);
                      setQuery('');
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-haze"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: OP_COLORS[node.family] }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{node.opType}</span>
                      <span className="block truncate font-mono text-[11px] text-slate">
                        {node.name}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(isLayingOut || hasLayoutFailed || visible.isCapped) && (
          <div
            className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-fog bg-surface/95 px-3.5 py-1.5 text-xs shadow-(--shadow-soft)"
            role="status"
          >
            {isLayingOut ? (
              <span className="flex items-center gap-2 text-slate">
                <Spinner className="size-3.5" /> 배치하는 중…
              </span>
            ) : hasLayoutFailed ? (
              <span className="text-danger">
                그래프를 배치하지 못했어요. 펼친 블록을 접고 다시 시도해주세요.
              </span>
            ) : (
              '노드가 너무 많아 일부만 보여요. 더 작은 블록을 펼쳐보세요.'
            )}
          </div>
        )}

        <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-fog bg-surface/95 p-1 shadow-(--shadow-lift) backdrop-blur">
          <ToolbarButton label="축소" onClick={() => void flow.zoomOut({ duration: 150 })}>
            <Minus className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="확대" onClick={() => void flow.zoomIn({ duration: 150 })}>
            <Plus className="size-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-fog" aria-hidden="true" />
          <ToolbarButton
            label="화면에 맞추기"
            onClick={() => void flow.fitView({ duration: 250, padding: 0.12, maxZoom: 1 })}
          >
            <Maximize className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="처음 상태로 접기"
            onClick={() => {
              setExpanded(initial);
              setSelection(null);
            }}
          >
            <RotateCcw className="size-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-fog" aria-hidden="true" />
          <ToolbarButton
            label="미니맵"
            isActive={showMinimap}
            onClick={() => setShowMinimap((value) => !value)}
          >
            <MapIcon className="size-4" />
          </ToolbarButton>
          {!isInspectorOpen && (
            <ToolbarButton label="정보 패널 열기" onClick={() => setIsInspectorOpen(true)}>
              <PanelRightOpen className="size-4" />
            </ToolbarButton>
          )}
        </div>
      </div>

      {isInspectorOpen && (
        <aside
          className="w-[320px] shrink-0 overflow-y-auto rounded-(--radius-panel) border border-fog bg-surface"
          aria-label="노드 정보"
        >
          <Inspector
            tensorHref={tensorHref}
            selection={selection}
            payload={payload}
            summary={summary}
            onExpandGroup={(path) => {
              setExpanded((current) => new Set([...current, path]));
              setSelection(null);
            }}
            onClose={() => setIsInspectorOpen(false)}
            onOpenIssue={onOpenIssue}
          />
        </aside>
      )}
    </div>
  );
}

export function OnnxGraphView(props: OnnxGraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
