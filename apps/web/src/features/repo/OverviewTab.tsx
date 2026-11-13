import { useQuery } from '@tanstack/react-query';
import { BookOpen, Check, Copy, FileText, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  hasRoleAtLeast,
  type ParsedModel,
  type StripSegment,
  type TensorInfo,
} from '@mieru/shared';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { ShowMoreList } from '../../components/ShowMoreList.js';
import { OP_COLORS, OP_FAMILY_LABELS, type OpFamily } from '../../design/op-palette.js';
import { Markdown } from '../../design/Markdown.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { CopyStatus, useCopy } from '../../lib/use-copy.js';
import { formatBytes, formatParams, formatRelative, formatShape } from '../../lib/format.js';
import { getGraph, getReadme, modelKeys } from '../models/api.js';
import { useRepo } from './RepoLayout.js';
import { structureBlocks } from './structure.js';
import { VersionState } from './VersionState.js';
import { modelPath } from '../../lib/model-path.js';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 text-sm text-slate">{label}</dt>
      <dd
        className="tabular min-w-0 truncate text-right text-sm"
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </dd>
    </div>
  );
}

function CopyHash({ hash }: { hash: string }) {
  const { state, copy } = useCopy();
  return (
    <>
      <button
        type="button"
        onClick={() => copy(hash)}
        className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary"
        title={hash}
      >
        {hash.slice(0, 12)}
        {state === 'copied' ? (
          <Check className="size-3" aria-hidden="true" />
        ) : (
          <Copy className="size-3" aria-hidden="true" />
        )}
        <span className="sr-only">SHA-256 복사</span>
      </button>
      <CopyStatus state={state} />
    </>
  );
}

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-fog py-5 first:pt-0 last:border-b-0">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// Precision gets its own tints, separate from the op palette, so the two charts never read as one.
const DTYPE_COLORS = ['#BC3D86', '#DE7EA8', '#C8B6D4', '#8E8AA8', '#E7E0F3'];

/** Share of parameters per dtype as one stacked bar, so mixed-precision files stand out. */
function PrecisionBar({
  breakdown,
}: {
  breakdown: Record<string, { params: number; bytes: number }>;
}) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1].params - a[1].params);
  const total = entries.reduce((sum, [, entry]) => sum + entry.params, 0) || 1;
  return (
    <div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-fog"
        role="img"
        aria-label="타입별 파라미터 비율"
      >
        {entries.map(([dtype, entry], index) => (
          <span
            key={dtype}
            style={{
              width: `${String((entry.params / total) * 100)}%`,
              backgroundColor: DTYPE_COLORS[index % DTYPE_COLORS.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {entries.map(([dtype, entry], index) => (
          <li key={dtype} className="tabular flex items-center gap-2">
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: DTYPE_COLORS[index % DTYPE_COLORS.length] }}
              aria-hidden="true"
            />
            <span className="font-mono text-xs">{dtype}</span>
            <span className="ml-auto text-slate">{formatBytes(entry.bytes)}</span>
            <span className="w-12 text-right">{Math.round((entry.params / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Op-family mix read from the strip; approximate because long graphs are bucketed. */
function FamilyMix({ strip }: { strip: readonly StripSegment[] }) {
  const totals = new Map<OpFamily, number>();
  for (const segment of strip)
    totals.set(segment.family, (totals.get(segment.family) ?? 0) + segment.weight);
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <ArchitectureStrip segments={strip} label="아키텍처 스트립" height={8} />
      <ul className="mt-3 grid gap-1.5 text-sm">
        {entries.map(([family, weight]) => (
          <li key={family} className="tabular flex items-center gap-2">
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: OP_COLORS[family] }}
              aria-hidden="true"
            />
            {OP_FAMILY_LABELS[family]}
            <span className="ml-auto text-slate">{Math.round((weight / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoPanel() {
  const { model } = useRepo();
  const version = model.currentVersion;
  const summary = version?.summary;
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <SideSection title="정보">
        <dl>
          {summary && <Row label="파라미터">{summary.totalParams.toLocaleString('ko-KR')}</Row>}
          {summary && <Row label="텐서">{summary.tensorCount.toLocaleString('ko-KR')}</Row>}
          {summary?.producer && <Row label="만든 도구">{summary.producer}</Row>}
          <Row label="업데이트">{formatRelative(model.updatedAt)}</Row>
          {version?.sha256 && (
            <Row label="SHA-256">
              <CopyHash hash={version.sha256} />
            </Row>
          )}
        </dl>
      </SideSection>
      {summary && Object.keys(summary.dtypeBreakdown).length > 0 && (
        <SideSection title="정밀도">
          <PrecisionBar breakdown={summary.dtypeBreakdown} />
        </SideSection>
      )}
      {model.strip.length > 0 && (
        <SideSection title="연산 구성">
          <FamilyMix strip={model.strip} />
        </SideSection>
      )}
      {version && (
        <div className="pt-5">
          <ButtonLink to={`${modelPath(model)}/graph`} variant="secondary" className="w-full">
            {model.format === 'onnx' ? '그래프 열기' : '모듈 트리 열기'}
          </ButtonLink>
        </div>
      )}
    </aside>
  );
}

function ReadmeBox({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-(--radius-panel) border border-fog bg-surface">
      <div className="flex h-11 items-center gap-2 border-b border-fog px-4 text-sm">
        <BookOpen className="size-4 text-slate" aria-hidden="true" />
        <span className="font-medium">README</span>
        <div className="ml-auto">{actions}</div>
      </div>
      {children}
    </section>
  );
}

function Readme() {
  const { model } = useRepo();
  const readme = useQuery({
    queryKey: modelKeys.readme(model.id),
    queryFn: () => getReadme(model.id),
  });
  if (readme.isPending) return <Loading />;
  if (readme.isError) {
    return (
      <ErrorState message="README를 불러오지 못했어요." onRetry={() => void readme.refetch()} />
    );
  }
  const canEdit = hasRoleAtLeast(model.myAccess.role, 'editor');
  const editPath = `${modelPath(model)}/readme/edit`;
  if (!readme.data.markdown.trim()) {
    return (
      <ReadmeBox>
        <div className="px-8 py-16 text-center">
          <FileText className="mx-auto size-6 text-slate" aria-hidden="true" />
          <p className="mt-3 font-semibold">아직 README가 없어요</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate">
            {canEdit
              ? '어떤 모델인지, 어떻게 쓰는지 적어두면 다른 사람이 이해하기 쉬워요.'
              : '저장소 주인이 아직 소개를 쓰지 않았어요.'}
          </p>
          {canEdit && (
            <ButtonLink to={editPath} className="mt-5" icon={<Pencil className="size-4" />}>
              README 쓰기
            </ButtonLink>
          )}
        </div>
      </ReadmeBox>
    );
  }
  return (
    <ReadmeBox
      actions={
        canEdit && (
          <Link
            to={editPath}
            aria-label="README 편집"
            className="grid size-8 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Link>
        )
      }
    >
      <Markdown source={readme.data.markdown} className="markdown-body px-6 py-6 md:px-8" />
    </ReadmeBox>
  );
}

function MainSection({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-heading text-lg">{title}</h2>
      <p className="mt-1 text-sm text-slate">{lead}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Top-level blocks with their share of the parameters, so the model's shape reads at a glance. */
function StructureSection({ parsed }: { parsed: ParsedModel }) {
  const blocks = structureBlocks(parsed);
  if (blocks.length < 2) return null;
  const largest = Math.max(...blocks.map((block) => block.paramCount), 1);
  return (
    <MainSection title="구조 한눈에" lead="모델을 이루는 큰 블록과 각 블록의 파라미터 수예요.">
      <ShowMoreList
        className="grid gap-1"
        items={blocks.map((block) => (
          <li
            key={block.key}
            className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_4.5rem] items-center gap-4 rounded-(--radius-control) px-3 py-2 odd:bg-haze/60"
          >
            <span className="min-w-0">
              <span className="block truncate font-mono text-sm" title={block.label}>
                {block.label}
              </span>
              <span className="text-xs text-slate">
                {block.countUnit} {block.count.toLocaleString('ko-KR')}
              </span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-fog" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-lilac"
                style={{ width: `${String(Math.max((block.paramCount / largest) * 100, 1))}%` }}
              />
            </span>
            <span className="tabular text-right text-sm">{formatParams(block.paramCount)}</span>
          </li>
        ))}
      />
    </MainSection>
  );
}

function TensorTable({ title, tensors }: { title: string; tensors: readonly TensorInfo[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ShowMoreList
        className="grid gap-1"
        items={tensors.map((tensor) => (
          <li
            key={tensor.name}
            className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1.2fr)] items-baseline gap-4 rounded-(--radius-control) px-3 py-2 font-mono text-xs leading-5 odd:bg-haze/60"
          >
            <span className="min-w-0 break-all">{tensor.name}</span>
            <span className="text-slate">{tensor.dtype ?? '?'}</span>
            <span className="min-w-0 break-all text-slate">{formatShape(tensor.shape)}</span>
          </li>
        ))}
      />
    </div>
  );
}

function IoSection({ parsed }: { parsed: ParsedModel }) {
  if (parsed.payload.kind !== 'onnx-graph') return null;
  return (
    <MainSection title="입력과 출력" lead="모델을 실행할 때 넣고 받는 텐서예요.">
      <div className="grid gap-6">
        <TensorTable title="입력" tensors={parsed.payload.inputs} />
        <TensorTable title="출력" tensors={parsed.payload.outputs} />
      </div>
    </MainSection>
  );
}

export function OverviewTab() {
  const { model } = useRepo();
  const version = model.currentVersion;
  const graph = useQuery({
    queryKey: modelKeys.graph(model.id, null),
    queryFn: () => getGraph(model.id, null),
    enabled: version !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return (
    <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-8 md:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <VersionState model={model} />
        <Readme />
        {graph.data && <StructureSection parsed={graph.data} />}
        {graph.data && <IoSection parsed={graph.data} />}
      </div>
      <InfoPanel />
    </div>
  );
}
