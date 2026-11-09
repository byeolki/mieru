import { describe, expect, it } from 'vitest';
import { decoderFor } from './decode.js';
import { Histogram, StatsAccumulator } from './stats.js';

describe('decoderFor', () => {
  it('reads float16 and bfloat16 under both spellings', () => {
    const half = Buffer.from([0x00, 0x3c]); // 1.0 in IEEE half precision
    expect(decoderFor('float16')?.read(half, 0)).toBe(1);
    expect(decoderFor('F16')?.read(half, 0)).toBe(1);
    const brain = Buffer.from([0x80, 0xbf]); // -1.0 in bfloat16
    expect(decoderFor('BF16')?.read(brain, 0)).toBe(-1);
  });

  it('decodes subnormal halves and rejects unsupported dtypes', () => {
    expect(decoderFor('float16')?.read(Buffer.from([0x01, 0x00]), 0)).toBeCloseTo(5.96e-8, 10);
    expect(decoderFor('complex64')).toBeNull();
  });
});

describe('StatsAccumulator', () => {
  it('matches the two-pass mean and standard deviation', () => {
    const values = [1, 2, 3, 4, 0, Number.NaN];
    const stats = new StatsAccumulator();
    for (const value of values) stats.add(value);
    const summary = stats.summary();
    expect(summary).toMatchObject({ count: 6, min: 0, max: 4, mean: 2, nonFinite: 1 });
    expect(summary.std).toBeCloseTo(Math.sqrt(2), 10);
    expect(summary.zeroFraction).toBeCloseTo(1 / 6, 10);
  });
});

describe('Histogram', () => {
  it('bins values and clamps the maximum into the last bin', () => {
    const histogram = new Histogram(0, 4, 4);
    for (const value of [0, 0.5, 1, 3.9, 4, Number.NaN]) histogram.add(value);
    expect(histogram.counts).toEqual([2, 1, 0, 2]);
  });
});
