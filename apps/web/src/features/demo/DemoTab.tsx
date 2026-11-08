import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, ImageUp, Play, Shuffle, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { hasRoleAtLeast, type OnnxGraphPayload, type TensorInfo } from '@mieru/shared';
import { Badge } from '../../components/Badge.js';
import { OP_COLORS } from '../../design/op-palette.js';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { EmptyState } from '../../design/ui/EmptyState.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { formatBytes, formatShape } from '../../lib/format.js';
import { getGraph, modelKeys } from '../models/api.js';
import { useRepo } from '../repo/RepoLayout.js';
import { publishActivations, type ActivationPreview } from './activation-store.js';
import { demoKeys, getLabels, getModelFileUrl, saveLabels } from './api.js';
import { channelPreviewUrl, drawChannel, imagePixels } from './canvas.js';
import {
  CHANNELS_PER_LAYER,
  activationGrid,
  softmax,
  topIndices,
  type ActivationGrid,
} from './feature-maps.js';
import {
  concreteShape,
  elementCount,
  inputKindOf,
  parseNumbers,
  rgbaToChw,
  seededValues,
  type Normalization,
} from './inputs.js';
import { pickIntermediates, type Intermediate } from './intermediates.js';
import { appendGraphOutputs } from './onnx-outputs.js';
import {
  DEMO_MAX_BYTES,
  createSession,
  fetchWithProgress,
  runSession,
  type FeedValues,
  type LoadedSession,
  type RunOutput,
} from './runner.js';

const TOP_K = 5;
const VALUE_PREVIEW_COUNT = 12;
const SUPPORTED_DTYPES = new Set(['float32', 'int64', null]);

const BACKEND_LABELS = { webgpu: 'WebGPU', wasm: 'WASM' } as const;

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-fog bg-surface">
      <div className="flex h-11 items-center gap-2 border-b border-fog px-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ---------- input ---------- */

interface InputState {
  numbers: string;
  imageUrl: string | null;
  normalization: Normalization;
}

function buildFeed(
  tensor: TensorInfo,
  state: InputState,
  image: HTMLImageElement | null,
): { values: FeedValues; dims: number[] } | string {
  const dims = concreteShape(tensor);
  const count = elementCount(dims);
  if (inputKindOf(tensor) === 'image' && image) {
    const [, channels = 3, height = 1, width = 1] = dims;
    const pixels = imagePixels(image, width, height);
    const data = rgbaToChw(pixels, width, height, channels === 1 ? 1 : 3, state.normalization);
    return { values: { dtype: 'float32', data }, dims };
  }
  const values = parseNumbers(state.numbers);
  if (!values) return '숫자가 아닌 값이 있어요. 쉼표나 공백으로 구분해 주세요.';
  if (values.length !== count) {
    return `${formatShape(dims)} 모양이라 숫자 ${String(count)}개가 필요해요. 지금은 ${String(values.length)}개예요.`;
  }
  if (tensor.dtype === 'int64') {
    return {
      values: {
        dtype: 'int64',
        data: BigInt64Array.from(values, (value) => BigInt(Math.round(value))),
      },
      dims,
    };
  }
  return { values: { dtype: 'float32', data: Float32Array.from(values) }, dims };
}

function InputPanel({
  tensor,
  state,
  onChange,
  imageRef,
}: {
  tensor: TensorInfo;
  state: InputState;
  onChange: (next: InputState) => void;
  imageRef: React.RefObject<HTMLImageElement | null>;
}) {
  const dims = concreteShape(tensor);
  const isImage = inputKindOf(tensor) === 'image';
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-xs text-slate">
        <span className="font-mono text-sumi">{tensor.name}</span>
        <span className="font-mono">{formatShape(tensor.shape)}</span>
        {tensor.dtype && <Badge>{tensor.dtype}</Badge>}
      </p>
      {isImage && (
        <>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-fog bg-paper px-4 py-6 text-center text-sm text-slate hover:border-lilac">
            {state.imageUrl ? (
              <img
                ref={imageRef}
                src={state.imageUrl}
                alt="입력 이미지"
                className="max-h-40 rounded-md object-contain"
              />
            ) : (
              <ImageUp className="size-6" aria-hidden="true" />
            )}
            <span>
              {state.imageUrl ? '다른 이미지 고르기' : '이미지를 고르면'} {String(dims[3])}×
              {String(dims[2])}로 맞춰서 넣어요
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
                onChange({ ...state, imageUrl: URL.createObjectURL(file) });
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            정규화
            <select
              value={state.normalization}
              onChange={(event) =>
                onChange({ ...state, normalization: event.target.value as Normalization })
              }
              className="h-8 rounded-md border border-fog bg-surface px-2 text-sm"
            >
              <option value="imagenet">ImageNet 평균·표준편차</option>
              <option value="none">0~1 그대로</option>
            </select>
          </label>
          {!state.imageUrl && (
            <p className="text-xs text-slate">이미지가 없으면 아래 숫자 값으로 실행해요.</p>
          )}
        </>
      )}
      {(!isImage || !state.imageUrl) && (
        <label className="grid gap-1.5 text-sm">
          <span className="flex items-center justify-between">
            값 {String(elementCount(dims))}개
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...state,
                  numbers: seededValues(elementCount(dims), Date.now() % 100_000)
                    .map((value) => value.toFixed(3))
                    .join(', '),
                })
              }
              className="flex items-center gap-1 text-xs text-slate hover:text-primary"
            >
              <Shuffle className="size-3.5" aria-hidden="true" /> 무작위로 채우기
            </button>
          </span>
          <textarea
            value={state.numbers}
            onChange={(event) => onChange({ ...state, numbers: event.target.value })}
            rows={isImage ? 3 : 5}
            spellCheck={false}
            className="resize-y rounded-md border border-fog bg-surface px-3 py-2 font-mono text-xs leading-5 focus:border-primary focus:outline-none"
          />
        </label>
      )}
    </div>
  );
}

/* ---------- output ---------- */

function looksLikeProbabilities(values: readonly number[]): boolean {
  const sum = values.reduce((total, value) => total + value, 0);
  return values.every((value) => value >= 0) && Math.abs(sum - 1) < 1e-3;
}

function NonFiniteNotice() {
  return (
    <p className="rounded-md bg-danger-soft px-3 py-2 text-xs leading-5 text-danger">
      NaN이나 무한대 값이 나왔어요. 가중치나 정규화 통계(BatchNorm 분산 등)가 잘못된 모델일 수
      있어요.
    </p>
  );
}

const isAllFinite = (values: Float32Array) => values.every(Number.isFinite);

function OutputView({ output, labels }: { output: RunOutput; labels: string[] }) {
  if (!isAllFinite(output.values)) return <NonFiniteNotice />;
  const values = Array.from(output.values);
  const isClassVector = output.dims.length <= 2 && values.length > 1;
  if (!isClassVector) {
    return (
      <p className="font-mono text-xs leading-6 break-all text-slate">
        {values
          .slice(0, VALUE_PREVIEW_COUNT)
          .map((value) => value.toFixed(4))
          .join(', ')}
        {values.length > VALUE_PREVIEW_COUNT && ` … (${String(values.length)}개)`}
      </p>
    );
  }
  const probabilities = looksLikeProbabilities(values) ? values : softmax(values);
  return (
    <ol className="grid gap-2" aria-label={`${output.name} 상위 ${String(TOP_K)}개`}>
      {topIndices(probabilities, TOP_K).map((index, rank) => {
        const probability = probabilities[index] ?? 0;
        return (
          <li
            key={index}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm"
          >
            <span className="truncate" title={labels[index] ?? `클래스 ${String(index)}`}>
              {labels[index] ?? <span className="font-mono text-slate">#{index}</span>}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-fog">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${String(Math.max(probability * 100, 1))}%`,
                  backgroundColor: rank === 0 ? 'var(--color-primary)' : 'var(--color-lilac)',
                }}
              />
            </span>
            <span className="tabular text-right text-xs text-slate">
              {(probability * 100).toFixed(1)}%
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function LabelsEditor({ modelId, labels }: { modelId: string; labels: string[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(labels.join('\n'));
  const save = useMutation({
    mutationFn: () =>
      saveLabels(
        modelId,
        draft
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    onSuccess: (saved) => queryClient.setQueryData(demoKeys.labels(modelId), saved),
  });
  return (
    <details className="group mt-4 border-t border-fog pt-3 text-sm">
      <summary className="cursor-pointer text-slate hover:text-sumi">
        클래스 이름 {labels.length > 0 ? `${String(labels.length)}개` : '설정하기'}
      </summary>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={6}
        placeholder={'한 줄에 하나씩, 출력 순서대로\n예) 고양이\n강아지'}
        aria-label="클래스 이름"
        className="mt-2 w-full resize-y rounded-md border border-fog bg-surface px-3 py-2 font-mono text-xs leading-5 focus:border-primary focus:outline-none"
      />
      {save.isError && <Alert>클래스 이름을 저장하지 못했어요.</Alert>}
      <Button
        size="sm"
        variant="secondary"
        isLoading={save.isPending}
        onClick={() => save.mutate()}
      >
        저장
      </Button>
    </details>
  );
}

/* ---------- feature maps ---------- */

function ChannelCanvas({
  data,
  grid,
  channel,
}: {
  data: Float32Array;
  grid: ActivationGrid;
  channel: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawChannel(ref.current, data, grid, channel);
  }, [data, grid, channel]);
  return (
    <canvas
      ref={ref}
      aria-label={`채널 ${String(channel)}`}
      className="aspect-square w-full rounded-[3px] bg-fog [image-rendering:pixelated]"
    />
  );
}

function VectorBars({ values }: { values: Float32Array }) {
  const shown = Array.from(values.slice(0, 32));
  const peak = Math.max(...shown.map(Math.abs), 1e-9);
  return (
    <div className="flex h-12 items-center gap-px" aria-hidden="true">
      {shown.map((value, index) => (
        <span
          key={index}
          className="flex-1 rounded-[1px]"
          style={{
            height: `${String(Math.max((Math.abs(value) / peak) * 100, 4))}%`,
            backgroundColor: value >= 0 ? 'var(--color-lilac)' : 'var(--color-primary)',
          }}
        />
      ))}
    </div>
  );
}

function FeatureMapCard({
  modelId,
  item,
  output,
}: {
  modelId: string;
  item: Intermediate;
  output: RunOutput;
}) {
  const grid = activationGrid(output.dims);
  return (
    <li className="rounded-xl border border-fog bg-surface p-3">
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-[2px]"
          style={{ backgroundColor: OP_COLORS[item.family] }}
        />
        <span className="text-sm font-semibold">{item.opType}</span>
        <span className="tabular ml-auto font-mono text-[11px] text-slate">
          {formatShape(output.dims)}
        </span>
      </div>
      <Link
        to={`/m/${modelId}/graph?node=${encodeURIComponent(item.nodeName)}`}
        className="mt-0.5 block truncate font-mono text-[11px] text-slate hover:text-primary"
        title={item.nodeName}
      >
        {item.nodeName}
      </Link>
      <div className="mt-2.5">
        {!isAllFinite(output.values) ? (
          <p className="py-3 text-center font-mono text-xs text-danger">NaN</p>
        ) : grid ? (
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: Math.min(grid.channels, CHANNELS_PER_LAYER) }, (_, channel) => (
              <ChannelCanvas key={channel} data={output.values} grid={grid} channel={channel} />
            ))}
          </div>
        ) : (
          <VectorBars values={output.values} />
        )}
      </div>
    </li>
  );
}

/* ---------- page ---------- */

type Stage =
  | { kind: 'idle' }
  | { kind: 'downloading'; loaded: number; total: number | null }
  | { kind: 'preparing' }
  | { kind: 'ready'; loaded: LoadedSession }
  | { kind: 'failed'; message: string };

function previewsFrom(outputs: RunOutput[]): Map<string, ActivationPreview> {
  const previews = new Map<string, ActivationPreview>();
  for (const output of outputs) {
    const grid = activationGrid(output.dims);
    if (grid)
      previews.set(output.name, {
        dataUrl: channelPreviewUrl(output.values, grid),
        dims: output.dims,
      });
  }
  return previews;
}

function DemoWorkspace({ graph }: { graph: OnnxGraphPayload }) {
  const { model } = useRepo();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const primaryInput = graph.inputs[0];
  const intermediates = useMemo(() => pickIntermediates(graph), [graph]);
  const [inputState, setInputState] = useState<InputState>(() => ({
    numbers: primaryInput
      ? seededValues(elementCount(concreteShape(primaryInput)))
          .map((value) => value.toFixed(3))
          .join(', ')
      : '',
    imageUrl: null,
    normalization: 'imagenet',
  }));
  const imageRef = useRef<HTMLImageElement>(null);
  const labels = useQuery({
    queryKey: demoKeys.labels(model.id),
    queryFn: () => getLabels(model.id),
  });
  const [result, setResult] = useState<{ outputs: RunOutput[]; milliseconds: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    return () => {
      if (stage.kind === 'ready') void stage.loaded.session.release();
    };
  }, [stage]);

  const load = async () => {
    try {
      setStage({ kind: 'downloading', loaded: 0, total: model.sizeBytes });
      const url = await getModelFileUrl(model.id);
      const bytes = await fetchWithProgress(url, (loaded, total) =>
        setStage({ kind: 'downloading', loaded, total }),
      );
      setStage({ kind: 'preparing' });
      const patched = appendGraphOutputs(
        bytes,
        intermediates.map((item) => item.output),
      );
      setStage({ kind: 'ready', loaded: await createSession(patched) });
    } catch (error) {
      setStage({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const run = async () => {
    if (stage.kind !== 'ready' || !primaryInput) return;
    setRunError(null);
    const feeds: Record<string, { values: FeedValues; dims: number[] }> = {};
    for (const [index, tensor] of graph.inputs.entries()) {
      const state =
        index === 0
          ? inputState
          : {
              ...inputState,
              imageUrl: null,
              numbers: seededValues(elementCount(concreteShape(tensor))).join(','),
            };
      const feed = buildFeed(tensor, state, index === 0 ? imageRef.current : null);
      if (typeof feed === 'string') {
        setRunError(feed);
        return;
      }
      feeds[tensor.name] = feed;
    }
    setIsRunning(true);
    try {
      const next = await runSession(stage.loaded, feeds);
      setResult(next);
      publishActivations(model.id, previewsFrom(next.outputs));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  };

  const unsupported = graph.inputs.find((tensor) => !SUPPORTED_DTYPES.has(tensor.dtype));
  if (!primaryInput) return <EmptyState title="입력이 없는 그래프라 실행할 수 없어요" />;
  if (unsupported) {
    return (
      <EmptyState
        title="아직 지원하지 않는 입력 타입이에요"
        body={`${unsupported.name}의 타입이 ${unsupported.dtype ?? '알 수 없음'}이에요. 지금은 float32와 int64 입력만 실행할 수 있어요.`}
      />
    );
  }

  const outputsByName = new Map(result?.outputs.map((output) => [output.name, output]));
  const graphOutputs = graph.outputs.flatMap((tensor) => {
    const output = outputsByName.get(tensor.name);
    return output ? [output] : [];
  });
  const canEdit = hasRoleAtLeast(model.myAccess.role, 'editor');

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Panel
            title="입력"
            action={
              stage.kind === 'ready' && (
                <Badge
                  icon={
                    stage.loaded.backend === 'webgpu' ? (
                      <Zap className="size-3" />
                    ) : (
                      <Cpu className="size-3" />
                    )
                  }
                >
                  {BACKEND_LABELS[stage.loaded.backend]}
                </Badge>
              )
            }
          >
            <InputPanel
              tensor={primaryInput}
              state={inputState}
              onChange={setInputState}
              imageRef={imageRef}
            />
            {graph.inputs.length > 1 && (
              <p className="mt-3 text-xs text-slate">
                나머지 입력 {String(graph.inputs.length - 1)}개는 무작위 값으로 채워요.
              </p>
            )}
            <div className="mt-4">
              {stage.kind === 'idle' || stage.kind === 'failed' ? (
                <Button className="w-full" onClick={() => void load()}>
                  모델 불러오기 ({formatBytes(model.sizeBytes)})
                </Button>
              ) : stage.kind === 'ready' ? (
                <Button
                  className="w-full"
                  icon={<Play className="size-4" />}
                  isLoading={isRunning}
                  onClick={() => void run()}
                >
                  실행
                </Button>
              ) : (
                <div role="status" className="grid gap-2 text-sm text-slate">
                  {stage.kind === 'downloading' ? (
                    <>
                      <span>
                        내려받는 중 {formatBytes(stage.loaded)}
                        {stage.total ? ` / ${formatBytes(stage.total)}` : ''}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-fog">
                        <span
                          className="block h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: stage.total
                              ? `${String((stage.loaded / stage.total) * 100)}%`
                              : '30%',
                          }}
                        />
                      </span>
                    </>
                  ) : (
                    <span>실행 준비 중…</span>
                  )}
                </div>
              )}
              {stage.kind === 'failed' && (
                <div className="mt-3">
                  <Alert>모델을 불러오지 못했어요: {stage.message}</Alert>
                </div>
              )}
              {runError && (
                <div className="mt-3">
                  <Alert>{runError}</Alert>
                </div>
              )}
            </div>
          </Panel>
          <p className="text-xs leading-5 text-slate">
            모델은 이 브라우저 안에서만 실행돼요. 입력한 값과 이미지는 서버로 보내지 않아요.
          </p>
        </div>
        <Panel
          title="출력"
          action={
            result && (
              <span className="tabular text-xs text-slate">
                {result.milliseconds.toFixed(1)} ms
              </span>
            )
          }
        >
          {graphOutputs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate">
              {stage.kind === 'ready'
                ? '실행하면 결과가 여기에 나와요.'
                : '모델을 불러오면 바로 실행할 수 있어요.'}
            </p>
          ) : (
            <div className="grid gap-5">
              {graphOutputs.map((output) => (
                <div key={output.name}>
                  <p className="mb-2 flex items-center gap-2 text-xs text-slate">
                    <span className="font-mono text-sumi">{output.name}</span>
                    <span className="font-mono">{formatShape(output.dims)}</span>
                  </p>
                  <OutputView output={output} labels={labels.data?.labels ?? []} />
                </div>
              ))}
            </div>
          )}
          {canEdit && labels.data && (
            <LabelsEditor modelId={model.id} labels={labels.data.labels} />
          )}
        </Panel>
      </div>

      {result && intermediates.length > 0 && (
        <section aria-labelledby="feature-maps">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="feature-maps" className="font-semibold">
              레이어별 feature map
            </h2>
            <Link to={`/m/${model.id}/graph`} className="text-sm text-slate hover:text-primary">
              그래프에서 보기
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {intermediates.map((item) => {
              const output = outputsByName.get(item.output);
              return output ? (
                <FeatureMapCard key={item.output} modelId={model.id} item={item} output={output} />
              ) : null;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export function DemoTab() {
  const { model } = useRepo();
  const version = model.currentVersion;
  const graph = useQuery({
    queryKey: modelKeys.graph(model.id, null),
    queryFn: () => getGraph(model.id, null),
    enabled: version !== null && model.format === 'onnx',
    staleTime: Number.POSITIVE_INFINITY,
  });
  let content: ReactNode;
  if (model.format !== 'onnx') {
    content = <EmptyState title="ONNX 모델만 브라우저에서 실행할 수 있어요" />;
  } else if (!model.myAccess.canDownload) {
    content = (
      <EmptyState
        title="다운로드 권한이 있어야 실행할 수 있어요"
        body="데모는 원본 파일을 이 브라우저로 받아서 실행해요. 저장소 주인이 다운로드를 허용하면 쓸 수 있어요."
      />
    );
  } else if (model.sizeBytes !== null && model.sizeBytes > DEMO_MAX_BYTES) {
    content = (
      <EmptyState
        title="브라우저에서 돌리기엔 큰 모델이에요"
        body={`${formatBytes(DEMO_MAX_BYTES)}보다 작은 모델만 실행할 수 있어요.`}
      />
    );
  } else if (graph.isPending) {
    content = <Loading />;
  } else if (graph.isError) {
    content = (
      <ErrorState message="그래프를 불러오지 못했어요." onRetry={() => void graph.refetch()} />
    );
  } else if (graph.data.payload.kind !== 'onnx-graph') {
    content = <EmptyState title="ONNX 모델만 브라우저에서 실행할 수 있어요" />;
  } else {
    content = <DemoWorkspace graph={graph.data.payload} />;
  }
  return <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6">{content}</div>;
}
