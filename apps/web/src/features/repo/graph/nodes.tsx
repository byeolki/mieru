import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import clsx from 'clsx';
import { Layers } from 'lucide-react';
import { memo } from 'react';
import type { OnnxNode, OpFamily, TensorInfo } from '@mieru/shared';
import { OP_COLORS } from '../../../design/op-palette.js';
import { formatParams, formatShape } from '../../../lib/format.js';
import { useActivationPreview } from '../../demo/activation-store.js';
import type { GroupInfo } from './visible-graph.js';

// Type aliases (not interfaces) so React Flow's `Record<string, unknown>` data constraint holds.
export type DiffMark = 'added' | 'changed';

type Decoration = {
  isSelected: boolean;
  isDimmed: boolean;
  issueCount: number;
};

export type OpNodeData = {
  node: OnnxNode;
  outputShape: TensorInfo['shape'];
  diffMark: DiffMark | null;
} & Decoration;
export type GroupNodeData = { group: GroupInfo; diffCount: number } & Decoration;
export type IoNodeData = { tensor: TensorInfo; direction: 'in' | 'out' } & Decoration;

const handleClass = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent';

function frame(isSelected: boolean, isDimmed: boolean) {
  return clsx(
    'transition-[opacity,box-shadow,border-color] duration-150',
    isDimmed && 'opacity-40',
    isSelected
      ? 'border-[1.5px] border-primary ring-4 ring-primary/15'
      : 'border border-fog hover:border-lilac',
  );
}

function FamilyTile({ family, size = 'size-7' }: { family: OpFamily; size?: string }) {
  return (
    <span
      className={clsx('grid shrink-0 place-items-center rounded-md', size)}
      style={{ backgroundColor: `${OP_COLORS[family]}22` }}
    >
      <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: OP_COLORS[family] }} />
    </span>
  );
}

const DIFF_LABELS: Record<DiffMark, string> = { added: '추가됨', changed: '바뀜' };

/** A colored edge on the node's left side plus a text label, so the mark never relies on color alone. */
function DiffStripe({ mark }: { mark: DiffMark }) {
  return (
    <>
      <span
        className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full"
        style={{ backgroundColor: `var(--color-diff-${mark})` }}
        aria-hidden="true"
      />
      <span
        className="absolute -top-2 left-2 rounded-full px-1.5 text-[10px] leading-4 font-semibold text-on-accent"
        style={{ backgroundColor: `var(--color-diff-${mark})` }}
      >
        {DIFF_LABELS[mark]}
      </span>
    </>
  );
}

function IssueBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-2 -right-2 grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[0.65rem] font-semibold text-on-accent shadow-sm">
      {count}
    </span>
  );
}

export const OpNodeView = memo(function OpNodeView({ data }: NodeProps<Node<OpNodeData>>) {
  // After a demo run, the node shows its real output: first channel and runtime shape.
  const preview = useActivationPreview(data.node.outputs[0]);
  return (
    <div
      className={clsx(
        'relative flex h-[56px] w-[188px] items-center gap-2.5 rounded-lg bg-surface px-3',
        frame(data.isSelected, data.isDimmed),
      )}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />
      <FamilyTile family={data.node.family} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-tight font-semibold">{data.node.opType}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] leading-tight text-slate">
          {formatShape(preview?.dims ?? data.outputShape)}
        </p>
      </div>
      {preview && (
        <img
          src={preview.dataUrl}
          alt=""
          className="size-9 shrink-0 rounded-[4px] border border-fog [image-rendering:pixelated]"
        />
      )}
      {data.diffMark && <DiffStripe mark={data.diffMark} />}
      <IssueBadge count={data.issueCount} />
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
});

export const GroupNodeView = memo(function GroupNodeView({ data }: NodeProps<Node<GroupNodeData>>) {
  const families = Object.entries(data.group.families) as [OpFamily, number][];
  const total = families.reduce((sum, [, count]) => sum + count, 0) || 1;
  return (
    <div className="relative">
      {/* Stacked-card edge hints that this box holds more nodes. */}
      <div
        className="absolute inset-x-2 -bottom-1.5 h-full rounded-xl border border-fog bg-paper"
        aria-hidden="true"
      />
      <div
        className={clsx(
          'relative h-[76px] w-[232px] rounded-xl bg-surface px-3.5 py-2.5',
          frame(data.isSelected, data.isDimmed),
        )}
      >
        <Handle type="target" position={Position.Top} className={handleClass} />
        <div className="flex items-center gap-2">
          <Layers className="size-3.5 shrink-0 text-slate" aria-hidden="true" />
          <p className="truncate text-[13px] font-semibold">{data.group.label}</p>
        </div>
        <p className="tabular mt-1 text-[11px] text-slate">
          노드 {data.group.nodeCount} · {formatParams(data.group.paramCount)} params
        </p>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
          {families.map(([family, count]) => (
            <span
              key={family}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: OP_COLORS[family] }}
            />
          ))}
        </div>
        {data.diffCount > 0 && (
          <span className="absolute -top-2 left-3 rounded-full bg-(--color-diff-changed) px-1.5 text-[10px] leading-4 font-semibold text-on-accent">
            바뀐 노드 {data.diffCount}
          </span>
        )}
        <IssueBadge count={data.issueCount} />
        <Handle type="source" position={Position.Bottom} className={handleClass} />
      </div>
    </div>
  );
});

export const IoNodeView = memo(function IoNodeView({ data }: NodeProps<Node<IoNodeData>>) {
  return (
    <div
      className={clsx(
        'flex h-[40px] w-[168px] items-center gap-2 rounded-full bg-haze px-3.5',
        frame(data.isSelected, data.isDimmed),
      )}
    >
      {data.direction === 'out' && (
        <Handle type="target" position={Position.Top} className={handleClass} />
      )}
      <span className="text-[11px] font-medium text-slate">
        {data.direction === 'in' ? '입력' : '출력'}
      </span>
      <span className="truncate font-mono text-[11px]">{data.tensor.name}</span>
      {data.direction === 'in' && (
        <Handle type="source" position={Position.Bottom} className={handleClass} />
      )}
    </div>
  );
});

export const NODE_TYPES = { op: OpNodeView, group: GroupNodeView, io: IoNodeView };
