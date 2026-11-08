import { describe, expect, it } from 'vitest';
import { concreteShape, inputKindOf, parseNumbers, rgbaToChw, seededValues } from './inputs.js';

describe('inputKindOf / concreteShape', () => {
  it('treats NCHW with 3 channels as an image and fills dynamic dims', () => {
    const tensor = { name: 'x', dtype: 'float32', shape: ['batch', 3, 'h', 'w'] };
    expect(inputKindOf(tensor)).toBe('image');
    expect(concreteShape(tensor)).toEqual([1, 3, 224, 224]);
  });

  it('treats vectors as numbers', () => {
    const tensor = { name: 'x', dtype: 'float32', shape: ['batch', 4] };
    expect(inputKindOf(tensor)).toBe('numbers');
    expect(concreteShape(tensor)).toEqual([1, 4]);
  });
});

describe('rgbaToChw', () => {
  const twoPixels = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255]);

  it('splits RGB into planes', () => {
    expect([...rgbaToChw(twoPixels, 2, 1, 3, 'none')]).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('applies ImageNet normalization per channel', () => {
    const [red] = rgbaToChw(twoPixels, 2, 1, 3, 'imagenet');
    expect(red).toBeCloseTo((1 - 0.485) / 0.229, 5);
  });

  it('converts to luminance for one channel', () => {
    const [first] = rgbaToChw(twoPixels, 2, 1, 1, 'none');
    expect(first).toBeCloseTo(0.299, 5);
  });
});

describe('parseNumbers', () => {
  it('accepts commas, spaces and newlines', () => {
    expect(parseNumbers('1, 2 3\n4.5')).toEqual([1, 2, 3, 4.5]);
  });

  it('rejects non-numeric tokens', () => {
    expect(parseNumbers('1, two')).toBeNull();
  });
});

describe('seededValues', () => {
  it('is deterministic and bounded', () => {
    const values = seededValues(5, 7);
    expect(values).toEqual(seededValues(5, 7));
    expect(values.every((value) => value >= -1 && value <= 1)).toBe(true);
  });
});
