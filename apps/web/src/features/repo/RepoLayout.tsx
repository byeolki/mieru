import { useMutation, useQuery } from '@tanstack/react-query';
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
  Grid3x3,
  History,
  Globe,
  Link2,
  Lock,
  Network,
  Play,
  Share2,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useMatch, useOutletContext, useParams } from 'react-router';
import type { ModelDetail, StripSegment, Visibility } from '@mieru/shared';
import { AppFrame } from '../../components/AppFrame.js';
import { OrbitRing } from '../../components/OrbitRing.js';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Button } from '../../design/ui/Button.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { CopyStatus, useCopy } from '../../lib/use-copy.js';
import { ApiError } from '../../lib/api-error.js';
import { formatBytes, formatParams } from '../../lib/format.js';
import { rememberModel } from '../../lib/recent-models.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { downloadOriginal, getModel, modelKeys, type DownloadableFile } from '../models/api.js';
import { DownloadFilesDialog } from './DownloadFilesDialog.js';
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
    <li className="inline-flex items-baseline gap-1 rounded-full bg-haze px-3 py-1 text-xs text-slate">
      <span>{label}</span>
      <span className="tabular font-display text-[11.5px] font-medium text-sumi">{value}</span>
    </li>
  );
}

function FactChips({ model }: { model: ModelDetail }) {
  const summary = model.currentVersion?.summary;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="모델 정보">
      {model.format && (
        <li className="inline-flex items-center rounded-full bg-sumi px-3 py-1 font-display text-[11px] font-semibold tracking-wide text-paper uppercase">
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
    'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-heading text-[14.5px] whitespace-nowrap transition-colors',
    isActive ? 'bg-surface text-sumi ring-1 ring-edge' : 'text-slate hover:text-sumi',
  );

function RepoTabs({ model }: { model: ModelDetail }) {
  const isOnnx = model.format === 'onnx';
  const count = (value: number) => (
    <span className="tabular rounded-full bg-mieru-pink px-1.5 font-display text-[11px] text-on-accent">
      {value}
    </span>
  );
  return (
    <nav
      className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-haze p-1.5"
      aria-label="저장소 탭"
    >
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
      <NavLink to={`/m/${model.id}/weights`} className={TAB_CLASS}>
        <Grid3x3 className="size-4" aria-hidden="true" /> 가중치
      </NavLink>
      <NavLink to={`/m/${model.id}/stats`} className={TAB_CLASS}>
        <BarChart3 className="size-4" aria-hidden="true" /> 통계
      </NavLink>
      <NavLink to={`/m/${model.id}/versions`} className={TAB_CLASS}>
        <History className="size-4" aria-hidden="true" /> 버전
        {model.latestVersion && model.latestVersion.number > 1 && count(model.latestVersion.number)}
      </NavLink>
      <NavLink to={`/m/${model.id}/issues`} className={TAB_CLASS}>
        <CircleDot className="size-4" aria-hidden="true" /> 이슈
        {model.openIssueCount > 0 && count(model.openIssueCount)}
      </NavLink>
    </nav>
  );
}

function RepoActions({
  model,
  onShare,
  onReport,
}: {
  model: ModelDetail;
  onShare: () => void;
  onReport: () => void;
}) {
  const canReport = model.myAccess.role !== 'owner' && !model.takenDown;
  const [files, setFiles] = useState<DownloadableFile[]>([]);
  const download = useMutation({
    mutationFn: () => downloadOriginal(model.id),
    onSuccess: setFiles,
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {model.myAccess.canDownload && model.currentVersion && (
        <Button
          className="rounded-full"
          icon={<Download className="size-4" />}
          isLoading={download.isPending}
          onClick={() => download.mutate()}
        >
          다운로드
        </Button>
      )}
      {files.length > 0 && model.currentVersion && (
        <DownloadFilesDialog
          modelFileName={model.currentVersion.originalName}
          files={files}
          onClose={() => setFiles([])}
        />
      )}
      <StarButton model={model} />
      {model.myAccess.role === 'owner' && (
        <button
          type="button"
          onClick={onShare}
          className="flex h-10 items-center gap-2 rounded-full bg-haze px-4 text-sm font-semibold hover:bg-haze-deep"
        >
          <Share2 className="size-4" aria-hidden="true" /> 공유
        </button>
      )}
      {canReport && (
        <button
          type="button"
          aria-label="신고"
          title="신고"
          onClick={onReport}
          className="grid size-10 place-items-center rounded-full text-slate hover:bg-haze hover:text-sumi"
        >
          <Flag className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function OwnerLine({ model }: { model: ModelDetail }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
      <Avatar username={model.owner.username} displayName={model.owner.displayName} size={22} />
      <nav aria-label="경로">
        <Link to={`/u/${model.owner.username}`} className="font-medium hover:text-primary">
          {model.owner.username}
        </Link>
      </nav>
      <span className="flex items-center gap-1 text-xs">
        {VISIBILITY_ICON[model.visibility]}
        {VISIBILITY_LABELS[model.visibility]}
      </span>
      {model.visibility === 'public' && !model.publicAllowDownload && (
        <Badge tone="lilac">보기 전용</Badge>
      )}
    </div>
  );
}

function RepoHeader({ model, isHero }: { model: ModelDetail; isHero: boolean }) {
  const [isSharing, setIsSharing] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const fullName = `${model.owner.username}/${model.name}`;
  const summary = model.currentVersion?.summary;
  const dialogs = (
    <>
      {isSharing && <ShareDialog model={model} open={isSharing} onOpenChange={setIsSharing} />}
      {isReporting && (
        <ReportDialog modelId={model.id} open={isReporting} onOpenChange={setIsReporting} />
      )}
    </>
  );

  if (!isHero) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 pt-5 pb-3 md:px-8">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <nav aria-label="경로" className="shrink-0">
            <Link
              to={`/u/${model.owner.username}`}
              className="font-display text-lg text-slate hover:text-primary"
            >
              {model.owner.username}
            </Link>
          </nav>
          <span className="font-display text-lg text-mist" aria-hidden="true">
            /
          </span>
          <h1 className="truncate font-display text-lg font-semibold tracking-[-0.02em]">
            {model.name}
          </h1>
          <CopyNameButton name={fullName} />
        </div>
        <RepoTabs model={model} />
        <div className="ml-auto">
          <RepoActions
            model={model}
            onShare={() => setIsSharing(true)}
            onReport={() => setIsReporting(true)}
          />
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 md:px-10">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <OwnerLine model={model} />
          <div className="mt-3 flex items-start gap-2">
            <h1 className="min-w-0 font-display text-[clamp(2rem,4.2vw,2.9rem)] leading-[1.05] font-semibold tracking-[-0.035em] break-words">
              {model.name}
            </h1>
            <CopyNameButton name={fullName} />
          </div>
          {model.description && (
            <p className="mt-3.5 max-w-[46ch] text-base leading-7 text-slate">
              {model.description}
            </p>
          )}
          <div className="mt-5">
            <FactChips model={model} />
          </div>
          <div className="mt-6">
            <RepoActions
              model={model}
              onShare={() => setIsSharing(true)}
              onReport={() => setIsReporting(true)}
            />
          </div>
        </div>
        <div className="max-lg:hidden">
          <OrbitRing
            segments={model.strip}
            value={summary ? formatParams(summary.totalParams) : '—'}
            caption={summary ? '파라미터' : '분석 중'}
          />
        </div>
      </div>
      <div className="mt-6">
        <RepoTabs model={model} />
      </div>
      {dialogs}
    </div>
  );
}

function dominantFamily(strip: readonly StripSegment[]) {
  return (
    strip.reduce<StripSegment | null>(
      (best, segment) => (best === null || segment.weight > best.weight ? segment : best),
      null,
    )?.family ?? null
  );
}

export function RepoLayout() {
  const { modelId = '' } = useParams();
  // Only the graph needs a fixed-height canvas; other tabs scroll with the page so the
  // content never gets squeezed out at high zoom or in landscape on phones.
  const isGraph = useMatch('/m/:modelId/graph') !== null;
  const isOverview = useMatch({ path: '/m/:modelId', end: true }) !== null;
  const query = useQuery({
    queryKey: modelKeys.detail(modelId),
    queryFn: () => getModel(modelId),
    refetchInterval: (current) =>
      current.state.data?.latestVersion?.status === 'processing' ? 2000 : false,
  });
  const loaded = query.data;
  useEffect(() => {
    if (!loaded) return;
    rememberModel({
      id: loaded.id,
      name: loaded.name,
      ownerUsername: loaded.owner.username,
      family: dominantFamily(loaded.strip),
    });
  }, [loaded]);
  if (query.isPending) {
    return (
      <AppFrame>
        <Loading className="grid min-h-[60dvh] place-items-center text-lilac" />
      </AppFrame>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundPage />;
    return (
      <AppFrame>
        <div className="px-4 md:px-10">
          <ErrorState message="저장소를 불러오지 못했어요." onRetry={() => void query.refetch()} />
        </div>
      </AppFrame>
    );
  }
  const model = query.data;
  return (
    <AppFrame isWorkspace={isGraph} isFullHeight={isGraph}>
      <TakedownNotice model={model} />
      <RepoHeader model={model} isHero={isOverview} />
      <div className={isGraph ? 'min-h-0 flex-1' : 'pb-10'}>
        <Outlet context={{ model } satisfies RepoContext} />
      </div>
    </AppFrame>
  );
}
