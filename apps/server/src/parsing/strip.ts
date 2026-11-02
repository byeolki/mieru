import type { OpFamily, StripSegment } from '@mieru/shared';
import { LIMITS } from './limits.js';

/**
 * Builds the architecture strip: families in order, run-length encoded and weighted.
 * Long sequences are bucketed first (each bucket takes its dominant family) so the strip
 * never exceeds LIMITS.maxStripSegments and stays cheap to render in lists.
 */
export function buildStrip(items: readonly { family: OpFamily; weight: number }[]): StripSegment[] {
  const bucketed =
    items.length <= LIMITS.maxStripSegments ? items : bucketize(items, LIMITS.maxStripSegments);
  const segments: StripSegment[] = [];
  for (const item of bucketed) {
    const last = segments.at(-1);
    if (last?.family === item.family) last.weight += item.weight;
    else segments.push({ family: item.family, weight: item.weight });
  }
  return segments;
}

function bucketize(
  items: readonly { family: OpFamily; weight: number }[],
  bucketCount: number,
): { family: OpFamily; weight: number }[] {
  const size = items.length / bucketCount;
  const buckets: { family: OpFamily; weight: number }[] = [];
  for (let index = 0; index < bucketCount; index += 1) {
    const slice = items.slice(Math.floor(index * size), Math.floor((index + 1) * size));
    if (slice.length === 0) continue;
    const totals = new Map<OpFamily, number>();
    for (const item of slice) totals.set(item.family, (totals.get(item.family) ?? 0) + item.weight);
    const [family] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['other'];
    buckets.push({ family, weight: slice.reduce((sum, item) => sum + item.weight, 0) });
  }
  return buckets;
}
