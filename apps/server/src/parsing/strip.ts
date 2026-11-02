import type { OpFamily, StripSegment } from '@mieru/shared';
import { LIMITS } from './limits.js';

const FAMILIES_PER_BUCKET = 3;

/**
 * Builds the architecture strip: families in order, run-length encoded and weighted.
 * Long sequences are bucketed first; each bucket keeps its family proportions (not just the
 * dominant one) so a transformer's attention/MLP rhythm survives the compression. The result
 * stays under LIMITS.maxStripSegments so lists render it cheaply.
 */
export function buildStrip(items: readonly { family: OpFamily; weight: number }[]): StripSegment[] {
  const bucketed =
    items.length <= LIMITS.maxStripSegments
      ? items
      : bucketize(items, Math.floor(LIMITS.maxStripSegments / FAMILIES_PER_BUCKET));
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
  const result: { family: OpFamily; weight: number }[] = [];
  for (let index = 0; index < bucketCount; index += 1) {
    const slice = items.slice(Math.floor(index * size), Math.floor((index + 1) * size));
    const totals = new Map<OpFamily, number>();
    for (const item of slice) totals.set(item.family, (totals.get(item.family) ?? 0) + item.weight);
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, FAMILIES_PER_BUCKET);
    const kept = new Set(top.map(([family]) => family));
    const sliceWeight = slice.reduce((sum, item) => sum + item.weight, 0);
    const keptWeight = top.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    // Keep first-appearance order inside the bucket, rescaled so bucket weight is preserved.
    for (const family of new Set(slice.map((item) => item.family))) {
      if (!kept.has(family)) continue;
      result.push({ family, weight: ((totals.get(family) ?? 0) / keptWeight) * sliceWeight });
    }
  }
  return result;
}
