import type { StripSegment } from '@mieru/shared';
import { Sparkle } from '../design/Sparkle.js';
import { OP_COLORS } from '../design/op-palette.js';

const WIDTH = 400;
const HEIGHT = 260;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const RADIUS = { x: 172, y: 68 };
const TILT_DEGREES = -12;
const STEPS_PER_UNIT = 240;

function pointAt(fraction: number): [number, number] {
  // Start at the front-left so the strip reads left to right across the lower arc.
  const angle = Math.PI * 0.75 + fraction * Math.PI * 2;
  return [CENTER.x + RADIUS.x * Math.cos(angle), CENTER.y + RADIUS.y * Math.sin(angle)];
}

function arcPath(from: number, to: number): string {
  const steps = Math.max(2, Math.ceil((to - from) * STEPS_PER_UNIT));
  const points = Array.from({ length: steps + 1 }, (_, index) =>
    pointAt(from + ((to - from) * index) / steps),
  );
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
}

/**
 * The architecture strip wrapped around a tilted orbit, echoing the logo's ring, with the
 * headline number in the middle. Purely visual: the same data is listed in the facts panel.
 */
export function OrbitRing({
  segments,
  value,
  caption,
}: {
  segments: readonly StripSegment[];
  value: string;
  caption: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0) || 1;
  const ends = segments.reduce<number[]>(
    (acc, segment) => [...acc, (acc.at(-1) ?? 0) + segment.weight],
    [],
  );
  const arcs = segments.map((segment, index) => ({
    key: index,
    d: arcPath((ends[index - 1] ?? 0) / total, (ends[index] ?? 0) / total),
    color: OP_COLORS[segment.family],
  }));
  return (
    <div className="relative mx-auto aspect-[400/260] w-full max-w-[400px]">
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        <g transform={`rotate(${String(TILT_DEGREES)} ${String(CENTER.x)} ${String(CENTER.y)})`}>
          <ellipse
            cx={CENTER.x}
            cy={CENTER.y}
            rx={RADIUS.x + 13}
            ry={RADIUS.y + 13}
            fill="none"
            stroke="var(--color-lilac)"
            strokeWidth="1.5"
          />
          {arcs.length > 0 ? (
            arcs.map((arc) => (
              <path
                key={arc.key}
                d={arc.d}
                fill="none"
                stroke={arc.color}
                strokeWidth="8"
                strokeLinecap="butt"
              />
            ))
          ) : (
            <ellipse
              cx={CENTER.x}
              cy={CENTER.y}
              rx={RADIUS.x}
              ry={RADIUS.y}
              fill="none"
              stroke="var(--color-fog)"
              strokeWidth="8"
            />
          )}
        </g>
      </svg>
      <Sparkle className="absolute top-[6%] right-[8%] size-7" color="var(--color-mieru-pink)" />
      <Sparkle className="absolute bottom-[12%] left-[4%] size-3.5" color="var(--color-butter)" />
      <Sparkle className="absolute top-[30%] left-[2%] size-2.5" color="var(--color-mint)" />
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-[2.1rem] leading-none font-semibold tracking-[-0.03em]">
            {value}
          </p>
          <p className="mt-1.5 text-sm text-slate">{caption}</p>
        </div>
      </div>
    </div>
  );
}
