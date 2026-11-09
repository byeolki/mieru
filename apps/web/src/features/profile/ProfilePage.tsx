import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { Boxes, CalendarDays } from 'lucide-react';
import { useParams } from 'react-router';
import { Avatar } from '../../components/Avatar.js';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { EmptyState } from '../../design/ui/EmptyState.js';
import { ErrorState } from '../../design/ui/ErrorState.js';
import { Loading } from '../../design/ui/Loading.js';
import { UNDERLINE_TAB } from '../../design/ui/tabs.js';
import { ApiError } from '../../lib/api-error.js';
import { useAuth } from '../../lib/auth-store.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { ModelRows } from '../models/ModelRows.js';
import { AppShell } from '../shell/AppShell.js';
import { exploreKeys, getProfile, getProfileModels, getProfileStars } from '../explore/api.js';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });

function List({ username, kind }: { username: string; kind: 'models' | 'stars' }) {
  const query = useQuery({
    queryKey:
      kind === 'models' ? exploreKeys.profileModels(username) : exploreKeys.profileStars(username),
    queryFn: () => (kind === 'models' ? getProfileModels(username) : getProfileStars(username)),
  });
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return <ErrorState message="목록을 불러오지 못했어요." onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        title={kind === 'models' ? '공개한 모델이 없어요' : '스타한 공개 모델이 없어요'}
      />
    );
  }
  return <ModelRows items={query.data.items} showOwner={kind === 'stars'} />;
}

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: exploreKeys.profile(username),
    queryFn: () => getProfile(username),
  });
  if (profile.isPending) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 404) return <NotFoundPage />;
    return (
      <AppShell>
        <ErrorState message="프로필을 불러오지 못했어요." onRetry={() => void profile.refetch()} />
      </AppShell>
    );
  }
  const data = profile.data;
  const isMe = user?.username === data.username;
  return (
    <AppShell>
      <div className="grid gap-10 md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="md:pt-1">
          <Avatar
            username={data.username}
            displayName={data.displayName}
            size={176}
            className="ring-1 ring-fog"
          />
          <h1 className="mt-5 font-heading text-xl">{data.displayName}</h1>
          <p className="text-lg text-slate">@{data.username}</p>
          {data.bio && <p className="mt-4 leading-7">{data.bio}</p>}
          {isMe && (
            <ButtonLink to="/settings" variant="secondary" size="sm" className="mt-5 w-full">
              프로필 편집
            </ButtonLink>
          )}
          <ul className="tabular mt-6 grid gap-2.5 border-t border-fog pt-5 text-sm">
            <li className="flex items-center gap-2">
              <Boxes className="size-4 text-slate" aria-hidden="true" />
              <span className="font-semibold">{data.publicModelCount}</span>
              <span className="text-slate">공개 모델</span>
            </li>
            <li className="flex items-center gap-2">
              <Sparkle className="size-4" color="var(--color-mieru-pink)" />
              <span className="font-semibold">{data.starsReceived}</span>
              <span className="text-slate">받은 스타</span>
            </li>
            <li className="flex items-center gap-2 text-slate">
              <CalendarDays className="size-4" aria-hidden="true" />
              <span>{dateFormat.format(new Date(data.createdAt))} 가입</span>
            </li>
          </ul>
        </aside>
        <Tabs.Root defaultValue="models" className="min-w-0">
          <Tabs.List className="mb-6 flex gap-1 border-b border-fog" aria-label="프로필 목록">
            <Tabs.Trigger value="models" className={UNDERLINE_TAB}>
              공개 모델
            </Tabs.Trigger>
            <Tabs.Trigger value="stars" className={UNDERLINE_TAB}>
              스타
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="models">
            <List username={data.username} kind="models" />
          </Tabs.Content>
          <Tabs.Content value="stars">
            <List username={data.username} kind="stars" />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </AppShell>
  );
}
