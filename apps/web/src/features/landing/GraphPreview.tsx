import clsx from 'clsx';
import type { CSSProperties, KeyboardEvent } from 'react';
import { OP_COLORS, OP_FAMILY_LABELS, type OpFamily } from '../../design/op-palette.js';

export interface PreviewNode {
  id: string;
  name: string;
  op: string;
  family: OpFamily;
  x: number;
  y: number;
  input: string;
  output: string;
  params: number;
  attributes: [string, string][];
}

/** A residual block in miniature, with the details the real inspector would show. */
export const PREVIEW_NODES: PreviewNode[] = [
  {
    id: 'in',
    name: 'input',
    op: '입력',
    family: 'other',
    x: 150,
    y: 24,
    input: '—',
    output: '[1,3,224,224]',
    params: 0,
    attributes: [['dtype', 'float32']],
  },
  {
    id: 'stem',
    name: 'conv1',
    op: 'Conv',
    family: 'compute',
    x: 150,
    y: 74,
    input: '[1,3,224,224]',
    output: '[1,64,112,112]',
    params: 9408,
    attributes: [
      ['kernel_shape', '[7,7]'],
      ['strides', '[2,2]'],
    ],
  },
  {
    id: 'bn',
    name: 'bn1',
    op: 'BatchNorm',
    family: 'normalization',
    x: 150,
    y: 124,
    input: '[1,64,112,112]',
    output: '[1,64,112,112]',
    params: 128,
    attributes: [['epsilon', '1e-5']],
  },
  {
    id: 'relu',
    name: 'relu',
    op: 'Relu',
    family: 'activation',
    x: 150,
    y: 174,
    input: '[1,64,112,112]',
    output: '[1,64,112,112]',
    params: 0,
    attributes: [],
  },
  {
    id: 'branch',
    name: 'layer1.0.conv1',
    op: 'Conv',
    family: 'compute',
    x: 82,
    y: 228,
    input: '[1,64,56,56]',
    output: '[1,64,56,56]',
    params: 36864,
    attributes: [
      ['kernel_shape', '[3,3]'],
      ['pads', '[1,1,1,1]'],
    ],
  },
  {
    id: 'main',
    name: 'layer1.0.conv2',
    op: 'Conv',
    family: 'compute',
    x: 218,
    y: 228,
    input: '[1,64,56,56]',
    output: '[1,64,56,56]',
    params: 36864,
    attributes: [
      ['kernel_shape', '[3,3]'],
      ['pads', '[1,1,1,1]'],
    ],
  },
  {
    id: 'add',
    name: 'layer1.0.add',
    op: 'Add',
    family: 'other',
    x: 150,
    y: 282,
    input: '[1,64,56,56] ×2',
    output: '[1,64,56,56]',
    params: 0,
    attributes: [],
  },
  {
    id: 'pool',
    name: 'avgpool',
    op: 'GlobalAvgPool',
    family: 'shape',
    x: 150,
    y: 332,
    input: '[1,64,56,56]',
    output: '[1,64,1,1]',
    params: 0,
    attributes: [],
  },
  {
    id: 'fc',
    name: 'fc',
    op: 'Gemm',
    family: 'compute',
    x: 150,
    y: 382,
    input: '[1,64]',
    output: '[1,1000]',
    params: 65000,
    attributes: [['transB', '1']],
  },
];

const EDGES: [string, string][] = [
  ['in', 'stem'],
  ['stem', 'bn'],
  ['bn', 'relu'],
  ['relu', 'branch'],
  ['relu', 'main'],
  ['branch', 'add'],
  ['main', 'add'],
  ['add', 'pool'],
  ['pool', 'fc'],
];

const NODE_WIDTH = 112;
const NODE_HEIGHT = 28;
const byId = new Map(PREVIEW_NODES.map((node) => [node.id, node]));
const orderOf = new Map(PREVIEW_NODES.map((node, index) => [node.id, index]));

interface GraphPreviewProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * The landing graph: nodes unfold top to bottom once on load, then work like the real view,
 * where choosing a node fills the inspector.
 */
export function GraphPreview({ selectedId, onSelect }: GraphPreviewProps) {
  const choose = (event: KeyboardEvent, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(id);
  };
  return (
    <svg
      viewBox="20 2 260 402"
      className="h-full w-full"
      role="group"
      aria-label="예시 계산 그래프"
    >
      {EDGES.map(([from, to]) => {
        const source = byId.get(from);
        const target = byId.get(to);
        if (!source || !target) return null;
        const y1 = source.y + NODE_HEIGHT / 2;
        const y2 = target.y - NODE_HEIGHT / 2;
        const midY = (y1 + y2) / 2;
        const isActive = from === selectedId || to === selectedId;
        return (
          <path
            key={`${from}-${to}`}
            d={`M${source.x},${y1} C${source.x},${midY} ${target.x},${midY} ${target.x},${y2}`}
            pathLength={1}
            fill="none"
            stroke={isActive ? 'var(--color-primary)' : 'var(--color-edge)'}
            strokeWidth={isActive ? 1.8 : 1.4}
            className="motion-safe:hero-edge-in transition-[stroke]"
            style={{ '--i': orderOf.get(to) ?? 0 } as CSSProperties}
          />
        );
      })}
      {PREVIEW_NODES.map((node, index) => {
        const isSelected = node.id === selectedId;
        return (
          <g
            key={node.id}
            transform={`translate(${String(node.x - NODE_WIDTH / 2)},${String(node.y - NODE_HEIGHT / 2)})`}
          >
            <g
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${node.op} ${node.name}`}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => choose(event, node.id)}
              className="group cursor-pointer outline-none motion-safe:hero-node-in"
              style={{ '--i': index } as CSSProperties}
            >
              {isSelected && (
                <rect
                  x="-4"
                  y="-4"
                  width={NODE_WIDTH + 8}
                  height={NODE_HEIGHT + 8}
                  rx="11"
                  fill="var(--color-primary)"
                  opacity="0.12"
                />
              )}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx="8"
                fill="var(--color-surface)"
                strokeWidth={isSelected ? 2 : 1}
                className={clsx(
                  'transition-[stroke]',
                  isSelected
                    ? 'stroke-primary'
                    : 'stroke-fog group-hover:stroke-lilac group-focus-visible:stroke-primary',
                )}
              />
              <rect x="8" y="9" width="10" height="10" rx="3" fill={OP_COLORS[node.family]} />
              <text
                x="26"
                y="18.5"
                fontSize="11"
                fontFamily="Pretendard Variable, sans-serif"
                fill="var(--color-sumi)"
                className="pointer-events-none select-none"
              >
                {node.op}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Inspector for the selected preview node, laid out like the real one. */
export function PreviewInspector({ node }: { node: PreviewNode }) {
  return (
    <div key={node.id} className="motion-safe:animate-[fade-in_180ms_ease-out]">
      <p className="truncate font-mono text-sm font-medium text-sumi">{node.name}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate">
        <span
          className="size-2 rounded-[2px]"
          style={{ backgroundColor: OP_COLORS[node.family] }}
          aria-hidden="true"
        />
        {node.op} · {OP_FAMILY_LABELS[node.family]}
      </p>
      <dl className="mt-4 grid gap-3 text-xs max-sm:grid-cols-2">
        {[['입력', node.input], ['출력', node.output], ...node.attributes].map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate">{label}</dt>
            <dd className="mt-0.5 font-mono text-sumi">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-slate">파라미터</dt>
          <dd className="tabular mt-0.5 font-mono text-sumi">
            {node.params.toLocaleString('ko-KR')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
