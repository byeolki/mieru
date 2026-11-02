import { useQuery } from '@tanstack/react-query';
import { Check, Copy, FileText, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { hasRoleAtLeast } from '@mieru/shared';
import { Markdown } from '../../design/Markdown.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { formatBytes, formatParams, formatShape } from '../../lib/format.js';
import { getGraph, getReadme, modelKeys } from '../models/api.js';
import { FORMAT_LABELS } from '../models/labels.js';
import { useRepo } from './RepoLayout.js';
import { VersionState } from './VersionState.js';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-xs">{children}</dd>
    </div>
  );
}

function CopyHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard.writeText(hash).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="inline-flex items-center gap-1 hover:text-primary"
      title={hash}
    >
      {hash.slice(0, 12)}
      {copied ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <Copy className="size-3" aria-hidden="true" />
      )}
      <span className="sr-only">SHA-256 복사</span>
    </button>
  );
}

function InfoPanel() {
  const { model } = useRepo();
  const version = model.currentVersion;
  const summary = version?.summary;
  const graph = useQuery({
    queryKey: modelKeys.graph(model.id, null),
    queryFn: () => getGraph(model.id, null),
    enabled: version !== null && model.format === 'onnx',
    staleTime: Number.POSITIVE_INFINITY,
  });
  const payload = graph.data?.payload.kind === 'onnx-graph' ? graph.data.payload : null;
  return (
    <aside className="h-fit rounded-(--radius-panel) border border-fog bg-surface shadow-(--shadow-soft)">
      <h2 className="border-b border-fog px-5 py-3.5 text-sm font-semibold">정보</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 px-5 py-4">
        <Row label="형식">{model.format ? FORMAT_LABELS[model.format] : '—'}</Row>
        {summary && (
          <Row label="파라미터">
            {summary.totalParams.toLocaleString('ko-KR')} ({formatParams(summary.totalParams)})
          </Row>
        )}
        <Row label="크기">{formatBytes(model.sizeBytes)}</Row>
        {summary?.nodeCount !== undefined && (
          <Row label="노드">{summary.nodeCount.toLocaleString('ko-KR')}</Row>
        )}
        {summary && <Row label="텐서">{summary.tensorCount.toLocaleString('ko-KR')}</Row>}
        {summary?.opsetVersion !== undefined && <Row label="opset">{summary.opsetVersion}</Row>}
        {summary?.producer && <Row label="만든 도구">{summary.producer}</Row>}
        {summary && <Row label="타입">{Object.keys(summary.dtypeBreakdown).join(', ')}</Row>}
        <Row label="라이선스">{model.license ?? '—'}</Row>
        {version?.sha256 && (
          <Row label="SHA-256">
            <CopyHash hash={version.sha256} />
          </Row>
        )}
      </dl>
      {payload && (
        <div className="border-t border-fog px-5 py-4">
          <h3 className="text-xs font-medium text-slate">입력</h3>
          <ul className="mt-2 grid gap-1">
            {payload.inputs.map((tensor) => (
              <li key={tensor.name} className="flex justify-between gap-3 font-mono text-xs">
                <span className="truncate">{tensor.name}</span>
                <span className="shrink-0 text-slate">{formatShape(tensor.shape)}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-xs font-medium text-slate">출력</h3>
          <ul className="mt-2 grid gap-1">
            {payload.outputs.map((tensor) => (
              <li key={tensor.name} className="flex justify-between gap-3 font-mono text-xs">
                <span className="truncate">{tensor.name}</span>
                <span className="shrink-0 text-slate">{formatShape(tensor.shape)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {version && (
        <div className="border-t border-fog p-4">
          <Link
            to={`/m/${model.id}/graph`}
            className="block rounded-(--radius-control) bg-haze px-4 py-3 text-center text-sm font-medium hover:bg-haze-deep"
          >
            {model.format === 'onnx' ? '그래프로 보기' : '모듈 트리 보기'}
          </Link>
        </div>
      )}
    </aside>
  );
}

function Readme() {
  const { model } = useRepo();
  const readme = useQuery({
    queryKey: modelKeys.readme(model.id),
    queryFn: () => getReadme(model.id),
  });
  if (readme.isPending) return <Spinner className="size-5 text-lilac" />;
  if (readme.isError) return <p className="text-sm text-danger">README를 불러오지 못했어요.</p>;
  const canEdit = hasRoleAtLeast(model.myAccess.role, 'editor');
  if (!readme.data.markdown.trim()) {
    return (
      <div className="rounded-(--radius-panel) border border-dashed border-lilac px-8 py-12 text-center">
        <FileText className="mx-auto size-6 text-slate" aria-hidden="true" />
        <p className="mt-3 font-semibold">아직 README가 없어요</p>
        <p className="mt-1 text-sm text-slate">
          {canEdit
            ? '어떤 모델인지, 어떻게 쓰는지 적어두면 다른 사람이 이해하기 쉬워요.'
            : '저장소 주인이 아직 소개를 쓰지 않았어요.'}
        </p>
        {canEdit && (
          <ButtonLink
            to={`/m/${model.id}/readme/edit`}
            className="mt-5"
            icon={<Pencil className="size-4" />}
          >
            README 쓰기
          </ButtonLink>
        )}
      </div>
    );
  }
  return (
    <div>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <ButtonLink
            to={`/m/${model.id}/readme/edit`}
            size="sm"
            variant="ghost"
            icon={<Pencil className="size-3.5" />}
          >
            README 편집
          </ButtonLink>
        </div>
      )}
      <Markdown source={readme.data.markdown} className="markdown-body" />
    </div>
  );
}

export function OverviewTab() {
  const { model } = useRepo();
  return (
    <div className="mx-auto grid max-w-[1120px] gap-8 px-5 py-8 md:px-10 lg:grid-cols-[minmax(0,720px)_300px] lg:justify-between">
      <div className="min-w-0">
        <VersionState model={model} />
        <Readme />
      </div>
      <InfoPanel />
    </div>
  );
}
