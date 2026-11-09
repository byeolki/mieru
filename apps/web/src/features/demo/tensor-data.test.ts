import { describe, expect, it } from 'vitest';
import {
  feedDtypeOf,
  float16BitsToFloat32,
  float32ToFloat16Bits,
  toDisplayValues,
  toFeedValues,
} from './tensor-data.js';

describe('feedDtypeOf', () => {
  it('feeds unknown dtypes as float32 and rejects unsupported ones', () => {
    expect(feedDtypeOf(null)).toBe('float32');
    expect(feedDtypeOf('int32')).toBe('int32');
    expect(feedDtypeOf('string')).toBeNull();
    expect(feedDtypeOf('bfloat16')).toBeNull();
  });
});

describe('toFeedValues', () => {
  it('rounds and clamps integers to the dtype range', () => {
    expect([...toFeedValues([-300, -0.6, 2.4, 300], 'int8').data]).toEqual([-128, -1, 2, 127]);
    expect([...toFeedValues([-1, 0.5, 254.6, 999], 'uint8').data]).toEqual([0, 1, 255, 255]);
    expect([...toFeedValues([3e10, -3e10], 'int32').data]).toEqual([2 ** 31 - 1, -(2 ** 31)]);
  });

  it('builds bigint int64 and 0/1 bool data', () => {
    expect([...toFeedValues([1.6, -2], 'int64').data]).toEqual([2n, -2n]);
    expect([...toFeedValues([0, 0.3, -1], 'bool').data]).toEqual([0, 1, 1]);
  });

  it('encodes float16 as bit patterns', () => {
    const feed = toFeedValues([1, -2], 'float16');
    expect(feed.data).toBeInstanceOf(Uint16Array);
    expect([...feed.data]).toEqual([0x3c00, 0xc000]);
  });
});

describe('float16 bits', () => {
  it('encodes normal, extreme and special values', () => {
    expect(float32ToFloat16Bits(0)).toBe(0);
    expect(float32ToFloat16Bits(-0)).toBe(0x8000);
    expect(float32ToFloat16Bits(0.1)).toBe(0x2e66);
    expect(float32ToFloat16Bits(65504)).toBe(0x7bff);
    expect(float32ToFloat16Bits(65520)).toBe(0x7c00);
    expect(float32ToFloat16Bits(-Infinity)).toBe(0xfc00);
    expect(float32ToFloat16Bits(Number.NaN)).toBe(0x7e00);
  });

  it('encodes subnormals and flushes tiny values to zero', () => {
    expect(float32ToFloat16Bits(2 ** -24)).toBe(1);
    expect(float32ToFloat16Bits(2 ** -14 - 2 ** -24)).toBe(0x3ff);
    expect(float32ToFloat16Bits(1e-9)).toBe(0);
  });

  it('rounds ties to even', () => {
    expect(float32ToFloat16Bits(1 + 2 ** -11)).toBe(0x3c00);
    expect(float32ToFloat16Bits(1 + 3 * 2 ** -11)).toBe(0x3c02);
  });

  it('decodes back to the nearest representable value', () => {
    expect(float16BitsToFloat32(0x3c00)).toBe(1);
    expect(float16BitsToFloat32(0xc000)).toBe(-2);
    expect(float16BitsToFloat32(0x2e66)).toBeCloseTo(0.1, 3);
    expect(float16BitsToFloat32(1)).toBe(2 ** -24);
    expect(float16BitsToFloat32(0x7c00)).toBe(Infinity);
    expect(float16BitsToFloat32(0x7e00)).toBeNaN();
  });
});

describe('toDisplayValues', () => {
  it('converts int64, bool and float16 outputs to float32', () => {
    expect([...toDisplayValues('int64', BigInt64Array.from([3n, -4n]))]).toEqual([3, -4]);
    expect([...toDisplayValues('bool', Uint8Array.from([1, 0]))]).toEqual([1, 0]);
    expect([...toDisplayValues('float16', Uint16Array.from([0x3c00, 0xc000]))]).toEqual([1, -2]);
    expect([...toDisplayValues('uint16', Uint16Array.from([7]))]).toEqual([7]);
  });
});
