import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, Minus, Plus, RefreshCw } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { DiffStatus, ModelDiff } from '@mieru/shared';
import { EmptyState } from '../../design/ui/EmptyState.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { formatParams, formatShape } from '../../lib/format.js';
import { getGraph, modelKeys } from '../models/api.js';
import { OnnxGraphView } from '../repo/graph/OnnxGraphView.js';
import type { DiffMark } from '../repo/graph/nodes.js';
import { useRepo } from '../repo/RepoLayout.js';
import { getDiff, listVersions, versionKeys } from './api.js';

const STATUS_STYLE: Record<
  Exclude<DiffStatus, 'unchanged'>,
  { label: string; icon: ReactNode; color: string }
> = {
  added: { label: '추가', icon: <Plus className="size-3.5" />, color: 'var(--color-diff-added)' },
  changed: {
    label: '변경',
    icon: <RefreshCw className="size-3.5" />,
    color: 'var(--color-diff-changed)',
  },
  removed: { label: '삭제', icon: <Minus className="size-3.5" />, color: 'var(--color-danger)' },
};

const CHANGE_LABELS = {
  op: '연산',
  attributes: '속성',
  inputs: '연결',
  weights: '가중치',
} as const;

function CountCard({ title, counts }: { title: string; counts: ModelDiff['summary']['nodes'] }) {
  return (
    <div className="rounded-xl border border-fog bg-surface p-4">
      <p className="text-xs text-slate">{title}</p>
      <div className="tabular mt-2 flex items-baseline gap-4 text-sm">
        {(['added', 'changed', 'removed'] as const).map((status) => (
          <span
            key={status}
            className="flex items-center gap-1"
            style={{ color: STATUS_STYLE[status].color }}
          >
            {STATUS_STYLE[status].icon}
            <span className="text-lg font-semibold">{counts[status]}</span>
            <span className="sr-only">{STATUS_STYLE[status].label}</span>
          </span>
        ))}
        <span className="ml-auto text-xs text-slate">그대로 {counts.unchanged}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Exclude<DiffStatus, 'unchanged'> }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-on-accent"
      style={{ backgroundColor: style.color }}
    >
      {style.label}
    </span>
  );
}

function VersionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 rounded-md border border-fog bg-surface px-2 font-mono text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            v{option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ComparePage() {
  const { model } = useRepo();
  const [params, setParams] = useSearchParams();
  const from = Number(params.get('from'));
  const to = Number(params.get('to'));
  const versions = useQuery({
    queryKey: versionKeys.list(model.id),
    queryFn: () => listVersions(model.id),
  });
  const isValid =
    Number.isInteger(from) && Number.isInteger(to) && from > 0 && to > 0 && from !== to;
  const diff = useQuery({
    queryKey: versionKeys.diff(model.id, from, to),
    queryFn: () => getDiff(model.id, from, to),
    enabled: isValid,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const graph = useQuery({
    queryKey: modelKeys.graph(model.id, to),
    queryFn: () => getGraph(model.id, to),
    enabled: isValid && model.format === 'onnx',
    staleTime: Number.POSITIVE_INFINITY,
  });
  const marks = useMemo(() => {
    const result = new Map<string, DiffMark>();
    for (const node of diff.data?.nodes ?? []) {
      if (node.status === 'added' || node.status === 'changed') result.set(node.name, node.status);
    }
    return result;
  }, [diff.data]);

  const readyNumbers = (versions.data?.items ?? [])
    .filter((item) => item.status === 'ready')
    .map((item) => item.number)
    .sort((a, b) => a - b);
  const pick = (key: 'from' | 'to', value: number) => {
    const next = new URLSearchParams(params);
    next.set(key, String(value));
    setParams(next, { replace: true });
  };

  let body: ReactNode;
  if (!isValid) {
    body = (
      <EmptyState
        title="비교할 두 버전을 골라주세요"
        body="버전 탭에서 두 버전을 체크하면 여기로 와요."
      />
    );
  } else if (diff.isPending) {
    body = <Loading />;
  } else if (diff.isError) {
    body = (
      <ErrorState message="두 버전을 비교하지 못했어요." onRetry={() => void diff.refetch()} />
    );
  } else {
    const data = diff.data;
    const removedNodes = data.nodes.filter((node) => node.status === 'removed');
    const changedNodes = data.nodes.filter((node) => node.status !== 'removed');
    const paramDelta = data.summary.paramsTo - data.summary.paramsFrom;
    body = (
      <div className="grid gap-6">
        <div className="grid gap-3 md:grid-cols-3">
          {model.format === 'onnx' && <CountCard title="노드" counts={data.summary.nodes} />}
          <CountCard title="가중치 텐서" counts={data.summary.tensors} />
          <div className="rounded-xl border border-fog bg-surface p-4">
            <p className="text-xs text-slate">파라미터</p>
            <p className="tabular mt-2 flex items-center gap-2 text-sm">
              {formatParams(data.summary.paramsFrom)}
              <ArrowRight className="size-3.5 text-slate" aria-hidden="true" />
              <span className="text-lg font-semibold">{formatParams(data.summary.paramsTo)}</span>
              <span
                className={clsx(
                  'text-xs',
                  paramDelta === 0
                    ? 'text-slate'
                    : paramDelta > 0
                      ? 'text-(--color-diff-added)'
                      : 'text-danger',
                )}
              >
                {paramDelta > 0 ? '+' : ''}
                {paramDelta.toLocaleString('ko-KR')}
              </span>
            </p>
          </div>
        </div>

        {model.format === 'onnx' && graph.data?.payload.kind === 'onnx-graph' && (
          <section
            aria-label={`v${String(to)} 그래프`}
            className="h-[36rem] overflow-hidden rounded-xl border border-fog"
          >
            <OnnxGraphView
              key={`${String(from)}-${String(to)}`}
              payload={graph.data.payload}
              summary={graph.data.summary}
              diffMarks={marks}
              initialFocusName={changedNodes[0]?.name ?? null}
            />
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {model.format === 'onnx' && (
            <section className="rounded-xl border border-fog bg-surface">
              <h2 className="border-b border-fog px-4 py-3 text-sm font-semibold">달라진 노드</h2>
              {data.nodes.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate">그래프 구조는 똑같아요.</p>
              ) : (
                <ul className="divide-y divide-fog">
                  {[...changedNodes, ...removedNodes].map((node) => (
                    <li
                      key={`${node.status}-${node.name}`}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      <StatusPill status={node.status} />
                      <span className="font-medium">{node.opType}</span>
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-xs text-slate"
                        title={node.name}
                      >
                        {node.name}
                      </span>
                      {node.changes.length > 0 && (
                        <span className="text-xs text-slate">
                          {node.changes.map((change) => CHANGE_LABELS[change]).join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="rounded-xl border border-fog bg-surface">
            <h2 className="border-b border-fog px-4 py-3 text-sm font-semibold">달라진 가중치</h2>
            {data.tensors.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate">가중치가 모두 똑같아요.</p>
            ) : (
              <ul className="divide-y divide-fog">
                {data.tensors.map((tensor) => (
                  <li
                    key={`${tensor.status}-${tensor.name}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <StatusPill status={tensor.status} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={tensor.name}>
                      {tensor.name}
                    </span>
                    <span className="tabular font-mono text-xs text-slate">
                      {tensor.fromShape ? formatShape(tensor.fromShape) : '—'}
                      {' → '}
                      {tensor.toShape ? formatShape(tensor.toShape) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/m/${model.id}/versions`} className="text-sm text-slate hover:text-primary">
          ← 버전 목록
        </Link>
        <h2 className="text-lg font-bold">버전 비교</h2>
        {isValid && readyNumbers.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <VersionSelect
              label="이전 버전"
              value={from}
              options={readyNumbers}
              onChange={(value) => pick('from', value)}
            />
            <ArrowRight className="size-4 text-slate" aria-hidden="true" />
            <VersionSelect
              label="새 버전"
              value={to}
              options={readyNumbers}
              onChange={(value) => pick('to', value)}
            />
          </div>
        )}
      </div>
      {body}
    </div>
  );
}
