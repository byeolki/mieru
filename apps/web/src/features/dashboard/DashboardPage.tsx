import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Search, Upload, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Avatar } from '../../components/Avatar.js';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { useAuth } from '../../lib/auth-store.js';
import { formatRelative } from '../../lib/format.js';
import { exploreKeys, getExplore } from '../explore/api.js';
import { getActivity, issueKeys } from '../issues/api.js';
import { StateIcon } from '../issues/labels.js';
import { listModels, modelKeys } from '../models/api.js';
import { ModelRows } from '../models/ModelRows.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';

function EmptyOwned() {
  const { t } = useTranslation();
  return (
    <section className="haze-tone relative overflow-hidden rounded-(--radius-sheet) px-8 py-16 text-center">
      <Sparkle className="absolute top-8 left-[18%] size-5" color="#DE7EA8" />
      <Sparkle className="absolute right-[20%] bottom-10 size-4" color="#C8B6D4" />
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border-[3px] border-white dark:border-haze-deep bg-surface shadow-(--shadow-soft)">
        <Upload className="size-6 text-primary" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-lg font-bold">{t('dashboard.emptyTitle')}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate">
        {t('dashboard.emptyBody')}
      </p>
      <ButtonLink to="/new" className="mt-6">
        {t('dashboard.emptyAction')}
      </ButtonLink>
      <p className="mt-4 text-xs text-slate">.onnx 최대 2GB · .safetensors 최대 10GB</p>
    </section>
  );
}

function EmptyShared() {
  return (
    <section className="rounded-(--radius-panel) border border-dashed border-lilac px-8 py-14 text-center">
      <Users className="mx-auto size-6 text-slate" aria-hidden="true" />
      <h2 className="mt-4 font-semibold">아직 공유받은 모델이 없어요</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate">
        누군가 사용자 이름으로 공유하거나, 공유 링크를 로그인한 채로 열면 여기에 모여요.
      </p>
    </section>
  );
}

function ModelList({ scope, filter }: { scope: 'owned' | 'shared'; filter: string }) {
  const query = useQuery({
    queryKey: modelKeys.list(scope),
    queryFn: () => listModels(scope),
    refetchInterval: (current) =>
      current.state.data?.items.some((item) => item.status === 'processing') ? 2000 : false,
  });
  if (query.isPending) {
    return (
      <div
        className="grid place-items-center py-20 text-lilac"
        role="status"
        aria-label="불러오는 중"
      >
        <Spinner className="size-6" />
      </div>
    );
  }
  if (query.isError)
    return <p className="text-sm text-danger">목록을 불러오지 못했어요. 새로고침해주세요.</p>;
  if (query.data.items.length === 0) return scope === 'owned' ? <EmptyOwned /> : <EmptyShared />;
  const needle = filter.trim().toLowerCase();
  const items = needle
    ? query.data.items.filter((item) => item.name.toLowerCase().includes(needle))
    : query.data.items;
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-slate">‘{filter}’와 맞는 모델이 없어요.</p>;
  }
  return <ModelRows items={items} showOwner={scope === 'shared'} />;
}

const TAB_TRIGGER =
  'relative px-1 pb-3 text-sm text-slate hover:text-sumi data-[state=active]:font-semibold data-[state=active]:text-sumi data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary';

function RailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-fog pb-6 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function RecentActivity() {
  const activity = useQuery({ queryKey: issueKeys.activity, queryFn: getActivity });
  if (activity.isPending) return <Spinner className="size-4 text-lilac" />;
  if (activity.isError) return <p className="text-sm text-danger">활동을 불러오지 못했어요.</p>;
  if (activity.data.items.length === 0) {
    return (
      <p className="text-sm leading-6 text-slate">누군가 내 모델에 이슈를 열면 여기에 보여요.</p>
    );
  }
  return (
    <ul className="grid gap-3">
      {activity.data.items.slice(0, 5).map(({ model, issue, unread }) => (
        <li key={`${model.id}-${String(issue.number)}`}>
          <Link to={`/m/${model.id}/issues/${String(issue.number)}`} className="group flex gap-2.5">
            <StateIcon state={issue.state} className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              <span
                className={clsx(
                  'block truncate text-sm group-hover:text-primary',
                  unread && 'font-semibold',
                )}
              >
                {issue.title}
              </span>
              <span className="block truncate text-xs text-slate">
                {model.name} #{issue.number} · {formatRelative(issue.lastActivityAt)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TrendingPicks() {
  const explore = useQuery({ queryKey: exploreKeys.sections, queryFn: getExplore });
  if (explore.isPending) return <Spinner className="size-4 text-lilac" />;
  if (explore.isError) return null;
  const picks = explore.data.trending.slice(0, 4);
  if (picks.length === 0) return <p className="text-sm text-slate">아직 공개된 모델이 없어요.</p>;
  return (
    <ul className="grid gap-3.5">
      {picks.map((item) => (
        <li key={item.id}>
          <Link to={`/m/${item.id}`} className="group block">
            <span className="flex items-center gap-2">
              <Avatar
                username={item.owner.username}
                displayName={item.owner.displayName}
                size={18}
              />
              <span className="truncate font-mono text-sm">
                <span className="text-slate">{item.owner.username}/</span>
                <span className="font-medium group-hover:text-primary">{item.name}</span>
              </span>
            </span>
            <ArchitectureStrip
              segments={item.strip}
              label={`${item.name} 아키텍처`}
              height={3}
              className="mt-2"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [filter, setFilter] = useState('');
  return (
    <AppShell>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <PageHeader
            title={t('dashboard.title')}
            description={
              user ? `${user.displayName}님이 올린 모델과 공유받은 모델이에요.` : undefined
            }
          />
          <Tabs.Root defaultValue="owned">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-fog">
              <Tabs.List className="flex gap-6" aria-label="모델 목록">
                <Tabs.Trigger value="owned" className={TAB_TRIGGER}>
                  올린 모델
                </Tabs.Trigger>
                <Tabs.Trigger value="shared" className={TAB_TRIGGER}>
                  공유받은 모델
                </Tabs.Trigger>
              </Tabs.List>
              <label className="relative mb-2.5 block w-full max-w-60">
                <span className="sr-only">이름으로 거르기</span>
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate"
                  aria-hidden="true"
                />
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="이름으로 거르기"
                  className="h-8 w-full rounded-md border border-fog bg-surface pr-3 pl-8 text-sm placeholder:text-slate/80 focus:border-primary focus:outline-none"
                />
              </label>
            </div>
            <Tabs.Content value="owned">
              <ModelList scope="owned" filter={filter} />
            </Tabs.Content>
            <Tabs.Content value="shared">
              <ModelList scope="shared" filter={filter} />
            </Tabs.Content>
          </Tabs.Root>
        </div>
        <aside className="grid content-start gap-6 lg:pt-2">
          <RailSection
            title="최근 활동"
            action={
              <Link to="/activity" className="text-xs text-slate hover:text-primary">
                모두 보기
              </Link>
            }
          >
            <RecentActivity />
          </RailSection>
          <RailSection
            title="요즘 화제"
            action={
              <Link to="/explore" className="text-xs text-slate hover:text-primary">
                둘러보기
              </Link>
            }
          >
            <TrendingPicks />
          </RailSection>
        </aside>
      </div>
    </AppShell>
  );
}
