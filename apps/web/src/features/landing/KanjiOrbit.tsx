import { useState } from 'react';
import type { OpFamily, StripSegment } from '@mieru/shared';
import { Sparkle } from '../../design/Sparkle.js';
import { OP_COLORS } from '../../design/op-palette.js';
import {
  angleAtFraction,
  arcDashes,
  arcMidAngles,
  pointOnEllipse,
  TiltedOrbit,
  type Ellipse,
} from './TiltedOrbit.js';

const WIDTH = 780;
const HEIGHT = 460;
const RING: Ellipse = { cx: 390, cy: 215, rx: 345, ry: 98, tiltDegrees: -9 };
/** Where a hovered arc's node appears: just outside the ring. */
const NODE_ORBIT: Ellipse = { ...RING, rx: RING.rx + 46, ry: RING.ry + 44 };
/** Invisible stroke around each arc that catches the pointer; wider than the arc itself. */
const HIT_WIDTH = 44;

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
  op: string;
  family: OpFamily;
  shape: string;
}

/** The node each arc reveals on hover, keyed by the arc's op family. */
const SATELLITES: Record<OpFamily, Satellite> = {
  compute: { op: 'MatMul', family: 'compute', shape: '[1,12,128,128]' },
  attention: { op: 'Softmax', family: 'attention', shape: '[1,12,128,128]' },
  normalization: { op: 'LayerNorm', family: 'normalization', shape: '[1,128,768]' },
  activation: { op: 'Gelu', family: 'activation', shape: '[1,128,3072]' },
  shape: { op: 'Reshape', family: 'shape', shape: '[1,128,12,64]' },
  other: { op: 'Add', family: 'other', shape: '[1,128,768]' },
};

/**
 * The first arc (compute, the one crossing the glyphs) is drawn in front of them, the rest
 * behind. The cut runs from the ring's centre through the white gaps on either side of that arc,
 * so the two layers meet where there is only white border and no seam can show.
 */
const FRONT_WEDGE = (() => {
  const total = HERO_STRIP.reduce((sum, segment) => sum + segment.weight, 0);
  const end = angleAtFraction(RING, (HERO_STRIP[0]?.weight ?? 0) / total);
  const steps = 12;
  const reach = 3;
  const points = [[RING.cx, RING.cy]];
  for (let step = 0; step <= steps; step += 1) {
    const angle = ((end * step) / steps / 180) * Math.PI;
    points.push([
      RING.cx + reach * RING.rx * Math.cos(angle),
      RING.cy + reach * RING.ry * Math.sin(angle),
    ]);
  }
  return points.map(([x, y]) => `${String(x)},${String(y)}`).join(' ');
})();

const MID_ANGLES = new Map(
  arcMidAngles(RING, HERO_STRIP).map((angle, index) => [HERO_STRIP[index]?.family, angle]),
);

const SPARKLES = [
  { x: 735, y: 70, size: 40, color: 'var(--color-mieru-pink)' },
  { x: 30, y: 150, size: 22, color: 'var(--color-butter)' },
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
              <polygon
                points={FRONT_WEDGE}
                transform={`rotate(${String(RING.tiltDegrees)} ${String(RING.cx)} ${String(RING.cy)})`}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <TiltedOrbit ellipse={RING} segments={HERO_STRIP} strokeWidth={16} />
          </g>
        </>
      ) : (
        <TiltedOrbit ellipse={RING} segments={HERO_STRIP} strokeWidth={16} />
      )}
    </svg>
  );
}

function SatelliteNode({ satellite }: { satellite: Satellite }) {
  // Same parametric angle on a slightly larger orbit puts the node just outside its arc.
  const [x, y] = pointOnEllipse(NODE_ORBIT, MID_ANGLES.get(satellite.family) ?? 0);
  return (
    <span
      className="sticker hero-node-in pointer-events-none absolute flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-surface pr-4 pl-3 whitespace-nowrap"
      style={{ left: percent(x, WIDTH), top: percent(y, HEIGHT) }}
    >
      <span
        className="size-[15px] rounded-full border-[3.5px] bg-surface"
        style={{ borderColor: OP_COLORS[satellite.family] }}
      />
      <span className="font-display text-[12.5px] font-medium">{satellite.op}</span>
      <span className="font-mono text-[11px] text-slate">{satellite.shape}</span>
    </span>
  );
}

const HIT_DASHES = arcDashes(HERO_STRIP);

/** Transparent, wide copies of the arcs on top of everything, so each arc can be hovered. */
function ArcHitAreas({ onHover }: { onHover: (family: OpFamily | null) => void }) {
  const { cx, cy, rx, ry, tiltDegrees } = RING;
  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      aria-hidden="true"
    >
      <g transform={`rotate(${String(tiltDegrees)} ${String(cx)} ${String(cy)})`}>
        {HERO_STRIP.map((segment, index) => (
          <ellipse
            key={segment.family}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            pathLength={100}
            fill="none"
            stroke="transparent"
            strokeWidth={HIT_WIDTH}
            strokeDasharray={HIT_DASHES[index]?.dasharray}
            strokeDashoffset={HIT_DASHES[index]?.dashoffset}
            pointerEvents="stroke"
            onPointerEnter={() => onHover(segment.family)}
            onPointerLeave={() => onHover(null)}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * 見える with the architecture ring orbiting through it. Hovering an arc shows a graph node of
 * that op family next to it. Purely decorative; the page's h1 carries the message.
 */
export function KanjiOrbit() {
  const [hovered, setHovered] = useState<OpFamily | null>(null);
  return (
    <div className="@container relative mx-auto aspect-[780/460] w-full max-w-[1080px]">
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
      <div
        lang="ja"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 text-[22cqw] leading-none tracking-[0.04em] select-none"
      >
        {['kanji-drop', 'kanji-outline', 'kanji-fill'].map((layer) => (
          <span key={layer} className={`${layer} absolute inset-0 grid place-items-center`}>
            見える
          </span>
        ))}
      </div>
      <OrbitLayer isFront />
      <ArcHitAreas onHover={setHovered} />
      {hovered && (
        <div aria-hidden="true">
          <SatelliteNode key={hovered} satellite={SATELLITES[hovered]} />
        </div>
      )}
    </div>
  );
}
