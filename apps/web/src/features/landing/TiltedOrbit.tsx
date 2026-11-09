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
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0) || 1;
  const starts = segments.reduce<number[]>(
    (acc, segment, index) => [...acc, (acc[index] ?? 0) + (segment.weight / total) * 100],
    [0],
  );
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
      {segments.map((segment, index) => {
        const length = (segment.weight / total) * 100;
        return (
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
            strokeDasharray={`${String(Math.max(length - ARC_GAP, 0.1))} ${String(100 - length + ARC_GAP)}`}
            strokeDashoffset={-(starts[index] ?? 0) - ARC_GAP / 2}
          />
        );
      })}
    </g>
  );
}
