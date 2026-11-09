import clsx from 'clsx';
import type { CSSProperties } from 'react';
import type { OpFamily, StripSegment } from '@mieru/shared';
import { Sparkle } from '../../design/Sparkle.js';
import { OP_COLORS } from '../../design/op-palette.js';
import { pointOnEllipse, TiltedOrbit, type Ellipse } from './TiltedOrbit.js';

const WIDTH = 780;
const HEIGHT = 460;
const RING: Ellipse = { cx: 390, cy: 215, rx: 345, ry: 98, tiltDegrees: -9 };
const OUTER: Ellipse = { ...RING, rx: 372, ry: 160 };
/** The ring passes in front of the glyphs below this line, behind them above it. */
const FRONT_CLIP_OFFSET = 10;

/** Op mix of a small transformer encoder, grouped so each family reads as one arc. */
const HERO_STRIP: StripSegment[] = [
  { family: 'compute', weight: 34 },
  { family: 'attention', weight: 22 },
  { family: 'normalization', weight: 14 },
  { family: 'activation', weight: 10 },
  { family: 'shape', weight: 14 },
  { family: 'other', weight: 6 },
];

interface Satellite {
  angleDegrees: number;
  op: string;
  family: OpFamily;
  shape?: string;
  isSelected?: boolean;
}

const SATELLITES: Satellite[] = [
  { angleDegrees: 228, op: 'MatMul', family: 'compute', shape: '[1,12,128,128]', isSelected: true },
  { angleDegrees: 300, op: 'Softmax', family: 'attention' },
  { angleDegrees: 28, op: 'LayerNorm', family: 'normalization' },
  { angleDegrees: 140, op: 'Gelu', family: 'activation' },
];

const SPARKLES = [
  { x: 735, y: 70, size: 40, color: 'var(--color-mieru-pink)' },
  { x: 40, y: 330, size: 22, color: 'var(--color-butter)' },
  { x: 690, y: 380, size: 18, color: 'var(--color-mint)' },
  { x: 120, y: 60, size: 16, color: 'var(--color-lilac)' },
];

const percent = (value: number, of: number) => `${String((value / of) * 100)}%`;

function OrbitLayer({ isFront }: { isFront: boolean }) {
  const clipId = 'kanji-orbit-front';
  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      className="absolute inset-0 size-full overflow-visible"
      aria-hidden="true"
    >
      {isFront ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect
                x={-100}
                y={RING.cy + FRONT_CLIP_OFFSET}
                width={WIDTH + 200}
                height={HEIGHT}
                transform={`rotate(${String(RING.tiltDegrees)} ${String(RING.cx)} ${String(RING.cy)})`}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <TiltedOrbit ellipse={RING} segments={HERO_STRIP} strokeWidth={16} hasTrack={false} />
          </g>
        </>
      ) : (
        <>
          <TiltedOrbit ellipse={RING} segments={HERO_STRIP} strokeWidth={16} />
          <ellipse
            cx={OUTER.cx}
            cy={OUTER.cy}
            rx={OUTER.rx}
            ry={OUTER.ry}
            transform={`rotate(${String(OUTER.tiltDegrees)} ${String(OUTER.cx)} ${String(OUTER.cy)})`}
            fill="none"
            stroke="var(--color-lilac)"
            strokeWidth={1.5}
            strokeDasharray="2 8"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

function SatelliteNode({ satellite, order }: { satellite: Satellite; order: number }) {
  const [x, y] = pointOnEllipse(OUTER, satellite.angleDegrees);
  return (
    <span
      className={clsx(
        'hero-node-in absolute flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full pr-4 pl-3 whitespace-nowrap',
        satellite.isSelected ? 'sticker bg-sakura' : 'border border-edge bg-surface',
      )}
      style={{ left: percent(x, WIDTH), top: percent(y, HEIGHT), '--i': order } as CSSProperties}
    >
      <span
        className="size-[15px] rounded-full border-[3.5px] bg-surface"
        style={{ borderColor: OP_COLORS[satellite.family] }}
      />
      <span className="font-display text-[12.5px] font-medium">{satellite.op}</span>
      {satellite.shape && (
        <span className="font-mono text-[11px] text-slate">{satellite.shape}</span>
      )}
    </span>
  );
}

/**
 * 見える with the architecture ring orbiting through it, and a few graph nodes riding the outer
 * orbit. Decorative apart from the gloss, which says what the word means.
 */
export function KanjiOrbit() {
  return (
    <figure className="@container relative mx-auto aspect-[780/460] w-full max-w-[1080px]">
      <OrbitLayer isFront={false} />
      {SPARKLES.map((sparkle) => (
        <span
          key={`${String(sparkle.x)}-${String(sparkle.y)}`}
          className="absolute aspect-square -translate-x-1/2 -translate-y-1/2"
          style={{
            left: percent(sparkle.x, WIDTH),
            top: percent(sparkle.y, HEIGHT),
            width: percent(sparkle.size, WIDTH),
          }}
        >
          <Sparkle className="size-full" color={sparkle.color} />
        </span>
      ))}
      <p
        lang="ja"
        aria-hidden="true"
        className="kanji-sticker absolute inset-0 grid place-items-center text-[22cqw] leading-none tracking-[0.04em] select-none"
      >
        見える
      </p>
      <OrbitLayer isFront />
      <div className="max-sm:hidden" aria-hidden="true">
        {SATELLITES.map((satellite, index) => (
          <SatelliteNode key={satellite.op} satellite={satellite} order={index} />
        ))}
      </div>
      <figcaption className="absolute inset-x-0 bottom-[6%] text-center text-sm text-slate">
        <span lang="ja" className="sr-only">
          見える{' '}
        </span>
        <span className="mr-1.5 font-display font-medium text-sumi">mieru</span>
        일본어로 ‘보인다’
      </figcaption>
    </figure>
  );
}
