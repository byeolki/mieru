import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { Boxes, CalendarDays } from 'lucide-react';
import { useParams } from 'react-router';
import { Avatar } from '../../components/Avatar.js';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { ApiError } from '../../lib/api-error.js';
import { useAuth } from '../../lib/auth-store.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { ModelRows } from '../models/ModelRows.js';
import { AppShell } from '../shell/AppShell.js';
import { exploreKeys, getProfile, getProfileModels, getProfileStars } from '../explore/api.js';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });
const TAB =
  'relative px-1 pb-3 text-sm font-medium text-slate data-[state=active]:text-sumi data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary';

function List({ username, kind }: { username: string; kind: 'models' | 'stars' }) {
  const query = useQuery({
    queryKey:
      kind === 'models' ? exploreKeys.profileModels(username) : exploreKeys.profileStars(username),
    queryFn: () => (kind === 'models' ? getProfileModels(username) : getProfileStars(username)),
  });
  if (query.isPending) return <Spinner className="size-5 text-lilac" />;
  if (query.isError) return <p className="text-sm text-danger">목록을 불러오지 못했어요.</p>;
  if (query.data.items.length === 0) {
    return (
      <p className="rounded-(--radius-panel) border border-dashed border-lilac px-6 py-10 text-center text-sm text-slate">
        {kind === 'models' ? '공개한 모델이 없어요.' : '스타한 공개 모델이 없어요.'}
      </p>
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
  if (profile.isPending)
    return (
      <AppShell>
        <Spinner className="size-6 text-lilac" />
      </AppShell>
    );
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 404) return <NotFoundPage />;
    return (
      <AppShell>
        <p className="text-sm text-danger">프로필을 불러오지 못했어요.</p>
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
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.02em]">{data.displayName}</h1>
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
              <Sparkle className="size-4" color="#DE7EA8" />
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
          <Tabs.List className="mb-6 flex gap-6 border-b border-fog" aria-label="프로필 목록">
            <Tabs.Trigger value="models" className={TAB}>
              공개 모델
            </Tabs.Trigger>
            <Tabs.Trigger value="stars" className={TAB}>
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
