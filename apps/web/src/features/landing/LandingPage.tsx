import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArchitectureStrip, type StripSegment } from '../../components/ArchitectureStrip.js';
import { SiteHeader } from '../../components/SiteHeader.js';
import { RESNET_STRIP, TRANSFORMER_STRIP } from './sample-strips.js';

interface SampleRow {
  name: string;
  owner: string;
  params: string;
  size: string;
  strip: StripSegment[];
}

const SAMPLE_ROWS: SampleRow[] = [
  { name: 'resnet50-v2', owner: '@kai', params: '25.6M', size: '98 MB', strip: RESNET_STRIP },
  { name: 'tiny-llama', owner: '@mio', params: '110M', size: '440 MB', strip: TRANSFORMER_STRIP },
];

function SamplePreview() {
  return (
    <div className="screentone rounded-xl border border-fog p-5" aria-hidden="true">
      <div className="rounded-lg border border-fog bg-surface">
        {SAMPLE_ROWS.map((row) => (
          <div key={row.name} className="border-b border-fog px-4 py-3 last:border-b-0">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium">{row.name}</span>
              <span className="tabular text-xs text-slate">
                {row.owner} · {row.params} · {row.size}
              </span>
            </div>
            <ArchitectureStrip segments={row.strip} label={row.name} className="mt-2.5" />
          </div>
        ))}
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
              <Link
                to="/new"
                className="rounded-md bg-primary px-5 py-3 font-medium text-white hover:bg-primary-hover"
              >
                {t('landing.primaryAction')}
              </Link>
              <Link
                to="/explore"
                className="rounded-md border border-fog bg-surface px-5 py-3 font-medium hover:border-lilac"
              >
                {t('landing.secondaryAction')}
              </Link>
            </div>
            <p className="mt-6 text-xs text-slate">{t('landing.formats')}</p>
          </div>
          <div>
            <SamplePreview />
            <p className="mt-3 max-w-md text-xs leading-5 text-slate">
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
