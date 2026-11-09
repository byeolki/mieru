import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { Spinner } from '../../design/ui/Spinner.js';
import { formatRelative } from '../../lib/format.js';
import { getActivity, issueKeys } from '../issues/api.js';
import { KindLabel, StateIcon } from '../issues/labels.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';

export function ActivityPage() {
  const activity = useQuery({
    queryKey: issueKeys.activity,
    queryFn: getActivity,
    refetchInterval: 30_000,
  });
  return (
    <AppShell>
      <PageHeader
        title="활동"
        description="내 저장소에 열린 이슈와, 내가 열거나 답글을 단 이슈가 여기에 모여요."
      />
      {activity.isPending ? (
        <Spinner className="size-6 text-lilac" />
      ) : activity.isError ? (
        <p className="text-sm text-danger">활동을 불러오지 못했어요.</p>
      ) : activity.data.items.length === 0 ? (
        <section className="rounded-xl border border-dashed border-fog px-8 py-14 text-center">
          <Bell className="mx-auto size-6 text-slate" aria-hidden="true" />
          <p className="mt-3 font-semibold">아직 새 소식이 없어요</p>
          <p className="mt-1 text-sm text-slate">
            누군가 내 모델에 이슈를 열면 여기에서 알려드려요.
          </p>
        </section>
      ) : (
        <ul className="divide-y divide-fog overflow-hidden rounded-(--radius-panel) border border-fog bg-surface">
          {activity.data.items.map(({ model, issue, unread }) => (
            <li key={`${model.id}-${issue.number}`}>
              <Link
                to={`/m/${model.id}/issues/${issue.number}`}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-haze/40"
              >
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: unread ? 'var(--color-primary)' : 'transparent' }}
                  aria-label={unread ? '안 읽음' : undefined}
                />
                <StateIcon state={issue.state} className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate">
                    {model.ownerUsername} / {model.name} · #{issue.number}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className={unread ? 'font-semibold' : ''}>{issue.title}</span>
                    <KindLabel kind={issue.kind} />
                  </p>
                </div>
                <span className="text-xs text-slate">{formatRelative(issue.lastActivityAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
