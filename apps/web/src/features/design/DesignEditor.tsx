import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Code2, Copy, Globe, Lock, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  Design,
  DesignLayer,
  DesignLayerType,
  DesignSpec,
  DesignVisibility,
} from '@mieru/shared';
import { AppFrame } from '../../components/AppFrame.js';
import { OP_COLORS } from '../../design/op-palette.js';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { Dialog } from '../../design/ui/Dialog.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { useAuth } from '../../lib/auth-store.js';
import { errorMessage } from '../../lib/error-message.js';
import { formatParams } from '../../lib/format.js';
import { CopyStatus, useCopy } from '../../lib/use-copy.js';
import { createDesign, designKeys, getDesign, updateDesign } from './api.js';
import {
  DESIGN_NODE_TYPES,
  NODE_HEIGHT,
  type InputNodeData,
  type LayerNodeData,
} from './DesignNodes.js';
import { toPyTorch } from './export.js';
import { formatShape, inferShapes, type InferenceResult, type Shape } from './inference.js';
import { LAYER_KINDS, TEMPLATES, createLayer, kindOf } from './layers.js';

const DRAG_TYPE = 'application/x-mieru-layer';
const ROW_GAP = 28;
const ROW = NODE_HEIGHT + ROW_GAP;
const FIRST_LAYER_Y = 72;

type NumericField = { key: string; label: string; min: number; max?: number; step?: number };

// Labels use PyTorch's argument names so the form reads like the code it exports.
const FIELDS: Partial<Record<DesignLayerType, NumericField[]>> = {
  conv2d: [
    { key: 'inChannels', label: 'in_channels', min: 1 },
    { key: 'outChannels', label: 'out_channels', min: 1 },
    { key: 'kernelSize', label: 'kernel_size', min: 1 },
    { key: 'stride', label: 'stride', min: 1 },
    { key: 'padding', label: 'padding', min: 0 },
  ],
  batchnorm2d: [{ key: 'numFeatures', label: 'num_features', min: 1 }],
  maxpool2d: [
    { key: 'kernelSize', label: 'kernel_size', min: 1 },
    { key: 'stride', label: 'stride', min: 1 },
  ],
  avgpool2d: [
    { key: 'kernelSize', label: 'kernel_size', min: 1 },
    { key: 'stride', label: 'stride', min: 1 },
  ],
  adaptiveavgpool2d: [{ key: 'outputSize', label: 'output_size', min: 1 }],
  linear: [
    { key: 'inFeatures', label: 'in_features', min: 1 },
    { key: 'outFeatures', label: 'out_features', min: 1 },
  ],
  dropout: [{ key: 'p', label: 'p', min: 0, max: 1, step: 0.05 }],
};

const EMPTY_SPEC: DesignSpec = { input: { shape: [1, 3, 32, 32] }, layers: [] };

function parseShape(text: string): number[] | null {
  const dims = text
    .split(/[\s,×x]+/)
    .filter(Boolean)
    .map(Number);
  const isValid =
    dims.length >= 2 && dims.length <= 4 && dims.every((dim) => Number.isInteger(dim) && dim > 0);
  return isValid ? dims : null;
}

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** Shape flowing into position `index` of the chain, if every earlier layer checks out. */
function shapeBefore(spec: DesignSpec, inference: InferenceResult, index: number): Shape | null {
  if (index === 0) return spec.input.shape;
  const previous = inference.layers[index - 1];
  return previous?.status === 'ok' ? previous.output : null;
}

/* ---------- side panels ---------- */

function Palette({
  spec,
  inference,
  onAdd,
  onInputShape,
  onTemplate,
}: {
  spec: DesignSpec;
  inference: InferenceResult;
  onAdd: (type: DesignLayerType) => void;
  onInputShape: (shape: number[]) => void;
  onTemplate: (spec: DesignSpec) => void;
}) {
  const [shapeText, setShapeText] = useState(spec.input.shape.join(', '));
  const shapeError = parseShape(shapeText)
    ? null
    : '2~4개의 양의 정수로 적어주세요. 예) 1, 3, 32, 32';
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-fog bg-surface">
      <section className="border-b border-fog p-4">
        <label className="grid gap-1.5 text-sm font-medium">
          입력 모양
          <input
            value={shapeText}
            onChange={(event) => {
              setShapeText(event.target.value);
              const parsed = parseShape(event.target.value);
              if (parsed) onInputShape(parsed);
            }}
            aria-invalid={shapeError !== null}
            className={clsx(
              'h-9 rounded-md border bg-surface px-3 font-mono text-sm focus:outline-none',
              shapeError ? 'border-danger' : 'border-fog focus:border-primary',
            )}
          />
        </label>
        {shapeError && <p className="mt-1.5 text-xs text-danger">{shapeError}</p>}
      </section>
      <section className="border-b border-fog p-4">
        <h2 className="text-sm font-semibold">레이어</h2>
        <p className="mt-1 text-xs text-slate">누르면 맨 끝에, 끌어다 놓으면 그 자리에 들어가요.</p>
        <ul className="mt-3 grid gap-1">
          {LAYER_KINDS.map((kind) => (
            <li key={kind.type}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, kind.type);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(kind.type)}
                aria-label={`${kind.label} 추가`}
                className="flex w-full cursor-grab items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-haze active:cursor-grabbing"
              >
                <span
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: OP_COLORS[kind.family] }}
                />
                <span className="text-sm font-medium">{kind.label}</span>
                <span className="ml-auto truncate text-xs text-slate">{kind.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="p-4">
        <h2 className="text-sm font-semibold">템플릿으로 시작</h2>
        <ul className="mt-2 grid gap-1">
          {TEMPLATES.map((template) => (
            <li key={template.name}>
              <button
                type="button"
                onClick={() => {
                  setShapeText(template.spec.input.shape.join(', '));
                  onTemplate(template.spec);
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-haze"
              >
                {template.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate">
          출력 {inference.output ? formatShape(inference.output) : '—'} · 파라미터{' '}
          {formatParams(inference.totalParams)}
        </p>
      </section>
    </aside>
  );
}

function LayerInspector({
  layer,
  index,
  count,
  result,
  isReadOnly,
  onChange,
  onMove,
  onRemove,
}: {
  layer: DesignLayer;
  index: number;
  count: number;
  result: InferenceResult['layers'][number] | undefined;
  isReadOnly: boolean;
  onChange: (layer: DesignLayer) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const kind = kindOf(layer.type);
  const fields = FIELDS[layer.type] ?? [];
  const values = layer as unknown as Record<string, number>;
  return (
    <div className="grid gap-5 p-5">
      <div>
        <p className="text-xs text-slate">{index + 1}번째 레이어</p>
        <h2 className="mt-0.5 font-semibold">{kind.label}</h2>
        <p className="mt-1 text-sm text-slate">{kind.description}</p>
      </div>
      {result?.status === 'error' && (
        <div className="grid gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
          <p>{result.message}</p>
          {result.fix && !isReadOnly && (
            <Button
              size="sm"
              variant="secondary"
              className="justify-self-start"
              icon={<Wand2 className="size-3.5" />}
              onClick={() => onChange({ ...layer, ...result.fix } as DesignLayer)}
            >
              고치기
            </Button>
          )}
        </div>
      )}
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <label key={field.key} className="grid gap-1 text-xs text-slate">
              <span className="font-mono">{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={values[field.key] ?? field.min}
                disabled={isReadOnly}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  const isWhole = field.step === undefined ? Number.isInteger(value) : true;
                  if (
                    !Number.isFinite(value) ||
                    !isWhole ||
                    value < field.min ||
                    (field.max !== undefined && value > field.max)
                  )
                    return;
                  onChange({ ...layer, [field.key]: value });
                }}
                className="h-9 w-full min-w-0 rounded-md border border-fog bg-surface px-2.5 font-mono text-sm text-sumi focus:border-primary focus:outline-none disabled:bg-paper"
              />
            </label>
          ))}
        </div>
      )}
      {result?.status === 'ok' && (
        <dl className="grid gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate">입력</dt>
            <dd className="font-mono text-xs">{formatShape(result.input)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">출력</dt>
            <dd className="font-mono text-xs">{formatShape(result.output)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">파라미터</dt>
            <dd className="tabular">{result.params.toLocaleString('ko-KR')}</dd>
          </div>
        </dl>
      )}
      {!isReadOnly && (
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowUp className="size-4" />}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            위로
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowDown className="size-4" />}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            아래로
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-danger"
            icon={<Trash2 className="size-4" />}
            onClick={onRemove}
          >
            삭제
          </Button>
        </div>
      )}
    </div>
  );
}

function ExportDialog({
  spec,
  open,
  onOpenChange,
}: {
  spec: DesignSpec;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const code = useMemo(() => toPyTorch(spec), [spec]);
  const { state, copy } = useCopy();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="PyTorch 코드"
      description="nn.Sequential로 그대로 붙여넣어 실행할 수 있어요."
      size="lg"
    >
      <pre className="mt-4 max-h-[50dvh] overflow-auto rounded-lg border border-fog bg-paper p-4 font-mono text-xs leading-5">
        <code>{code}</code>
      </pre>
      <div className="mt-4 flex justify-end">
        <Button icon={<Copy className="size-4" />} onClick={() => copy(code)}>
          {state === 'copied' ? '복사했어요' : '코드 복사'}
        </Button>
        <CopyStatus state={state} />
      </div>
    </Dialog>
  );
}

/* ---------- canvas ---------- */

function Canvas({
  spec,
  inference,
  selectedId,
  isReadOnly,
  onSelect,
  onInsert,
  onReorder,
  onRemove,
}: {
  spec: DesignSpec;
  inference: InferenceResult;
  selectedId: string | null;
  isReadOnly: boolean;
  onSelect: (id: string | null) => void;
  onInsert: (type: DesignLayerType, index: number) => void;
  onReorder: (id: string, index: number) => void;
  onRemove: (id: string) => void;
}) {
  const flow = useReactFlow();
  const indexAt = (y: number) => Math.round((y - FIRST_LAYER_Y) / ROW);
  const layerCount = spec.layers.length;
  // Re-frame when blocks are added or removed (templates replace the whole chain); edits to a
  // single layer keep the user's current zoom and pan.
  useEffect(() => {
    const frame = requestAnimationFrame(
      () => void flow.fitView({ duration: 200, maxZoom: 1.1, padding: 0.3 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [flow, layerCount]);

  const nodes = useMemo<Node[]>(
    () => [
      {
        id: 'input',
        type: 'input',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: { shape: spec.input.shape } satisfies InputNodeData,
      },
      ...spec.layers.map((layer, index) => ({
        id: layer.id,
        type: 'layer',
        position: { x: 0, y: FIRST_LAYER_Y + index * ROW },
        draggable: !isReadOnly,
        data: {
          layer,
          result: inference.layers[index] ?? { status: 'blocked' },
          isSelected: layer.id === selectedId,
        } satisfies LayerNodeData,
      })),
    ],
    [spec, inference, selectedId, isReadOnly],
  );
  const edges = useMemo<Edge[]>(() => {
    const ids = ['input', ...spec.layers.map((layer) => layer.id)];
    return ids.slice(1).map((id, index) => {
      const isBroken = inference.layers[index]?.status !== 'ok';
      return {
        id: `${ids[index] ?? ''}-${id}`,
        source: ids[index] ?? 'input',
        target: id,
        style: { stroke: isBroken ? 'var(--color-danger)' : 'var(--color-edge)', strokeWidth: 1.5 },
      };
    });
  }, [spec.layers, inference]);

  const onDrop = (event: DragEvent) => {
    // Drag data can come from anywhere on the page, so only known layer types are accepted.
    const kind = LAYER_KINDS.find(
      (candidate) => candidate.type === event.dataTransfer.getData(DRAG_TYPE),
    );
    if (!kind) return;
    event.preventDefault();
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onInsert(kind.type, indexAt(position.y));
  };

  return (
    <div
      className="relative h-full"
      onDragOver={(event) => {
        if (isReadOnly) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={DESIGN_NODE_TYPES}
        nodesConnectable={false}
        deleteKeyCode={isReadOnly ? null : ['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ maxZoom: 1.1, padding: 0.3 }}
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node) => onSelect(node.id === 'input' ? null : node.id)}
        onPaneClick={() => onSelect(null)}
        onNodeDragStop={(_event, node) => onReorder(node.id, indexAt(node.position.y))}
        onNodesDelete={(deleted) => deleted.forEach((node) => onRemove(node.id))}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.2}
          color="var(--color-dots)"
        />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      {spec.layers.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-slate">
          왼쪽에서 레이어를 끌어오거나 템플릿으로 시작해보세요.
        </p>
      )}
    </div>
  );
}

/* ---------- page ---------- */

function Editor({ initial }: { initial: Design | null }) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '이름 없는 설계');
  const [visibility, setVisibility] = useState<DesignVisibility>(initial?.visibility ?? 'private');
  const [spec, setSpec] = useState<DesignSpec>(initial?.spec ?? EMPTY_SPEC);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isReadOnly = initial !== null && !initial.canEdit;
  const inference = useMemo(() => inferShapes(spec), [spec]);
  const errorCount = inference.layers.filter((layer) => layer.status === 'error').length;

  const edit = (next: DesignSpec) => {
    setSpec(next);
    setIsDirty(true);
  };
  const insert = (type: DesignLayerType, index: number) => {
    const at = Math.max(0, Math.min(index, spec.layers.length));
    const layer = createLayer(type, shapeBefore(spec, inference, at));
    edit({ ...spec, layers: [...spec.layers.slice(0, at), layer, ...spec.layers.slice(at)] });
    setSelectedId(layer.id);
  };
  const reorder = (id: string, index: number) => {
    const from = spec.layers.findIndex((layer) => layer.id === id);
    if (from === -1) return;
    const to = Math.max(0, Math.min(index, spec.layers.length - 1));
    // Always produce a new object so the node snaps back into the chain even when unmoved.
    edit({ ...spec, layers: moveItem(spec.layers, from, to) });
  };
  const remove = (id: string) => {
    edit({ ...spec, layers: spec.layers.filter((layer) => layer.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim() || '이름 없는 설계', spec, visibility };
      return initial && !isReadOnly ? updateDesign(initial.id, body) : createDesign(body);
    },
    onSuccess: (saved) => {
      setIsDirty(false);
      queryClient.setQueryData(designKeys.detail(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: designKeys.list });
      if (initial?.id !== saved.id) void navigate(`/designs/${saved.id}`, { replace: true });
    },
  });

  const selectedIndex = spec.layers.findIndex((layer) => layer.id === selectedId);
  const selected = spec.layers[selectedIndex];

  return (
    <AppFrame isWorkspace isFullHeight>
      <div className="flex flex-wrap items-center gap-3 border-b border-fog px-4 py-3 md:px-6">
        <label className="min-w-0 flex-1">
          <span className="sr-only">설계 이름</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setIsDirty(true);
            }}
            readOnly={isReadOnly}
            maxLength={200}
            className="h-9 w-full max-w-md rounded-md border border-transparent bg-transparent px-2 text-lg font-bold tracking-[-0.01em] hover:border-fog focus:border-primary focus:outline-none read-only:hover:border-transparent"
          />
        </label>
        {initial && isReadOnly && (
          <span className="text-sm text-slate">
            <Link to={`/u/${initial.owner.username}`} className="hover:text-primary">
              @{initial.owner.username}
            </Link>
            의 설계 · 읽기 전용
          </span>
        )}
        <span
          className={clsx('text-sm', errorCount > 0 ? 'text-danger' : 'text-slate')}
          role="status"
        >
          {errorCount > 0
            ? `맞지 않는 레이어 ${String(errorCount)}개`
            : `${formatParams(inference.totalParams)} params · 출력 ${inference.output ? formatShape(inference.output) : '—'}`}
        </span>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => {
              setVisibility((current) => (current === 'public' ? 'private' : 'public'));
              setIsDirty(true);
            }}
            aria-pressed={visibility === 'public'}
            className="flex h-8 items-center gap-1.5 rounded-md border border-fog px-2.5 text-sm text-slate hover:border-lilac hover:text-sumi"
          >
            {visibility === 'public' ? <Globe className="size-4" /> : <Lock className="size-4" />}
            {visibility === 'public' ? '공개' : '비공개'}
          </button>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={<Code2 className="size-4" />}
          onClick={() => setIsExporting(true)}
        >
          PyTorch로 내보내기
        </Button>
        {status === 'signed-in' ? (
          <Button
            size="sm"
            isLoading={save.isPending}
            disabled={!isReadOnly && !isDirty && initial !== null}
            onClick={() => save.mutate()}
          >
            {isReadOnly ? '내 설계로 복사' : isDirty || !initial ? '저장' : '저장됨'}
          </Button>
        ) : (
          <Link to="/login?next=/designs/new" className="text-sm text-primary hover:underline">
            로그인하고 저장하기
          </Link>
        )}
      </div>
      {save.isError && (
        <div className="px-4 pt-3 md:px-6">
          <Alert>{errorMessage(save.error, t)}</Alert>
        </div>
      )}
      <div
        className={clsx(
          'grid min-h-0 flex-1',
          isReadOnly ? 'grid-cols-[minmax(0,1fr)_20rem]' : 'grid-cols-[17rem_minmax(0,1fr)_20rem]',
        )}
      >
        {!isReadOnly && (
          <Palette
            spec={spec}
            inference={inference}
            onAdd={(type) => insert(type, spec.layers.length)}
            onInputShape={(shape) => edit({ ...spec, input: { shape } })}
            onTemplate={(template) => {
              edit(template);
              setSelectedId(null);
            }}
          />
        )}
        <ReactFlowProvider>
          <Canvas
            spec={spec}
            inference={inference}
            selectedId={selectedId}
            isReadOnly={isReadOnly}
            onSelect={setSelectedId}
            onInsert={insert}
            onReorder={reorder}
            onRemove={remove}
          />
        </ReactFlowProvider>
        <aside
          className="min-h-0 overflow-y-auto border-l border-fog bg-surface"
          aria-label="레이어 설정"
        >
          {selected ? (
            <LayerInspector
              key={selected.id}
              layer={selected}
              index={selectedIndex}
              count={spec.layers.length}
              result={inference.layers[selectedIndex]}
              isReadOnly={isReadOnly}
              onChange={(layer) =>
                edit({
                  ...spec,
                  layers: spec.layers.map((item) => (item.id === layer.id ? layer : item)),
                })
              }
              onMove={(to) => edit({ ...spec, layers: moveItem(spec.layers, selectedIndex, to) })}
              onRemove={() => remove(selected.id)}
            />
          ) : (
            <div className="p-5 text-sm leading-6 text-slate">
              <p className="font-semibold text-sumi">레이어를 골라보세요</p>
              <p className="mt-1">
                블록을 누르면 여기서 크기를 바꿀 수 있어요. 모양이 맞지 않는 레이어는 빨갛게
                표시되고, 고치는 방법을 알려줘요.
              </p>
            </div>
          )}
        </aside>
      </div>
      <ExportDialog spec={spec} open={isExporting} onOpenChange={setIsExporting} />
    </AppFrame>
  );
}

export function NewDesignPage() {
  return <Editor initial={null} />;
}

export function DesignPage() {
  const { designId = '' } = useParams();
  const design = useQuery({
    queryKey: designKeys.detail(designId),
    queryFn: () => getDesign(designId),
  });
  if (design.isPending) return <Loading className="grid min-h-dvh place-items-center text-lilac" />;
  if (design.isError) {
    return (
      <AppFrame>
        <div className="mx-auto max-w-[1280px] px-4 md:px-10">
          <ErrorState message="설계를 불러오지 못했어요." onRetry={() => void design.refetch()} />
        </div>
      </AppFrame>
    );
  }
  return <Editor key={design.data.id} initial={design.data} />;
}
