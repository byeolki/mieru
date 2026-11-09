import { describe, expect, it } from 'vitest';
import {
  concreteShape,
  defaultDim,
  defaultValues,
  formatValues,
  inputKindOf,
  parseNumbers,
  parseShape,
  rgbaToChw,
  seededValues,
} from './inputs.js';

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

describe('defaultDim', () => {
  const text = { inputName: 'x', axis: 1, isImage: false };

  it('keeps fixed dims and reads symbolic names by convention', () => {
    expect(defaultDim(12, text)).toBe(12);
    expect(defaultDim('batch_size', { ...text, axis: 0 })).toBe(1);
    expect(defaultDim('sequence_length', text)).toBe(8);
    expect(defaultDim('seq_len', text)).toBe(8);
    expect(defaultDim('num_tokens', text)).toBe(8);
    expect(defaultDim('unk__42', text)).toBe(1);
  });

  it('starts the KV cache empty and adds up summed dims', () => {
    expect(defaultDim('past_sequence_length', text)).toBe(0);
    expect(defaultDim('past_sequence_length + 1', text)).toBe(1);
    expect(defaultDim('past_sequence_length + sequence_length', text)).toBe(8);
  });

  it('treats unnamed axes of token inputs as sequences', () => {
    expect(defaultDim(null, { ...text, inputName: 'input_ids' })).toBe(8);
    expect(defaultDim(null, { ...text, inputName: 'input_ids', axis: 0 })).toBe(1);
    expect(defaultDim(null, text)).toBe(1);
  });

  it('gives image height and width the default side', () => {
    expect(defaultDim('height', { ...text, axis: 2, isImage: true })).toBe(224);
  });

  it('fills a BERT input and a KV cache input', () => {
    expect(
      concreteShape({ name: 'input_ids', dtype: 'int64', shape: ['batch', 'sequence'] }),
    ).toEqual([1, 8]);
    expect(
      concreteShape({
        name: 'past_key_values.0.key',
        dtype: 'float32',
        shape: ['batch_size', 12, 'past_sequence_length', 64],
      }),
    ).toEqual([1, 12, 0, 64]);
  });
});

describe('parseShape', () => {
  const declared = ['batch', 'sequence', 768];

  it('accepts integers that keep the rank and fixed dims', () => {
    expect(parseShape('2, 16 768', declared)).toEqual([2, 16, 768]);
    expect(parseShape('1, 0, 768', declared)).toEqual([1, 0, 768]);
  });

  it('rejects malformed, wrong-rank and changed-fixed shapes', () => {
    expect(parseShape('1, x, 768', declared)).toMatch(/0 이상의 정수/);
    expect(parseShape('1.5, 2, 768', declared)).toMatch(/0 이상의 정수/);
    expect(parseShape('-1, 2, 768', declared)).toMatch(/0 이상의 정수/);
    expect(parseShape('', declared)).toMatch(/0 이상의 정수/);
    expect(parseShape('1, 8', declared)).toMatch(/3차원/);
    expect(parseShape('1, 8, 512', declared)).toMatch(/3번째 차원은 768/);
  });

  it('accepts any rank when the declared shape is unknown', () => {
    expect(parseShape('4 5 6', null)).toEqual([4, 5, 6]);
  });
});

describe('defaultValues', () => {
  it('fills masks with 1 and token types with 0', () => {
    expect(defaultValues('attention_mask', [1, 3], 1)).toEqual([1, 1, 1]);
    expect(defaultValues('token_type_ids', [1, 3], 1)).toEqual([0, 0, 0]);
    expect(defaultValues('segment_ids', [1, 2], 1)).toEqual([0, 0]);
  });

  it('counts position ids along the last axis', () => {
    expect(defaultValues('position_ids', [2, 3], 1)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('makes a BERT-style sentence for input ids', () => {
    expect(defaultValues('input_ids', [1, 5], 1)).toEqual([101, 1, 2, 3, 102]);
    expect(defaultValues('decoder_input_ids', [1, 1], 1)).toEqual([101]);
  });

  it('handles empty dims and falls back to seeded values', () => {
    expect(defaultValues('attention_mask', [1, 0], 1)).toEqual([]);
    expect(defaultValues('input_ids', [1, 0], 1)).toEqual([]);
    expect(defaultValues('pixel_values', [1, 4], 3)).toEqual(seededValues(4, 3));
  });
});

describe('formatValues', () => {
  it('shows whole numbers for integer inputs and three decimals otherwise', () => {
    expect(formatValues([0.4, -0.6, 2], true)).toBe('0, -1, 2');
    expect(formatValues([0.12345, 1], false)).toBe('0.123, 1');
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

describe('fully symbolic image inputs', () => {
  const pixelValues = {
    name: 'pixel_values',
    dtype: 'float32',
    shape: ['batch_size', 'num_channels', 'height', 'width'],
  };

  it('treats a channel-named dim as an RGB image', () => {
    expect(inputKindOf(pixelValues)).toBe('image');
    expect(concreteShape(pixelValues)).toEqual([1, 3, 224, 224]);
  });

  it('keeps other symbolic rank-4 inputs as numbers', () => {
    expect(inputKindOf({ name: 'hidden', dtype: 'float32', shape: ['b', 'h', 's', 'd'] })).toBe(
      'numbers',
    );
  });
});
