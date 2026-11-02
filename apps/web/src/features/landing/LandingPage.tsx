import { useTranslation } from 'react-i18next';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { SiteHeader } from '../../components/SiteHeader.js';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { GraphPreview } from './GraphPreview.js';
import { RESNET_STRIP, TRANSFORMER_STRIP } from './sample-strips.js';

function RepositoryMock() {
  const tabs = ['개요', '그래프', '통계', '이슈 3'];
  return (
    <div className="haze-tone relative rounded-(--radius-sheet) p-6 sm:p-8" aria-hidden="true">
      <Sparkle className="absolute -top-3 right-10 size-7" color="#DE7EA8" />
      <Sparkle className="absolute top-16 -right-2 size-4" color="#C8B6D4" />
      <div className="overflow-hidden rounded-(--radius-panel) border-[3px] border-white dark:border-haze-deep bg-surface shadow-(--shadow-lift)">
        <div className="border-b border-fog px-5 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">
              <span className="text-slate">@kai /</span>{' '}
              <span className="font-semibold">resnet50-v2</span>
            </span>
            <span className="tabular flex items-center gap-1 text-xs text-slate">
              <Sparkle className="size-3" color="#DE7EA8" /> 128
            </span>
          </div>
          <ArchitectureStrip
            segments={RESNET_STRIP}
            label="resnet50-v2"
            height={6}
            className="mt-3"
          />
          <div className="mt-3 flex gap-4 text-xs">
            {tabs.map((tab) => (
              <span
                key={tab}
                className={
                  tab === '그래프'
                    ? 'border-b-2 border-primary pb-2 font-semibold text-sumi'
                    : 'pb-2 text-slate'
                }
              >
                {tab}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_150px]">
          <div className="screentone h-[300px] p-3">
            <GraphPreview />
          </div>
          <div className="border-l border-fog p-4 text-xs">
            <p className="font-semibold">Conv_23</p>
            <p className="mt-0.5 text-slate">Conv · ai.onnx</p>
            <dl className="mt-3 grid gap-2 font-mono text-[0.7rem]">
              <div>
                <dt className="text-slate">in</dt>
                <dd>[1,64,56,56]</dd>
              </div>
              <div>
                <dt className="text-slate">out</dt>
                <dd>[1,64,56,56]</dd>
              </div>
              <div>
                <dt className="text-slate">kernel</dt>
                <dd>[3,3]</dd>
              </div>
            </dl>
            <p className="tabular mt-3 text-slate">params 36,864</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 hidden w-64 rotate-[-4deg] rounded-2xl border-[3px] border-white dark:border-haze-deep bg-surface px-4 py-3 shadow-(--shadow-lift) sm:block">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">tiny-llama</span>
          <span className="tabular flex items-center gap-1 text-xs text-slate">
            <Sparkle className="size-3" color="#DE7EA8" /> 42
          </span>
        </div>
        <ArchitectureStrip
          segments={TRANSFORMER_STRIP}
          label="tiny-llama"
          height={6}
          className="mt-2"
        />
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  const points = [
    { title: t('landing.pointGraphTitle'), body: t('landing.pointGraphBody') },
    { title: t('landing.pointShareTitle'), body: t('landing.pointShareBody') },
    { title: t('landing.pointIssuesTitle'), body: t('landing.pointIssuesBody') },
  ];

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-6">
        <section className="grid items-center gap-12 py-16 md:grid-cols-[1.05fr_1fr] md:py-24">
          <div>
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance md:text-[2.75rem]">
              {t('landing.title')}
            </h1>
            <p className="mt-5 max-w-[34rem] text-base leading-7 text-slate md:text-lg md:leading-8">
              {t('landing.lead')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/new" size="lg">
                {t('landing.primaryAction')}
              </ButtonLink>
              <ButtonLink to="/explore" size="lg" variant="secondary">
                {t('landing.secondaryAction')}
              </ButtonLink>
            </div>
            <p className="mt-6 text-xs text-slate">{t('landing.formats')}</p>
          </div>
          <div>
            <RepositoryMock />
            <p className="mt-10 max-w-md text-xs leading-5 text-slate">
              {t('landing.stripCaption')}
            </p>
          </div>
        </section>

        <section className="grid gap-8 border-t border-fog py-14 md:grid-cols-3">
          {points.map((point) => (
            <div key={point.title}>
              <h2 className="font-semibold">{point.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate">{point.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
