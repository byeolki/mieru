import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { TensorFilters, TensorStats } from '@mieru/shared';
import { EmptyState } from '../../design/ui/EmptyState.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { ApiError } from '../../lib/api-error.js';
import { formatBytes, formatParams, formatShape } from '../../lib/format.js';
import { useRepo } from '../repo/RepoLayout.js';
import { getTensorFilters, getTensorStats, listTensors, weightKeys } from './api.js';
import { divergingColor, rgbKernelPixels } from './filter-colors.js';

const LIST_LIMIT = 400;

function formatValue(value: number): string {
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  return magnitude >= 1e4 || magnitude < 1e-3 ? value.toExponential(2) : value.toFixed(4);
}

function HistogramChart({ stats }: { stats: TensorStats }) {
  const peak = Math.max(...stats.histogram.counts, 1);
  const { min, max } = stats.histogram;
  const zeroAt = max > min && min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : null;
  return (
    <figure>
      <div
        className="relative flex h-40 items-end gap-px border-b border-fog"
        role="img"
        aria-label={`${stats.name} 값 분포, ${formatValue(min)}부터 ${formatValue(max)}까지`}
      >
        {stats.histogram.counts.map((count, index) => (
          <span
            key={index}
            className="flex-1 rounded-t-[1px] bg-lilac"
            style={{ height: `${String(Math.max((count / peak) * 100, count > 0 ? 1 : 0))}%` }}
          />
        ))}
        {zeroAt !== null && (
          <span
            className="absolute inset-y-0 w-px bg-primary/70"
            style={{ left: `${String(zeroAt)}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <figcaption className="tabular mt-1.5 flex justify-between font-mono text-[11px] text-slate">
        <span>{formatValue(min)}</span>
        {zeroAt !== null && <span className="text-primary">0</span>}
        <span>{formatValue(max)}</span>
      </figcaption>
    </figure>
  );
}

function StatGrid({ stats }: { stats: TensorStats }) {
  const items: [string, string][] = [
    ['평균', formatValue(stats.mean)],
    ['표준편차', formatValue(stats.std)],
    ['최소', formatValue(stats.min)],
    ['최대', formatValue(stats.max)],
    ['0인 값', `${(stats.zeroFraction * 100).toFixed(1)}%`],
    ['NaN·무한대', stats.nonFinite.toLocaleString('ko-KR')],
  ];
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-fog bg-fog text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="bg-surface px-3 py-2">
          <dt className="text-xs text-slate">{label}</dt>
          <dd
            className={clsx(
              'tabular mt-0.5 font-mono',
              label === 'NaN·무한대' && stats.nonFinite > 0 && 'text-danger',
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FilterCanvas({ filters, index }: { filters: TensorFilters; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const values = filters.filters[index];
    if (!canvas || !values) return;
    const plane = filters.kernelHeight * filters.kernelWidth;
    canvas.width = filters.kernelWidth;
    canvas.height = filters.kernelHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    let pixels: Uint8ClampedArray<ArrayBuffer>;
    if (filters.mode === 'rgb') {
      pixels = rgbKernelPixels(values, plane, filters.min, filters.max);
    } else {
      const magnitude = Math.max(Math.abs(filters.min), Math.abs(filters.max));
      pixels = new Uint8ClampedArray(plane * 4);
      values.forEach((value, pixel) => pixels.set(divergingColor(value, magnitude), pixel * 4));
    }
    context.putImageData(new ImageData(pixels, filters.kernelWidth, filters.kernelHeight), 0, 0);
  }, [filters, index]);
  return (
    <canvas
      ref={ref}
      aria-label={`필터 ${String(index)}`}
      className="aspect-square w-full rounded-[3px] border border-fog [image-rendering:pixelated]"
    />
  );
}

function FiltersSection({
  modelId,
  version,
  name,
  canDownload,
}: {
  modelId: string;
  version: number | null;
  name: string;
  canDownload: boolean;
}) {
  const filters = useQuery({
    queryKey: weightKeys.filters(modelId, version, name),
    queryFn: () => getTensorFilters(modelId, version, name),
    enabled: canDownload,
    retry: false,
  });
  if (!canDownload) {
    return (
      <p className="text-sm text-slate">
        필터 이미지는 원본 가중치라서 다운로드 권한이 있어야 볼 수 있어요.
      </p>
    );
  }
  if (filters.isPending) return <Loading className="py-4 text-lilac" />;
  if (filters.isError) {
    return <p className="text-sm text-danger">필터를 그리지 못했어요.</p>;
  }
  const data = filters.data;
  return (
    <div>
      <p className="mb-2 text-xs text-slate">
        {data.mode === 'rgb'
          ? '입력이 RGB 3채널이라 필터를 색으로 그렸어요.'
          : '입력 채널 평균이에요. 파랑은 음수, 분홍은 양수, 흰색은 0에 가까운 값이에요.'}{' '}
        {data.outChannels > data.filters.length &&
          `출력 채널 ${String(data.outChannels)}개 중 앞 ${String(data.filters.length)}개.`}
      </p>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12 lg:grid-cols-16">
        {data.filters.map((_, index) => (
          <FilterCanvas key={index} filters={data} index={index} />
        ))}
      </div>
    </div>
  );
}

function TensorPanel({ name, version }: { name: string; version: number | null }) {
  const { model } = useRepo();
  const stats = useQuery({
    queryKey: weightKeys.stats(model.id, version, name),
    queryFn: () => getTensorStats(model.id, version, name),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (stats.isPending) return <Loading />;
  if (stats.isError) {
    if (stats.error instanceof ApiError && stats.error.code === 'unsupported_dtype') {
      return (
        <EmptyState
          title="이 타입은 아직 분포를 그릴 수 없어요"
          body="float32, float16, bfloat16과 정수 8·32비트를 지원해요."
        />
      );
    }
    return <ErrorState message="분포를 계산하지 못했어요." onRetry={() => void stats.refetch()} />;
  }
  const data = stats.data;
  const isFilterLike =
    data.shape.length === 4 && (data.shape[2] ?? 99) <= 11 && (data.shape[3] ?? 99) <= 11;
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="font-mono text-sm font-semibold break-all">{data.name}</h2>
        <p className="tabular mt-1 font-mono text-xs text-slate">
          {data.dtype} {formatShape(data.shape)} · {data.count.toLocaleString('ko-KR')}개
          {data.sampled && ' · 큰 텐서라 일부 구간만 계산했어요'}
        </p>
      </div>
      <HistogramChart stats={data} />
      <StatGrid stats={data} />
      {isFilterLike && (
        <section aria-labelledby="filters-title">
          <h3 id="filters-title" className="mb-2 text-sm font-semibold">
            필터
          </h3>
          <FiltersSection
            modelId={model.id}
            version={version}
            name={data.name}
            canDownload={model.myAccess.canDownload}
          />
        </section>
      )}
    </div>
  );
}

export function WeightsTab() {
  const { model } = useRepo();
  const [params, setParams] = useSearchParams();
  const version = Number(params.get('version')) || null;
  const [filter, setFilter] = useState('');
  const tensors = useQuery({
    queryKey: weightKeys.list(model.id, version),
    queryFn: () => listTensors(model.id, version),
    enabled: model.currentVersion !== null,
  });
  const items = useMemo(() => tensors.data?.items ?? [], [tensors.data]);
  const selectedName =
    params.get('name') ??
    items.find((item) => item.shape.length === 4)?.name ??
    items[0]?.name ??
    null;
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (
      needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items
    ).slice(0, LIST_LIMIT);
  }, [items, filter]);

  let content;
  if (!model.currentVersion) content = <EmptyState title="분석이 끝나면 가중치를 볼 수 있어요" />;
  else if (tensors.isPending) content = <Loading />;
  else if (tensors.isError)
    content = (
      <ErrorState message="텐서 목록을 불러오지 못했어요." onRetry={() => void tensors.refetch()} />
    );
  else if (items.length === 0) content = <EmptyState title="파일 안에 가중치 텐서가 없어요" />;
  else {
    content = (
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex max-h-[44rem] flex-col overflow-hidden rounded-xl border border-fog bg-surface">
          <label className="relative block border-b border-fog p-2">
            <span className="sr-only">텐서 이름으로 찾기</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-slate"
              aria-hidden="true"
            />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`텐서 ${String(items.length)}개에서 찾기`}
              className="h-8 w-full rounded-md bg-paper pr-3 pl-8 text-sm placeholder:text-slate focus:outline-none"
            />
          </label>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1" aria-label="가중치 텐서">
            {visible.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  aria-current={item.name === selectedName ? 'true' : undefined}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('name', item.name);
                    setParams(next, { replace: true });
                  }}
                  className={clsx(
                    'block w-full px-3 py-1.5 text-left',
                    item.name === selectedName ? 'bg-haze' : 'hover:bg-paper',
                  )}
                >
                  <span className="block truncate font-mono text-xs" title={item.name}>
                    {item.name}
                  </span>
                  <span className="tabular block font-mono text-[11px] text-slate">
                    {item.dtype} {formatShape(item.shape)} · {formatParams(item.params)} ·{' '}
                    {formatBytes(item.bytes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {items.length > visible.length && !filter && (
            <p className="border-t border-fog px-3 py-2 text-xs text-slate">
              앞 {LIST_LIMIT}개만 보여요. 이름으로 찾아보세요.
            </p>
          )}
        </aside>
        <section className="rounded-xl border border-fog bg-surface p-5">
          {selectedName ? (
            <TensorPanel key={selectedName} name={selectedName} version={version} />
          ) : null}
        </section>
      </div>
    );
  }
  return <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6">{content}</div>;
}
