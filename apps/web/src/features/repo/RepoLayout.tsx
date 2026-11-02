import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BarChart3,
  CircleDot,
  Download,
  FileText,
  GitFork,
  Globe,
  Link2,
  Lock,
  Network,
  Share2,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import type { ModelDetail, Visibility } from '@mieru/shared';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Button, ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { ApiError } from '../../lib/api-error.js';
import { useAuth } from '../../lib/auth-store.js';
import { formatBytes, formatParams, formatRelative } from '../../lib/format.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { downloadOriginal, getModel, modelKeys } from '../models/api.js';
import { FORMAT_LABELS, VISIBILITY_LABELS } from '../models/labels.js';
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

function TopBar({ model }: { model: ModelDetail }) {
  const { status, user } = useAuth();
  return (
    <header className="flex h-14 items-center gap-4 border-b border-fog bg-paper px-4 md:px-6">
      <Link
        to={status === 'signed-in' ? '/dashboard' : '/'}
        aria-label="mieru"
        className="shrink-0"
      >
        <img src="/brand/logo.png" alt="" className="h-9 w-auto" />
      </Link>
      <nav aria-label="경로" className="min-w-0 truncate text-sm">
        <Link to={`/u/${model.owner.username}`} className="text-slate hover:text-primary">
          {model.owner.username}
        </Link>
        <span className="mx-1.5 text-fog">/</span>
        <span className="font-semibold">{model.name}</span>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {user ? (
          <Link to="/settings" aria-label="설정">
            <Avatar username={user.username} displayName={user.displayName} size={30} />
          </Link>
        ) : (
          <ButtonLink
            to={`/login?next=${encodeURIComponent(`/m/${model.id}`)}`}
            size="sm"
            variant="secondary"
          >
            로그인
          </ButtonLink>
        )}
      </div>
    </header>
  );
}

function MetaRow({ model }: { model: ModelDetail }) {
  const summary = model.currentVersion?.summary;
  const parts = [
    model.format ? FORMAT_LABELS[model.format] : null,
    summary ? `${formatParams(summary.totalParams)} params` : null,
    model.sizeBytes !== null ? formatBytes(model.sizeBytes) : null,
    summary?.nodeCount !== undefined
      ? `노드 ${summary.nodeCount.toLocaleString('ko-KR')}`
      : summary
        ? `텐서 ${summary.tensorCount.toLocaleString('ko-KR')}`
        : null,
    summary?.opsetVersion !== undefined ? `opset ${summary.opsetVersion}` : null,
    `업데이트 ${formatRelative(model.updatedAt)}`,
  ].filter((part): part is string => part !== null);
  return (
    <p className="tabular flex flex-wrap items-center text-xs text-slate">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center">
          {index > 0 && <span className="mx-2 h-3 w-px bg-fog" aria-hidden="true" />}
          {part}
        </span>
      ))}
    </p>
  );
}

const TAB_CLASS = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-1.5 border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
    isActive ? 'border-primary text-sumi' : 'border-transparent text-slate hover:text-sumi',
  );

function RepoHeader({ model }: { model: ModelDetail }) {
  const isOnnx = model.format === 'onnx';
  const [isSharing, setIsSharing] = useState(false);
  return (
    <div className="border-b border-fog bg-paper px-4 pt-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{model.name}</h1>
            <Badge icon={VISIBILITY_ICON[model.visibility]}>
              {VISIBILITY_LABELS[model.visibility]}
            </Badge>
            {model.visibility === 'public' && !model.publicAllowDownload && (
              <Badge tone="lilac">보기 전용</Badge>
            )}
            {model.license && <Badge>{model.license}</Badge>}
          </div>
          {model.description && <p className="mt-1.5 text-sm text-slate">{model.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StarButton model={model} />
          {model.myAccess.role === 'owner' && (
            <Button icon={<Share2 className="size-4" />} onClick={() => setIsSharing(true)}>
              공유
            </Button>
          )}
          {model.myAccess.canDownload && model.currentVersion && (
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() => void downloadOriginal(model.id)}
            >
              다운로드
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <MetaRow model={model} />
        {model.strip.length > 0 && (
          <ArchitectureStrip
            segments={model.strip}
            label="아키텍처 스트립"
            height={6}
            className="mt-3"
          />
        )}
      </div>
      {isSharing && <ShareDialog model={model} open={isSharing} onOpenChange={setIsSharing} />}
      <nav className="mt-5 flex gap-6" aria-label="저장소 탭">
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
        <NavLink to={`/m/${model.id}/stats`} className={TAB_CLASS}>
          <BarChart3 className="size-4" aria-hidden="true" /> 통계
        </NavLink>
        <NavLink to={`/m/${model.id}/issues`} className={TAB_CLASS}>
          <CircleDot className="size-4" aria-hidden="true" /> 이슈
          {model.openIssueCount > 0 && (
            <span className="tabular rounded-full bg-fog px-1.5 text-xs text-slate">
              {model.openIssueCount}
            </span>
          )}
        </NavLink>
      </nav>
    </div>
  );
}

export function RepoLayout() {
  const { modelId = '' } = useParams();
  const query = useQuery({
    queryKey: modelKeys.detail(modelId),
    queryFn: () => getModel(modelId),
    refetchInterval: (current) =>
      current.state.data?.latestVersion?.status === 'processing' ? 2000 : false,
  });
  if (query.isPending) {
    return (
      <div
        className="grid min-h-dvh place-items-center text-lilac"
        role="status"
        aria-label="불러오는 중"
      >
        <Spinner className="size-6" />
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundPage />;
    return (
      <p className="p-10 text-sm text-danger">저장소를 불러오지 못했어요. 새로고침해주세요.</p>
    );
  }
  const model = query.data;
  return (
    <div className="flex h-dvh flex-col">
      <TopBar model={model} />
      <RepoHeader model={model} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Outlet context={{ model } satisfies RepoContext} />
      </div>
    </div>
  );
}
