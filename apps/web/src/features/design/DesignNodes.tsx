import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { CircleAlert } from 'lucide-react';
import { memo } from 'react';
import type { DesignLayer } from '@mieru/shared';
import { OP_COLORS } from '../../design/op-palette.js';
import { formatParams } from '../../lib/format.js';
import { formatShape, type LayerResult, type Shape } from './inference.js';
import { kindOf } from './layers.js';

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 64;

export type LayerNodeData = { layer: DesignLayer; result: LayerResult; isSelected: boolean };
export type InputNodeData = { shape: Shape };

const handleClass = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent';

/** The layer's defining numbers in PyTorch order, short enough for a node. */
export function layerSummary(layer: DesignLayer): string {
  switch (layer.type) {
    case 'conv2d':
      return `${String(layer.inChannels)}→${String(layer.outChannels)} · k${String(layer.kernelSize)} s${String(layer.stride)} p${String(layer.padding)}`;
    case 'batchnorm2d':
      return `${String(layer.numFeatures)} 채널`;
    case 'maxpool2d':
    case 'avgpool2d':
      return `k${String(layer.kernelSize)} s${String(layer.stride)}`;
    case 'adaptiveavgpool2d':
      return `→ ${String(layer.outputSize)}×${String(layer.outputSize)}`;
    case 'linear':
      return `${String(layer.inFeatures)}→${String(layer.outFeatures)}`;
    case 'dropout':
      return `p=${String(layer.p)}`;
    default:
      return '';
  }
}

export const LayerNodeView = memo(function LayerNodeView({ data }: NodeProps<Node<LayerNodeData>>) {
  const kind = kindOf(data.layer.type);
  const { result } = data;
  return (
    <div
      className={clsx(
        'relative flex items-center gap-3 rounded-lg border bg-surface px-3 transition-[border-color,box-shadow,opacity]',
        result.status === 'error'
          ? 'border-danger ring-4 ring-danger/15'
          : data.isSelected
            ? 'border-primary ring-4 ring-primary/15'
            : 'border-fog hover:border-lilac',
        result.status === 'blocked' && 'opacity-50',
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />
      <span
        className="grid size-8 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: `${OP_COLORS[kind.family]}22` }}
      >
        <span
          className="size-2.5 rounded-[3px]"
          style={{ backgroundColor: OP_COLORS[kind.family] }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap">{kind.label}</span>
          <span className="truncate font-mono text-[11px] text-slate">
            {layerSummary(data.layer)}
          </span>
        </p>
        <p
          className={clsx(
            'mt-0.5 truncate font-mono text-[11px]',
            result.status === 'error' ? 'text-danger' : 'text-slate',
          )}
        >
          {result.status === 'ok'
            ? `→ ${formatShape(result.output)}`
            : result.status === 'error'
              ? '모양이 맞지 않아요'
              : '앞 레이어를 먼저 고쳐주세요'}
        </p>
      </div>
      {result.status === 'ok' && result.params > 0 && (
        <span className="tabular shrink-0 text-[11px] text-slate">
          {formatParams(result.params)}
        </span>
      )}
      {result.status === 'error' && (
        <CircleAlert className="size-4 shrink-0 text-danger" aria-label="오류" />
      )}
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
});

export const InputNodeView = memo(function InputNodeView({ data }: NodeProps<Node<InputNodeData>>) {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-full border border-dashed border-lilac bg-haze px-4 text-sm"
      style={{ width: NODE_WIDTH, height: 40 }}
    >
      <span className="text-slate">입력</span>
      <span className="font-mono text-xs">{formatShape(data.shape)}</span>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
});

export const DESIGN_NODE_TYPES = { layer: LayerNodeView, input: InputNodeView };
