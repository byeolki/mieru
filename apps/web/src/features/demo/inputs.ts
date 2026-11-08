import type { TensorInfo } from '@mieru/shared';

export type InputKind = 'image' | 'numbers';

/** Side length used when an image input's height or width is dynamic. */
export const DEFAULT_IMAGE_SIDE = 224;

// ImageNet statistics: most vision models exported from torchvision expect them.
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

export type Normalization = 'none' | 'imagenet';

/** Images are NCHW tensors with 1 or 3 channels; everything else is fed as plain numbers. */
export function inputKindOf(tensor: TensorInfo): InputKind {
  const shape = tensor.shape;
  if (shape?.length === 4 && (shape[1] === 1 || shape[1] === 3)) return 'image';
  return 'numbers';
}

/**
 * Turns a declared shape into concrete dims: the batch is 1, image height and width default to
 * `DEFAULT_IMAGE_SIDE`, and any other unknown dim becomes 1.
 */
export function concreteShape(tensor: TensorInfo): number[] {
  const kind = inputKindOf(tensor);
  return (tensor.shape ?? [1]).map((dim, index) => {
    if (typeof dim === 'number' && dim > 0) return dim;
    if (kind === 'image' && index >= 2) return DEFAULT_IMAGE_SIDE;
    return 1;
  });
}

export function elementCount(shape: readonly number[]): number {
  return shape.reduce((product, dim) => product * dim, 1);
}

/** Converts canvas RGBA pixels to a CHW float tensor in [0, 1], optionally ImageNet-normalized. */
export function rgbaToChw(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3,
  normalization: Normalization,
): Float32Array {
  const plane = width * height;
  const out = new Float32Array(channels * plane);
  for (let pixel = 0; pixel < plane; pixel++) {
    const r = (rgba[pixel * 4] ?? 0) / 255;
    const g = (rgba[pixel * 4 + 1] ?? 0) / 255;
    const b = (rgba[pixel * 4 + 2] ?? 0) / 255;
    const values = channels === 1 ? [0.299 * r + 0.587 * g + 0.114 * b] : [r, g, b];
    values.forEach((value, channel) => {
      const normalized =
        normalization === 'imagenet' && channels === 3
          ? (value - (IMAGENET_MEAN[channel] ?? 0)) / (IMAGENET_STD[channel] ?? 1)
          : value;
      out[channel * plane + pixel] = normalized;
    });
  }
  return out;
}

/** Parses comma, space or newline separated numbers; returns null if any token is not a number. */
export function parseNumbers(text: string): number[] | null {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const values = tokens.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

/** Deterministic pseudo-random values in [-1, 1], so the same seed always gives the same input. */
export function seededValues(count: number, seed = 1): number[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  });
}
