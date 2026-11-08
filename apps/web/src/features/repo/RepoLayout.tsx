import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BarChart3,
  Check,
  CircleDot,
  Copy,
  Download,
  Flag,
  FileText,
  GitFork,
  Globe,
  Link2,
  Lock,
  Network,
  Play,
  Share2,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useMatch, useOutletContext, useParams } from 'react-router';
import type { ModelDetail, Visibility } from '@mieru/shared';
import { AppHeader } from '../../components/AppHeader.js';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Button } from '../../design/ui/Button.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { CopyStatus, useCopy } from '../../lib/use-copy.js';
import { ApiError } from '../../lib/api-error.js';
import { formatBytes, formatParams } from '../../lib/format.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { downloadOriginal, getModel, modelKeys } from '../models/api.js';
import { FORMAT_LABELS, VISIBILITY_LABELS } from '../models/labels.js';
import { ReportDialog } from '../moderation/ReportDialog.js';
import { TakedownNotice } from '../moderation/TakedownNotice.js';
import { ShareDialog } from '../sharing/ShareDialog.js';
import { StarButton } from './StarButton.js';

export interface RepoContext {
  model: ModelDetail;
}

export function useRepo(): RepoContext {
  return useOutletContext<RepoContext>();
}

const VISIBILITY_ICON: Record<Visibility, ReactNode> = {
  private: <Lock className="size-3" aria-hidden="true" />,
  users: <Users className="size-3" aria-hidden="true" />,
  link: <Link2 className="size-3" aria-hidden="true" />,
  public: <Globe className="size-3" aria-hidden="true" />,
};

function CopyNameButton({ name }: { name: string }) {
  const { state, copy } = useCopy();
  return (
    <>
      <button
        type="button"
        aria-label="이름 복사"
        title="이름 복사"
        onClick={() => copy(name)}
        className="grid size-7 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
      >
        {state === 'copied' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <CopyStatus state={state} />
    </>
  );
}

function FactChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="inline-flex items-stretch overflow-hidden rounded-md border border-fog text-xs">
      <span className="bg-paper px-2 py-1 text-slate">{label}</span>
      <span className="tabular border-l border-fog px-2 py-1 font-medium">{value}</span>
    </li>
  );
}

function FactChips({ model }: { model: ModelDetail }) {
  const summary = model.currentVersion?.summary;
  return (
    <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="모델 정보">
      {model.format && (
        <li className="inline-flex items-center rounded-md bg-haze-deep px-2 py-1 text-xs font-semibold">
          {FORMAT_LABELS[model.format]}
        </li>
      )}
      {summary && <FactChip label="파라미터" value={formatParams(summary.totalParams)} />}
      {model.sizeBytes !== null && <FactChip label="크기" value={formatBytes(model.sizeBytes)} />}
      {summary?.nodeCount !== undefined ? (
        <FactChip label="노드" value={summary.nodeCount.toLocaleString('ko-KR')} />
      ) : (
        summary && <FactChip label="텐서" value={summary.tensorCount.toLocaleString('ko-KR')} />
      )}
      {summary?.opsetVersion !== undefined && (
        <FactChip label="opset" value={summary.opsetVersion} />
      )}
      {summary && Object.keys(summary.dtypeBreakdown).length > 0 && (
        <FactChip label="타입" value={Object.keys(summary.dtypeBreakdown).join(' · ')} />
      )}
      {model.license && <FactChip label="라이선스" value={model.license} />}
    </ul>
  );
}

const TAB_CLASS = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-2 border-b-2 px-3 pt-1 pb-3 text-sm transition-colors',
    isActive
      ? 'border-primary font-semibold text-sumi'
      : 'border-transparent text-slate hover:border-fog hover:text-sumi',
  );

function RepoHeader({ model }: { model: ModelDetail }) {
  const isOnnx = model.format === 'onnx';
  const [isSharing, setIsSharing] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const canReport = model.myAccess.role !== 'owner' && !model.takenDown;
  return (
    <div className="border-b border-fog bg-surface">
      <div className="mx-auto max-w-[1280px] px-4 pt-7 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl">
              <Avatar
                username={model.owner.username}
                displayName={model.owner.displayName}
                size={24}
              />
              <nav aria-label="경로">
                <Link
                  to={`/u/${model.owner.username}`}
                  className="text-slate hover:text-primary hover:underline"
                >
                  {model.owner.username}
                </Link>
              </nav>
              <span className="text-fog" aria-hidden="true">
                /
              </span>
              <h1 className="font-bold tracking-[-0.015em]">{model.name}</h1>
              <CopyNameButton name={`${model.owner.username}/${model.name}`} />
              <Badge icon={VISIBILITY_ICON[model.visibility]}>
                {VISIBILITY_LABELS[model.visibility]}
              </Badge>
              {model.visibility === 'public' && !model.publicAllowDownload && (
                <Badge tone="lilac">보기 전용</Badge>
              )}
            </div>
            {model.description && (
              <p className="mt-2 max-w-3xl leading-7 text-slate">{model.description}</p>
            )}
            <FactChips model={model} />
          </div>
          <div className="flex items-center gap-2">
            {canReport && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Flag className="size-4" />}
                aria-label="신고"
                onClick={() => setIsReporting(true)}
              />
            )}
            <StarButton model={model} />
            {model.myAccess.role === 'owner' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Share2 className="size-4" />}
                onClick={() => setIsSharing(true)}
              >
                공유
              </Button>
            )}
            {model.myAccess.canDownload && model.currentVersion && (
              <Button
                size="sm"
                icon={<Download className="size-4" />}
                onClick={() => void downloadOriginal(model.id)}
              >
                다운로드
              </Button>
            )}
          </div>
        </div>
        <nav className="mt-6 -mb-px flex gap-1 overflow-x-auto" aria-label="저장소 탭">
          <NavLink to={`/m/${model.id}`} end className={TAB_CLASS}>
            <FileText className="size-4" aria-hidden="true" /> 개요
          </NavLink>
          <NavLink to={`/m/${model.id}/graph`} className={TAB_CLASS}>
            {isOnnx ? (
              <Network className="size-4" aria-hidden="true" />
            ) : (
              <GitFork className="size-4 rotate-90" aria-hidden="true" />
            )}
            {isOnnx ? '그래프' : '모듈 트리'}
          </NavLink>
          {isOnnx && (
            <NavLink to={`/m/${model.id}/demo`} className={TAB_CLASS}>
              <Play className="size-4" aria-hidden="true" /> 실행
            </NavLink>
          )}
          <NavLink to={`/m/${model.id}/stats`} className={TAB_CLASS}>
            <BarChart3 className="size-4" aria-hidden="true" /> 통계
          </NavLink>
          <NavLink to={`/m/${model.id}/issues`} className={TAB_CLASS}>
            <CircleDot className="size-4" aria-hidden="true" /> 이슈
            {model.openIssueCount > 0 && (
              <span className="tabular rounded-full bg-fog px-1.5 text-xs font-medium text-sumi">
                {model.openIssueCount}
              </span>
            )}
          </NavLink>
        </nav>
      </div>
      {model.strip.length > 0 && (
        <ArchitectureStrip
          segments={model.strip}
          label="아키텍처 스트립"
          height={3}
          className="rounded-none"
        />
      )}
      {isSharing && <ShareDialog model={model} open={isSharing} onOpenChange={setIsSharing} />}
      {isReporting && (
        <ReportDialog modelId={model.id} open={isReporting} onOpenChange={setIsReporting} />
      )}
    </div>
  );
}

export function RepoLayout() {
  const { modelId = '' } = useParams();
  // Only the graph needs a fixed-height canvas; other tabs scroll with the page so the
  // content never gets squeezed out at high zoom or in landscape on phones.
  const isGraph = useMatch('/m/:modelId/graph') !== null;
  const query = useQuery({
    queryKey: modelKeys.detail(modelId),
    queryFn: () => getModel(modelId),
    refetchInterval: (current) =>
      current.state.data?.latestVersion?.status === 'processing' ? 2000 : false,
  });
  if (query.isPending) {
    return <Loading className="grid min-h-dvh place-items-center text-lilac" />;
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundPage />;
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <div className="mx-auto max-w-[1280px] px-4 md:px-6">
          <ErrorState message="저장소를 불러오지 못했어요." onRetry={() => void query.refetch()} />
        </div>
      </div>
    );
  }
  const model = query.data;
  return (
    <div className={isGraph ? 'flex h-dvh min-h-[40rem] flex-col' : 'flex min-h-dvh flex-col'}>
      <AppHeader />
      <TakedownNotice model={model} />
      <RepoHeader model={model} />
      <div className={isGraph ? 'min-h-0 flex-1' : 'flex-1'}>
        <Outlet context={{ model } satisfies RepoContext} />
      </div>
    </div>
  );
}
