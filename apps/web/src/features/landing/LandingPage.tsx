import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { OP_COLORS, type OpFamily } from '../../design/op-palette.js';
import { useAuth } from '../../lib/auth-store.js';
import { IssueMock, ShareMock, TrendingMock, UploadMock } from './FeatureMocks.js';
import { GlyphField } from './GlyphField.js';
import { ProductWindow } from './ProductWindow.js';

const SOLID_LINK =
  'inline-flex h-11 items-center rounded-md bg-sumi px-5 font-medium text-paper transition-colors hover:bg-white';
const OUTLINE_LINK =
  'inline-flex h-11 items-center rounded-md border border-fog px-5 font-medium text-sumi transition-colors hover:border-slate';

function LandingNav() {
  const { status } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-fog/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link to="/" aria-label="mieru">
          <img src="/brand/logo.png" alt="" width={660} height={404} className="h-10 w-auto" />
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link to="/explore" className="rounded-md px-3 py-2 text-slate hover:text-sumi">
            둘러보기
          </Link>
          {status === 'signed-in' ? (
            <Link to="/dashboard" className={`${SOLID_LINK} ml-2 h-9 px-4 text-sm`}>
              대시보드
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-md px-3 py-2 text-slate hover:text-sumi">
                로그인
              </Link>
              <Link to="/signup" className={`${SOLID_LINK} ml-2 h-9 px-4 text-sm`}>
                시작하기
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden">
      <GlyphField />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-32 pb-24 text-center max-sm:pt-20">
        <Link
          to="/explore"
          className="mb-8 inline-flex items-center gap-2 rounded-md border border-fog bg-paper/70 px-3 py-1.5 text-sm text-slate hover:text-sumi"
        >
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          {t('landing.badge')}
        </Link>
        <h1 className="text-[clamp(2.5rem,7vw,4.75rem)] leading-[1.08] font-bold tracking-[-0.035em] text-balance">
          {t('landing.title')}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate text-pretty">
          {t('landing.lead')}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/new" className={SOLID_LINK}>
            {t('landing.primaryAction')}
          </Link>
          <Link to="/explore" className={OUTLINE_LINK}>
            {t('landing.secondaryAction')}
          </Link>
        </div>
        <p className="mt-5 text-sm text-slate">{t('landing.formats')}</p>
      </div>
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
        <h2 className="mt-3 text-3xl leading-tight font-bold tracking-[-0.025em] text-balance">
          {feature.title}
        </h2>
        <p className="mt-5 max-w-md text-[1.0625rem] leading-8 text-slate text-pretty">
          {feature.body}
        </p>
      </div>
      {feature.mock}
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="theme-ink min-h-dvh">
      <LandingNav />
      <main>
        <Hero />
        <section className="mx-auto max-w-6xl px-6" aria-label="저장소 화면 미리보기">
          <ProductWindow />
        </section>
        <section className="mx-auto grid max-w-6xl gap-32 px-6 py-36 max-md:gap-24 max-md:py-24">
          {FEATURES.map((feature, index) => (
            <FeatureRow key={feature.label} feature={feature} isReversed={index % 2 === 1} />
          ))}
        </section>
        <section className="border-t border-fog">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-32 text-center">
            <p
              lang="ja"
              className="text-[clamp(4.5rem,16vw,10rem)] leading-none font-bold tracking-[-0.04em] text-primary"
            >
              見える
            </p>
            <p className="mt-6 text-slate">{t('landing.nameNote')}</p>
            <Link to="/new" className={`${SOLID_LINK} mt-10`}>
              {t('landing.primaryAction')}
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-fog">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-8 text-sm text-slate">
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
