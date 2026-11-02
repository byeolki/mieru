import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { Plus, Upload, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { listModels, modelKeys } from '../models/api.js';
import { ModelRows } from '../models/ModelRows.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';

function EmptyOwned() {
  const { t } = useTranslation();
  return (
    <section className="haze-tone relative overflow-hidden rounded-(--radius-sheet) px-8 py-16 text-center">
      <Sparkle className="absolute top-8 left-[18%] size-5" color="#DE7EA8" />
      <Sparkle className="absolute right-[20%] bottom-10 size-4" color="#C8B6D4" />
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border-[3px] border-white bg-surface shadow-(--shadow-soft)">
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

function ModelList({ scope }: { scope: 'owned' | 'shared' }) {
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
  return <ModelRows items={query.data.items} showOwner={scope === 'shared'} />;
}

const TAB_TRIGGER =
  'relative px-1 pb-3 text-sm font-medium text-slate data-[state=active]:text-sumi data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary';

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader
        title={t('nav.dashboard')}
        actions={
          <ButtonLink to="/new" icon={<Plus className="size-4" />}>
            {t('nav.newModel')}
          </ButtonLink>
        }
      />
      <Tabs.Root defaultValue="owned">
        <Tabs.List className="mb-6 flex gap-6 border-b border-fog" aria-label="모델 목록">
          <Tabs.Trigger value="owned" className={TAB_TRIGGER}>
            {t('dashboard.title')}
          </Tabs.Trigger>
          <Tabs.Trigger value="shared" className={TAB_TRIGGER}>
            공유받은 모델
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="owned">
          <ModelList scope="owned" />
        </Tabs.Content>
        <Tabs.Content value="shared">
          <ModelList scope="shared" />
        </Tabs.Content>
      </Tabs.Root>
    </AppShell>
  );
}
