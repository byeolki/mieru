import { OP_COLORS, type OpFamily } from '../../design/op-palette.js';

interface PreviewNode {
  id: string;
  label: string;
  family: OpFamily;
  x: number;
  y: number;
}

const NODES: PreviewNode[] = [
  { id: 'in', label: 'input', family: 'other', x: 150, y: 24 },
  { id: 'conv1', label: 'Conv', family: 'compute', x: 150, y: 74 },
  { id: 'bn1', label: 'BatchNorm', family: 'normalization', x: 150, y: 124 },
  { id: 'relu1', label: 'Relu', family: 'activation', x: 150, y: 174 },
  { id: 'conv2', label: 'Conv', family: 'compute', x: 82, y: 228 },
  { id: 'conv3', label: 'Conv', family: 'compute', x: 218, y: 228 },
  { id: 'add', label: 'Add', family: 'other', x: 150, y: 282 },
  { id: 'pool', label: 'GlobalAvgPool', family: 'shape', x: 150, y: 332 },
  { id: 'fc', label: 'Gemm', family: 'compute', x: 150, y: 382 },
];

const EDGES: [string, string][] = [
  ['in', 'conv1'],
  ['conv1', 'bn1'],
  ['bn1', 'relu1'],
  ['relu1', 'conv2'],
  ['relu1', 'conv3'],
  ['conv2', 'add'],
  ['conv3', 'add'],
  ['add', 'pool'],
  ['pool', 'fc'],
];

const NODE_WIDTH = 112;
const NODE_HEIGHT = 28;
const byId = new Map(NODES.map((node) => [node.id, node]));

/** A static, decorative miniature of the graph view used on the landing page. */
export function GraphPreview() {
  return (
    <svg viewBox="0 0 300 410" className="h-full w-full" aria-hidden="true">
      {EDGES.map(([from, to]) => {
        const source = byId.get(from);
        const target = byId.get(to);
        if (!source || !target) return null;
        const y1 = source.y + NODE_HEIGHT / 2;
        const y2 = target.y - NODE_HEIGHT / 2;
        const midY = (y1 + y2) / 2;
        return (
          <path
            key={`${from}-${to}`}
            d={`M${source.x},${y1} C${source.x},${midY} ${target.x},${midY} ${target.x},${y2}`}
            fill="none"
            stroke="#B9B4C9"
            strokeWidth="1.4"
          />
        );
      })}
      {NODES.map((node) => (
        <g
          key={node.id}
          transform={`translate(${node.x - NODE_WIDTH / 2},${node.y - NODE_HEIGHT / 2})`}
        >
          <rect
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx="8"
            fill="#FFFFFF"
            stroke={node.id === 'conv3' ? '#BC3D86' : '#E3E6EE'}
            strokeWidth={node.id === 'conv3' ? 2 : 1}
          />
          <rect x="8" y="9" width="10" height="10" rx="3" fill={OP_COLORS[node.family]} />
          <text
            x="26"
            y="18.5"
            fontSize="11"
            fontFamily="Pretendard Variable, sans-serif"
            fill="#1B1E2B"
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
