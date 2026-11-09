import { useQuery } from '@tanstack/react-query';
import { Globe, Lock, Plus, Shapes } from 'lucide-react';
import { Link } from 'react-router';
import { ButtonLink } from '../../design/ui/Button.js';
import { EmptyState } from '../../design/ui/EmptyState.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { formatRelative } from '../../lib/format.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';
import { designKeys, listDesigns } from './api.js';

export function DesignsPage() {
  const designs = useQuery({ queryKey: designKeys.list, queryFn: listDesigns });
  return (
    <AppShell>
      <PageHeader
        title="설계"
        description="블록을 이어 붙여 모델을 설계하고, 모양을 바로 확인하고, PyTorch 코드로 내보내요."
        actions={
          <ButtonLink to="/designs/new" icon={<Plus className="size-4" />}>
            새 설계
          </ButtonLink>
        }
      />
      {designs.isPending ? (
        <Loading />
      ) : designs.isError ? (
        <ErrorState
          message="설계 목록을 불러오지 못했어요."
          onRetry={() => void designs.refetch()}
        />
      ) : designs.data.items.length === 0 ? (
        <EmptyState
          icon={<Shapes aria-hidden="true" />}
          title="아직 저장한 설계가 없어요"
          body="템플릿에서 시작하면 바로 손댈 수 있어요."
          action={<ButtonLink to="/designs/new">새 설계 시작</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-2.5">
          {designs.data.items.map((design) => (
            <li key={design.id}>
              <Link
                to={`/designs/${design.id}`}
                className="flex items-center gap-3 rounded-xl border border-fog bg-surface px-4 py-3.5 hover:border-lilac/70"
              >
                <Shapes className="size-4 text-slate" aria-hidden="true" />
                <span className="font-medium">{design.name}</span>
                <span className="flex items-center gap-1 text-xs text-slate">
                  {design.visibility === 'public' ? (
                    <Globe className="size-3" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  {design.visibility === 'public' ? '공개' : '비공개'}
                </span>
                <span className="tabular ml-auto text-xs text-slate">
                  레이어 {design.layerCount} · {formatRelative(design.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
