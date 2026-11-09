import type { Dim, TensorInfo } from '@mieru/shared';

export type InputKind = 'image' | 'numbers';

/** Side length used when an image input's height or width is dynamic. */
export const DEFAULT_IMAGE_SIDE = 224;

// ImageNet statistics: most vision models exported from torchvision expect them.
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

export type Normalization = 'none' | 'imagenet';

/** Images are NCHW tensors with 1 or 3 channels; everything else is fed as plain numbers. */
const CHANNEL_DIM = /chan/i;
const IMAGE_INPUT_NAME = /pixel|image|img/i;

/**
 * NCHW tensors with 1 or 3 channels are images. Optimum and transformers exports leave every
 * dim symbolic (`[batch_size, num_channels, height, width]`), so a channel-named dim or an
 * image-like input name counts too.
 */
export function inputKindOf(tensor: TensorInfo): InputKind {
  const shape = tensor.shape;
  if (shape?.length !== 4) return 'numbers';
  const channels = shape[1];
  if (channels === 1 || channels === 3) return 'image';
  const isSymbolic = typeof channels === 'string' || channels === null;
  if (!isSymbolic) return 'numbers';
  const looksLikeChannels = typeof channels === 'string' && CHANNEL_DIM.test(channels);
  return looksLikeChannels || IMAGE_INPUT_NAME.test(tensor.name) ? 'image' : 'numbers';
}

/** Symbolic channel count for image inputs: RGB. */
const DEFAULT_IMAGE_CHANNELS = 3;

/** Length used for dynamic sequence dims, long enough for a few tokens without being slow. */
const DEFAULT_SEQUENCE_LENGTH = 8;

// KV-cache inputs start empty on the first decoding step; onnxruntime accepts 0-sized dims.
const DEFAULT_PAST_LENGTH = 0;

const PAST_DIM = /past/;
const BATCH_DIM = /batch/;
const SEQUENCE_DIM = /seq|len|token/;
// Exporters often leave sequence axes unnamed on text inputs.
const TOKEN_INPUT = /input_ids|attention_mask|token_type_ids|position_ids/;

interface DimContext {
  inputName: string;
  axis: number;
  isImage: boolean;
}

function namedDimDefault(name: string, context: DimContext): number {
  const lower = name.trim().toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  if (PAST_DIM.test(lower)) return DEFAULT_PAST_LENGTH;
  if (BATCH_DIM.test(lower)) return 1;
  if (SEQUENCE_DIM.test(lower)) return DEFAULT_SEQUENCE_LENGTH;
  if (lower === '' && context.axis >= 1 && TOKEN_INPUT.test(context.inputName.toLowerCase())) {
    return DEFAULT_SEQUENCE_LENGTH;
  }
  return 1;
}

/**
 * A concrete size for one declared dim. Fixed dims keep their value; image height and width
 * become `DEFAULT_IMAGE_SIDE`; symbolic names are read by convention (batch → 1, sequence or
 * length → `DEFAULT_SEQUENCE_LENGTH`, past (KV cache) → 0). Sums such as
 * `past_sequence_length + 1` add up their terms. Anything else becomes 1.
 */
export function defaultDim(dim: Dim, context: DimContext): number {
  if (typeof dim === 'number' && dim > 0) return dim;
  if (context.isImage && context.axis === 1) return DEFAULT_IMAGE_CHANNELS;
  if (context.isImage && context.axis >= 2) return DEFAULT_IMAGE_SIDE;
  if (typeof dim !== 'string') return namedDimDefault('', context);
  return dim.split('+').reduce((total, term) => total + namedDimDefault(term, context), 0);
}

/** Turns a declared shape into concrete dims with `defaultDim`; an unknown shape becomes `[1]`. */
export function concreteShape(tensor: TensorInfo): number[] {
  const isImage = inputKindOf(tensor) === 'image';
  return (tensor.shape ?? [1]).map((dim, axis) =>
    defaultDim(dim, { inputName: tensor.name, axis, isImage }),
  );
}

export const formatDims = (dims: readonly number[]) => dims.join(', ');

/**
 * Parses a user-edited shape such as `1, 8`. Returns an error message when a token is not a
 * non-negative integer, the rank differs from the declared one, or a fixed dim was changed.
 */
export function parseShape(text: string, declared: readonly Dim[] | null): number[] | string {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const dims = tokens.map(Number);
  if (tokens.length === 0 || !dims.every((dim) => Number.isSafeInteger(dim) && dim >= 0)) {
    return '모양은 0 이상의 정수를 쉼표로 구분해서 적어 주세요.';
  }
  if (!declared) return dims;
  if (dims.length !== declared.length) {
    return `이 입력은 ${declared.length}차원이라 숫자 ${declared.length}개가 필요해요.`;
  }
  const changedAxis = declared.findIndex(
    (dim, axis) => typeof dim === 'number' && dim > 0 && dims[axis] !== dim,
  );
  if (changedAxis >= 0) {
    return `${changedAxis + 1}번째 차원은 ${String(declared[changedAxis])}로 고정돼 있어요.`;
  }
  return dims;
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

const BERT_CLS_ID = 101;
const BERT_SEP_ID = 102;

/** `[CLS] 1 2 … [SEP]` with BERT ids, a plausible sentence for most text encoders. */
function tokenRow(length: number): number[] {
  return Array.from({ length }, (_, position) => {
    if (position === 0) return BERT_CLS_ID;
    if (position === length - 1) return BERT_SEP_ID;
    return position;
  });
}

/** Repeats `row(lastDim)` across every leading axis. */
function alongLastAxis(dims: readonly number[], row: (length: number) => number[]): number[] {
  const lastDim = dims.at(-1) ?? 1;
  const rows = lastDim === 0 ? 0 : elementCount(dims) / lastDim;
  return Array.from({ length: rows }, () => row(lastDim)).flat();
}

/**
 * Starting values for an input, chosen from its name so text models get sensible feeds:
 * masks are all 1, token types 0, position ids count up along the last axis and input ids
 * form a short BERT-style sentence. Anything else gets `seededValues(count, seed)`.
 */
export function defaultValues(name: string, dims: readonly number[], seed: number): number[] {
  const lower = name.toLowerCase();
  const count = elementCount(dims);
  if (lower.includes('mask')) return new Array<number>(count).fill(1);
  if (lower.includes('token_type_ids') || lower.includes('segment')) {
    return new Array<number>(count).fill(0);
  }
  if (lower.includes('position_ids')) {
    return alongLastAxis(dims, (length) => Array.from({ length }, (_, position) => position));
  }
  if (lower.includes('input_ids')) return alongLastAxis(dims, tokenRow);
  return seededValues(count, seed);
}

const FRACTION_DIGITS = 3;

/** Formats values for the editor; integer inputs show whole numbers since they are rounded anyway. */
export function formatValues(values: readonly number[], isInteger: boolean): string {
  return values
    .map((value) =>
      isInteger
        ? String(Math.round(value))
        : Number.isInteger(value)
          ? String(value)
          : value.toFixed(FRACTION_DIGITS),
    )
    .join(', ');
}
