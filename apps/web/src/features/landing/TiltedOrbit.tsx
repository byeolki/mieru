import type { StripSegment } from '@mieru/shared';
import { OP_COLORS } from '../../design/op-palette.js';

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tiltDegrees: number;
}

/** Gap between neighbouring arcs, as a share of the whole ring (pathLength is 100). */
const ARC_GAP = 1.6;

/** Point on the tilted ellipse at `angleDegrees`, for placing things along the orbit. */
export function pointOnEllipse(
  { cx, cy, rx, ry, tiltDegrees }: Ellipse,
  angleDegrees: number,
): [number, number] {
  const angle = (angleDegrees * Math.PI) / 180;
  const tilt = (tiltDegrees * Math.PI) / 180;
  const x = rx * Math.cos(angle);
  const y = ry * Math.sin(angle);
  return [
    cx + x * Math.cos(tilt) - y * Math.sin(tilt),
    cy + x * Math.sin(tilt) + y * Math.cos(tilt),
  ];
}

const LENGTH_SAMPLES = 720;

/**
 * Parametric angle (degrees) at which `fraction` of the ellipse's perimeter has been travelled,
 * starting at the rightmost point and moving the way an SVG ellipse path is drawn. Dash arrays
 * measure length, not angle, so this is what lines things up with the drawn arcs.
 */
export function angleAtFraction({ rx, ry }: Pick<Ellipse, 'rx' | 'ry'>, fraction: number): number {
  const lengths = [0];
  for (let step = 1; step <= LENGTH_SAMPLES; step += 1) {
    const before = ((step - 1) / LENGTH_SAMPLES) * Math.PI * 2;
    const after = (step / LENGTH_SAMPLES) * Math.PI * 2;
    const dx = rx * (Math.cos(after) - Math.cos(before));
    const dy = ry * (Math.sin(after) - Math.sin(before));
    lengths.push((lengths[step - 1] ?? 0) + Math.hypot(dx, dy));
  }
  const target = (((fraction % 1) + 1) % 1) * (lengths[LENGTH_SAMPLES] ?? 0);
  const step = Math.max(
    lengths.findIndex((length) => length >= target),
    1,
  );
  const before = lengths[step - 1] ?? 0;
  const span = (lengths[step] ?? before) - before;
  const within = span > 0 ? (target - before) / span : 0;
  return ((step - 1 + within) / LENGTH_SAMPLES) * 360;
}

/** Parametric angle (degrees) at the middle of each segment's arc, in segment order. */
export function arcMidAngles(ellipse: Ellipse, segments: readonly StripSegment[]): number[] {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0) || 1;
  let start = 0;
  return segments.map((segment) => {
    const middle = (start + segment.weight / 2) / total;
    start += segment.weight;
    return angleAtFraction(ellipse, middle);
  });
}

/** Dash pattern that draws each segment's share of a `pathLength={100}` ellipse, in order. */
export function arcDashes(
  segments: readonly StripSegment[],
): { dasharray: string; dashoffset: number }[] {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0) || 1;
  let start = 0;
  return segments.map((segment) => {
    const length = (segment.weight / total) * 100;
    const dash = {
      dasharray: `${String(Math.max(length - ARC_GAP, 0.1))} ${String(100 - length + ARC_GAP)}`,
      dashoffset: -start - ARC_GAP / 2,
    };
    start += length;
    return dash;
  });
}

interface TiltedOrbitProps {
  ellipse: Ellipse;
  segments: readonly StripSegment[];
  strokeWidth: number;
  /** The white track and lilac drop under the arcs, like the logo's ring. */
  hasTrack?: boolean;
}

/**
 * The architecture strip wrapped around a tilted ellipse, one arc per op family. Renders an SVG
 * group, so callers own the `<svg>` and can layer it in front of or behind other content.
 */
export function TiltedOrbit({ ellipse, segments, strokeWidth, hasTrack = true }: TiltedOrbitProps) {
  const { cx, cy, rx, ry, tiltDegrees } = ellipse;
  const dashes = arcDashes(segments);
  return (
    <g transform={`rotate(${String(tiltDegrees)} ${String(cx)} ${String(cy)})`}>
      {hasTrack && (
        <>
          <ellipse
            cx={cx}
            cy={cy + strokeWidth * 0.55}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="var(--color-dots)"
            strokeWidth={strokeWidth + 6}
          />
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="var(--color-surface)"
            strokeWidth={strokeWidth + 10}
          />
        </>
      )}
      {segments.map((segment, index) => (
        <ellipse
          // Segments are an ordered sequence, so position is their identity.
          key={index}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          pathLength={100}
          fill="none"
          stroke={OP_COLORS[segment.family]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashes[index]?.dasharray}
          strokeDashoffset={dashes[index]?.dashoffset}
        />
      ))}
    </g>
  );
}
