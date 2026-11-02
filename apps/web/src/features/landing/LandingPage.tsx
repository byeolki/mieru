import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AppHeader } from '../../components/AppHeader.js';
import { OP_COLORS, type OpFamily } from '../../design/op-palette.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { exploreKeys, getExplore } from '../explore/api.js';
import { FeaturedCard } from '../models/FeaturedCard.js';
import { IssueMock, ShareMock, TrendingMock, UploadMock } from './FeatureMocks.js';
import { GlyphField } from './GlyphField.js';
import { ProductWindow } from './ProductWindow.js';

const CONTAINER = 'mx-auto w-full max-w-[1280px] px-4 md:px-6';

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden border-b border-fog bg-surface">
      <GlyphField maskClassName="glyph-field-mask-side" />
      <div
        className={`${CONTAINER} relative grid items-center gap-14 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-24`}
      >
        <div>
          <h1 className="text-[clamp(2.5rem,5.2vw,4rem)] leading-[1.1] font-bold tracking-[-0.035em] text-balance">
            {t('landing.title')}
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-pretty text-slate">
            {t('landing.lead')}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink to="/new" size="lg">
              {t('landing.primaryAction')}
            </ButtonLink>
            <ButtonLink to="/explore" size="lg" variant="secondary">
              {t('landing.secondaryAction')}
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm text-slate">{t('landing.formats')}</p>
        </div>
        <ProductWindow />
      </div>
    </section>
  );
}

/** Real trending repositories, so the landing shows what is actually on the site. */
function LiveTrending() {
  const sections = useQuery({ queryKey: exploreKeys.sections, queryFn: getExplore });
  const items = sections.data?.trending.slice(0, 3) ?? [];
  if (items.length === 0) return null;
  return (
    <section className={`${CONTAINER} pt-20`} aria-labelledby="live-trending">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="live-trending" className="text-xl font-bold tracking-[-0.02em]">
            {sections.data?.trendingIsFallback ? '스타를 많이 받은 모델' : '이번 주 화제'}
          </h2>
          <p className="mt-1.5 text-sm text-slate">지금 mieru에 공개된 모델이에요.</p>
        </div>
        <Link
          to="/explore"
          className="flex items-center gap-1 text-sm text-slate hover:text-primary"
        >
          모두 보기 <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <FeaturedCard key={item.id} item={item} rank={index + 1} />
        ))}
      </ol>
    </section>
  );
}

interface Feature {
  family: OpFamily;
  label: string;
  title: string;
  body: string;
  mock: ReactNode;
}

const FEATURES: Feature[] = [
  {
    family: 'compute',
    label: '업로드',
    title: '큰 파일도 끊기지 않게 올라가요',
    body: 'safetensors는 10GB까지, 50MB씩 나눠 올리고 끊기면 이어서 올려요. 올린 뒤에는 서버가 구조를 읽어서 몇 초 안에 그래프로 만들어요.',
    mock: <UploadMock />,
  },
  {
    family: 'normalization',
    label: '공유',
    title: '누가 보고, 누가 고칠지 정해요',
    body: '사람마다 보기나 편집 권한을 주고, 다운로드까지 허용할지 따로 골라요. 만료되는 링크를 만들 수도 있고, 공개하면서 보기만 허용할 수도 있어요.',
    mock: <ShareMock />,
  },
  {
    family: 'activation',
    label: '이슈',
    title: '노드를 짚어서 물어봐요',
    body: '버그, 질문, 피드백을 저장소 안에서 주고받아요. 이슈를 특정 노드에 연결하면 그래프 위에 표시가 붙어서 어디 얘기인지 바로 보여요.',
    mock: <IssueMock />,
  },
  {
    family: 'attention',
    label: '둘러보기',
    title: '요즘 많이 보는 모델',
    body: '공개된 모델은 스타와 조회, 이슈 활동으로 화제 순위가 매겨져요. 목록의 스트립만 봐도 어떤 구조인지 짐작할 수 있어요.',
    mock: <TrendingMock />,
  },
];

function FeatureRow({ feature, isReversed }: { feature: Feature; isReversed: boolean }) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={isReversed ? 'md:order-2' : undefined}>
        <p className="flex items-center gap-2 text-sm text-slate">
          <span
            className="size-2 rounded-[2px]"
            style={{ backgroundColor: OP_COLORS[feature.family] }}
            aria-hidden="true"
          />
          {feature.label}
        </p>
        <h2 className="mt-3 text-xl leading-tight font-bold tracking-[-0.025em] text-balance">
          {feature.title}
        </h2>
        <p className="mt-4 max-w-md text-base leading-8 text-pretty text-slate">{feature.body}</p>
      </div>
      <div className="rounded-2xl bg-haze/60 p-4 md:p-6">{feature.mock}</div>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main>
        <Hero />
        <LiveTrending />
        <section className={`${CONTAINER} grid gap-28 py-28 max-md:gap-20 max-md:py-20`}>
          {FEATURES.map((feature, index) => (
            <FeatureRow key={feature.label} feature={feature} isReversed={index % 2 === 1} />
          ))}
        </section>
        <section className="border-t border-fog bg-surface">
          <div className={`${CONTAINER} flex flex-col items-center py-28 text-center`}>
            <p
              lang="ja"
              className="text-[clamp(4.5rem,14vw,9rem)] leading-none font-bold tracking-[-0.04em] text-primary"
            >
              見える
            </p>
            <p className="mt-6 text-slate">{t('landing.nameNote')}</p>
            <ButtonLink to="/new" size="lg" className="mt-10">
              {t('landing.primaryAction')}
            </ButtonLink>
          </div>
        </section>
      </main>
      <footer className="border-t border-fog">
        <div className={`${CONTAINER} flex items-center gap-6 py-8 text-sm text-slate`}>
          <img
            src="/brand/logo.png"
            alt="mieru"
            width={660}
            height={404}
            loading="lazy"
            className="h-8 w-auto"
          />
          <Link to="/explore" className="ml-auto hover:text-sumi">
            둘러보기
          </Link>
          <Link to="/login" className="hover:text-sumi">
            로그인
          </Link>
        </div>
      </footer>
    </div>
  );
}
