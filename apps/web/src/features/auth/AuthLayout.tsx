import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArchitectureStrip, type StripSegment } from '../../components/ArchitectureStrip.js';
import { Sparkle } from '../../design/Sparkle.js';
import { RESNET_STRIP, TRANSFORMER_STRIP, UNET_STRIP } from '../landing/sample-strips.js';

interface StickerCard {
  name: string;
  owner: string;
  stars: number;
  strip: StripSegment[];
  rotate: string;
  offset: string;
}

const STICKERS: StickerCard[] = [
  {
    name: 'resnet50-v2',
    owner: 'kai',
    stars: 128,
    strip: RESNET_STRIP,
    rotate: '-rotate-3',
    offset: 'ml-2',
  },
  {
    name: 'tiny-llama',
    owner: 'mio',
    stars: 42,
    strip: TRANSFORMER_STRIP,
    rotate: 'rotate-2',
    offset: 'ml-14',
  },
  {
    name: 'unet-seg',
    owner: 'hana',
    stars: 17,
    strip: UNET_STRIP,
    rotate: '-rotate-1',
    offset: 'ml-6',
  },
];

function BrandPanel() {
  const { t } = useTranslation();
  return (
    <aside className="haze-tone relative hidden overflow-hidden rounded-(--radius-sheet) lg:flex lg:flex-col lg:justify-between lg:p-10">
      <Link to="/" aria-label="mieru">
        <img
          src="/brand/logo.png"
          alt=""
          className="h-20 w-auto drop-shadow-[0_6px_14px_rgb(222_126_168/0.25)]"
        />
      </Link>

      <div className="relative my-10 flex flex-col gap-4" aria-hidden="true">
        <Sparkle className="absolute -top-6 right-16 size-6" color="var(--color-mieru-pink)" />
        <Sparkle className="absolute top-28 right-6 size-4" color="#C8B6D4" />
        <Sparkle className="absolute -bottom-4 left-1 size-5" color="#F2C2D4" />
        {STICKERS.map((card) => (
          <div
            key={card.name}
            className={`${card.rotate} ${card.offset} w-[76%] rounded-2xl border border-fog bg-surface p-2.5 shadow-(--shadow-lift)`}
          >
            <ArchitectureStrip
              segments={card.strip}
              label={card.name}
              height={34}
              className="rounded-lg"
            />
            <div className="flex items-baseline justify-between gap-3 px-1.5 pt-2.5 pb-0.5">
              <span className="font-mono text-sm">
                <span className="text-slate">{card.owner}/</span>
                <span className="font-medium">{card.name}</span>
              </span>
              <span className="tabular flex items-center gap-1 text-xs text-slate">
                <Sparkle className="size-3" color="var(--color-mieru-pink)" />
                {card.stars}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-xl leading-snug font-bold tracking-tight">{t('auth.brandTitle')}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate">{t('auth.brandBody')}</p>
      </div>
    </aside>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh gap-6 p-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] lg:p-4">
      <BrandPanel />
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <Link to="/" className="mb-10 self-start lg:hidden" aria-label="mieru">
          <img src="/brand/logo.png" alt="" className="h-12 w-auto" />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
