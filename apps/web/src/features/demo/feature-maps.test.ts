import { describe, expect, it } from 'vitest';
import { activationGrid, channelToRgba, softmax, topIndices } from './feature-maps.js';

describe('activationGrid', () => {
  it('reads NCHW and CHW, rejects vectors and 1×1 maps', () => {
    expect(activationGrid([1, 4, 8, 8])).toEqual({ channels: 4, height: 8, width: 8 });
    expect(activationGrid([4, 8, 8])).toEqual({ channels: 4, height: 8, width: 8 });
    expect(activationGrid([1, 10])).toBeNull();
    expect(activationGrid([1, 4, 1, 1])).toBeNull();
  });
});

describe('channelToRgba', () => {
  const grid = { channels: 2, height: 1, width: 2 };

  it('stretches each channel to 0..255', () => {
    const rgba = channelToRgba([0, 0, -1, 3], grid, 1);
    expect([...rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it('renders a constant channel as mid gray', () => {
    expect(channelToRgba([5, 5, 0, 0], grid, 0)[0]).toBe(128);
  });
});

describe('softmax / topIndices', () => {
  it('sums to one and ranks the largest first', () => {
    const probabilities = softmax([1, 3, 2]);
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
    expect(topIndices(probabilities, 2)).toEqual([1, 2]);
  });

  it('stays finite for large logits', () => {
    expect(softmax([1000, 1001]).every(Number.isFinite)).toBe(true);
  });
});
