import { OP_COLORS, type OpFamily } from '../design/op-palette.js';

export interface StripSegment {
  family: OpFamily;
  weight: number;
}

interface ArchitectureStripProps {
  segments: readonly StripSegment[];
  label: string;
  height?: number;
  className?: string;
}

/** The signature band: op categories in topological order, widths proportional to run length. */
export function ArchitectureStrip({
  segments,
  label,
  height = 8,
  className,
}: ArchitectureStripProps) {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0) || 1;
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex w-full overflow-hidden rounded-[2px] ${className ?? ''}`}
      style={{ height }}
    >
      {segments.map((segment, index) => (
        <span
          // Segments are a fixed, ordered sequence, so position is their identity.
          key={index}
          style={{
            width: `${(segment.weight / total) * 100}%`,
            backgroundColor: OP_COLORS[segment.family],
          }}
        />
      ))}
    </div>
  );
}
