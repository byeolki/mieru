import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Avatar } from '../../components/Avatar.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { ApiError } from '../../lib/api-error.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { ModelRows } from '../models/ModelRows.js';
import { PublicShell } from '../shell/PublicShell.js';
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
  const profile = useQuery({
    queryKey: exploreKeys.profile(username),
    queryFn: () => getProfile(username),
  });
  if (profile.isPending)
    return (
      <PublicShell>
        <Spinner className="size-6 text-lilac" />
      </PublicShell>
    );
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 404) return <NotFoundPage />;
    return (
      <PublicShell>
        <p className="text-sm text-danger">프로필을 불러오지 못했어요.</p>
      </PublicShell>
    );
  }
  const data = profile.data;
  return (
    <PublicShell>
      <section className="haze-tone relative mb-8 flex flex-wrap items-center gap-5 overflow-hidden rounded-(--radius-sheet) px-6 py-8 md:px-10">
        <Avatar
          username={data.username}
          displayName={data.displayName}
          size={72}
          className="ring-4 ring-surface"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{data.displayName}</h1>
          <p className="text-sm text-slate">
            @{data.username} · {dateFormat.format(new Date(data.createdAt))} 가입
          </p>
          {data.bio && <p className="mt-2 max-w-xl text-sm leading-6">{data.bio}</p>}
        </div>
        <dl className="tabular ml-auto flex gap-6 text-sm">
          <div>
            <dt className="text-xs text-slate">공개 모델</dt>
            <dd className="text-lg font-bold">{data.publicModelCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">받은 스타</dt>
            <dd className="text-lg font-bold">{data.starsReceived}</dd>
          </div>
        </dl>
      </section>
      <Tabs.Root defaultValue="models">
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
    </PublicShell>
  );
}
