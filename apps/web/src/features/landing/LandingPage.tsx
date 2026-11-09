import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ModelListItem } from '@mieru/shared';
import { AppHeader } from '../../components/AppHeader.js';
import { Sparkle } from '../../design/Sparkle.js';
import { OP_COLORS } from '../../design/op-palette.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { formatParams } from '../../lib/format.js';
import { exploreKeys, getExplore } from '../explore/api.js';
import { FORMAT_LABELS } from '../models/labels.js';
import { KanjiOrbit } from './KanjiOrbit.js';
import { TiltedOrbit } from './TiltedOrbit.js';

const CONTAINER = 'mx-auto w-full max-w-[1280px] px-5 md:px-10';
const PILL = 'rounded-full px-6';

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="overflow-hidden">
      <div
        className={`${CONTAINER} grid items-center gap-6 pt-12 pb-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:pt-16 lg:pb-20`}
      >
        <div>
          <h1 className="font-heading text-[clamp(2.6rem,4.8vw,4rem)] leading-[1.15] text-balance">
            {t('landing.title')}
          </h1>
          <p className="mt-6 max-w-[30em] text-lg leading-8 text-pretty text-slate">
            {t('landing.lead')}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink
              to="/new"
              size="lg"
              className={`${PILL} sticker`}
              icon={<Plus className="size-4.5" strokeWidth={2.4} />}
            >
              {t('landing.primaryAction')}
            </ButtonLink>
            <ButtonLink to="/explore" size="lg" variant="secondary" className={`${PILL} border-0`}>
              {t('landing.secondaryAction')}
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm text-slate">{t('landing.formats')}</p>
        </div>
        <KanjiOrbit />
      </div>
    </section>
  );
}

function ModelCard({ item }: { item: ModelListItem }) {
  return (
    <li>
      <Link
        to={`/m/${item.id}`}
        className="group relative flex h-48 flex-col overflow-hidden rounded-(--radius-panel) bg-haze p-5 transition-colors hover:bg-haze-deep"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate">{item.owner.username}</p>
            <p className="mt-0.5 truncate font-display text-xl font-semibold tracking-[-0.03em] group-hover:text-primary">
              {item.name}
            </p>
          </div>
          <span className="tabular flex items-center gap-1 font-display text-xs text-slate">
            <Sparkle className="size-3.5" color="var(--color-mieru-pink)" />
            <span className="sr-only">스타</span>
            {item.starCount}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 max-w-[21em] text-sm leading-6 text-slate">
          {item.description ?? '설명이 아직 없어요.'}
        </p>
        <div className="relative z-10 mt-auto flex flex-wrap gap-1.5">
          {item.format && (
            <span className="rounded-full bg-sumi px-3 py-1 font-display text-[11px] font-semibold text-paper">
              {FORMAT_LABELS[item.format]}
            </span>
          )}
          {item.totalParams !== null && (
            <span className="rounded-full bg-surface px-3 py-1 text-xs text-slate">
              파라미터{' '}
              <span className="font-display text-[11.5px] font-medium text-sumi">
                {formatParams(item.totalParams)}
              </span>
            </span>
          )}
        </div>
        <svg
          viewBox="0 0 230 110"
          className="absolute -right-10 -bottom-3.5 h-[110px] w-[230px]"
          aria-hidden="true"
        >
          <TiltedOrbit
            ellipse={{ cx: 115, cy: 60, rx: 92, ry: 34, tiltDegrees: -12 }}
            segments={item.strip}
            strokeWidth={9}
          />
        </svg>
      </Link>
    </li>
  );
}

/** Real trending repositories, so the landing shows what is actually on the site. */
function LiveTrending() {
  const sections = useQuery({ queryKey: exploreKeys.sections, queryFn: getExplore });
  const items = sections.data?.trending.slice(0, 3) ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="live-trending">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 id="live-trending" className="font-heading text-[1.75rem]">
          {sections.data?.trendingIsFallback ? '스타를 많이 받은 모델' : '이번 주 화제'}
        </h2>
        <Link to="/explore" className="text-sm text-slate hover:text-primary">
          모두 보기
        </Link>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <ModelCard key={item.id} item={item} />
        ))}
      </ol>
    </section>
  );
}

function UploadStage() {
  return (
    <div className="rounded-2xl bg-surface px-4 py-3.5">
      <p className="flex justify-between gap-3 font-mono text-[12.5px]">
        <span className="truncate">llama-ko-1b.safetensors</span>
        <span className="shrink-0 font-display text-[11px]">62%</span>
      </p>
      <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-haze-deep">
        <div className="h-full w-[62%] rounded-full bg-primary" />
      </div>
      <p className="mt-2 text-xs text-slate">끊겨도 이어서 올려요 · 2.4 / 3.9 GB</p>
    </div>
  );
}

const PEOPLE = [
  { initial: 'M', name: 'mio', role: '편집', tint: 'bg-sakura' },
  { initial: 'R', name: 'ren', role: '보기', tint: 'bg-mint/40' },
  { initial: 'S', name: '링크로 보는 사람', role: '7일 뒤 만료', tint: 'bg-butter/50' },
];

function ShareStage() {
  return (
    <ul className="grid gap-2">
      {PEOPLE.map((person) => (
        <li
          key={person.name}
          className="flex items-center gap-2.5 rounded-full bg-surface py-1.5 pr-2 pl-1.5 text-sm"
        >
          <span
            className={`grid size-7 place-items-center rounded-full text-xs font-bold text-ink ${person.tint}`}
          >
            {person.initial}
          </span>
          {person.name}
          <span className="ml-auto rounded-full bg-haze px-2.5 py-0.5 text-xs text-slate">
            {person.role}
          </span>
        </li>
      ))}
    </ul>
  );
}

function IssueStage() {
  return (
    <div className="grid gap-2.5">
      <span className="sticker relative flex h-10 items-center gap-2.5 justify-self-start rounded-full bg-sakura pr-4 pl-3">
        <span
          className="size-[15px] rounded-full border-[3.5px] bg-surface"
          style={{ borderColor: OP_COLORS.normalization }}
        />
        <span className="font-display text-[12.5px] font-medium">LayerNorm</span>
        <span className="font-mono text-[11px] text-slate">[1,128,312]</span>
        <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-on-accent">
          2
        </span>
      </span>
      <p className="ml-7 rounded-2xl rounded-bl-sm bg-surface px-3.5 py-2.5 text-[13px] leading-5">
        epsilon이 기본값보다 작은데 의도한 건가요?
      </p>
    </div>
  );
}

const FEATURE_MAP_TINTS = [
  'var(--color-mieru-pink)',
  'var(--color-butter)',
  'var(--color-mint)',
  'var(--color-lilac)',
  'var(--color-primary)',
  '#46A596',
  'var(--color-sumi)',
  '#5B7FC4',
];

function RunStage() {
  return (
    <div className="grid gap-3.5">
      <div className="grid grid-cols-4 gap-1.5">
        {FEATURE_MAP_TINTS.map((tint, index) => (
          <span
            key={tint}
            className="aspect-square rounded-[10px]"
            style={{
              background: `radial-gradient(circle at ${String(20 + ((index * 37) % 60))}% ${String(30 + ((index * 23) % 50))}%, ${tint} 0, transparent 62%), ${index % 2 ? 'var(--color-surface)' : 'var(--color-haze-deep)'}`,
            }}
          />
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs">
        <span className="w-9">긍정</span>
        <span className="h-2 flex-1 rounded-full bg-primary" />
        <span className="font-display text-[11px]">91%</span>
      </p>
    </div>
  );
}

interface Feature {
  title: string;
  body: string;
  stage: ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: '큰 파일도 끊기지 않게',
    body: '50MB씩 나눠 올리고, 연결이 끊기면 멈춘 곳부터 이어서 올려요.',
    stage: <UploadStage />,
  },
  {
    title: '보여줄 만큼만 공유',
    body: '사람마다 보기나 편집을 고르고, 다운로드는 따로 허용해요.',
    stage: <ShareStage />,
  },
  {
    title: '노드를 짚어서 물어보기',
    body: '이슈를 노드에 연결하면 그래프 위에 바로 표시가 붙어요.',
    stage: <IssueStage />,
  },
  {
    title: '브라우저에서 바로 실행',
    body: 'ONNX 모델에 입력을 넣고, 층마다 무엇을 보는지 확인해요.',
    stage: <RunStage />,
  },
];

function Features() {
  return (
    <ul className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((feature) => (
        <li key={feature.title}>
          <div
            className="flex h-52 flex-col justify-center rounded-(--radius-panel) bg-haze p-5"
            aria-hidden="true"
          >
            {feature.stage}
          </div>
          <h2 className="mt-5 font-heading text-[1.3rem]">{feature.title}</h2>
          <p className="mt-2 text-[15px] leading-7 text-slate">{feature.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-paper">
      <AppHeader />
      <main>
        <Hero />
        <div className="rounded-t-(--radius-sheet) bg-surface md:mx-4">
          <div className={`${CONTAINER} grid gap-24 pt-16 pb-10 md:pt-20`}>
            <LiveTrending />
            <Features />
            <section className="flex flex-col items-center pt-8 text-center">
              <h2 className="font-heading text-[clamp(2rem,4vw,2.6rem)]">
                내 모델은 어떻게 생겼을까요?
              </h2>
              <p className="mt-4 text-slate">파일을 올리면 몇 초 안에 그래프로 보여드려요.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink to="/new" size="lg" className={`${PILL} sticker`}>
                  {t('landing.primaryAction')}
                </ButtonLink>
                <ButtonLink to="/explore" size="lg" variant="ghost" className={`${PILL} bg-haze`}>
                  둘러보기
                </ButtonLink>
              </div>
            </section>
          </div>
          <footer
            className={`${CONTAINER} flex items-center gap-6 border-t border-fog py-8 text-sm text-slate`}
          >
            <img
              src="/brand/logo.png"
              alt="mieru"
              width={660}
              height={404}
              loading="lazy"
              className="h-8 w-auto"
            />
            <span className="max-sm:hidden">{t('landing.nameNote')}</span>
            <Link to="/explore" className="ml-auto hover:text-sumi">
              둘러보기
            </Link>
            <Link to="/login" className="hover:text-sumi">
              로그인
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
