import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';

function EmptyState() {
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
    </section>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={t('dashboard.title')} />
      <EmptyState />
    </AppShell>
  );
}
