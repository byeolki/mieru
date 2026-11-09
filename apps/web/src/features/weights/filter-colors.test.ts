import { describe, expect, it } from 'vitest';
import { divergingColor, rgbKernelPixels } from './filter-colors.js';

describe('divergingColor', () => {
  it('keeps zero white and saturates at the largest magnitude', () => {
    expect(divergingColor(0, 2)).toEqual([255, 255, 255, 255]);
    expect(divergingColor(2, 2)).toEqual([188, 61, 134, 255]);
    expect(divergingColor(-2, 2)).toEqual([79, 116, 184, 255]);
  });
});

describe('rgbKernelPixels', () => {
  it('interleaves CHW planes into RGBA and stretches to the range', () => {
    // One pixel, channels R=1, G=0, B=0.5 over the range [0, 1].
    expect([...rgbKernelPixels([1, 0, 0.5], 1, 0, 1)]).toEqual([255, 0, 128, 255]);
  });
});
