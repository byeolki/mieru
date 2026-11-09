/** Input element types the demo can build tensors for. */
const FEED_DTYPES = [
  'float32',
  'float64',
  'float16',
  'int64',
  'int32',
  'int8',
  'uint8',
  'bool',
] as const;
export type FeedDtype = (typeof FEED_DTYPES)[number];

export type FeedValues =
  | { dtype: 'float32'; data: Float32Array }
  | { dtype: 'float64'; data: Float64Array }
  // onnxruntime-web accepts float16 as raw bit patterns in a Uint16Array whether or not the
  // browser has Float16Array, so that is the one representation that works everywhere.
  | { dtype: 'float16'; data: Uint16Array }
  | { dtype: 'int64'; data: BigInt64Array }
  | { dtype: 'int32'; data: Int32Array }
  | { dtype: 'int8'; data: Int8Array }
  | { dtype: 'uint8'; data: Uint8Array }
  | { dtype: 'bool'; data: Uint8Array };

const FLOAT_DTYPES: ReadonlySet<FeedDtype> = new Set(['float32', 'float64', 'float16']);

function isFeedDtype(dtype: string): dtype is FeedDtype {
  return (FEED_DTYPES as readonly string[]).includes(dtype);
}

/**
 * The tensor type to build for a declared input dtype. An unknown dtype (null) is fed as
 * float32, the most common case; returns null for types the demo cannot build (string, ...).
 */
export function feedDtypeOf(dtype: string | null): FeedDtype | null {
  if (dtype === null) return 'float32';
  return isFeedDtype(dtype) ? dtype : null;
}

export function isFloatDtype(dtype: FeedDtype): boolean {
  return FLOAT_DTYPES.has(dtype);
}

const INT8_RANGE = [-128, 127] as const;
const UINT8_RANGE = [0, 255] as const;
const INT32_RANGE = [-(2 ** 31), 2 ** 31 - 1] as const;

function toInteger(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Packs plain numbers into the typed array the runtime expects for `dtype`, rounding and clamping integers. */
export function toFeedValues(values: ArrayLike<number>, dtype: FeedDtype): FeedValues {
  switch (dtype) {
    case 'float32':
      return { dtype, data: Float32Array.from(values) };
    case 'float64':
      return { dtype, data: Float64Array.from(values) };
    case 'float16':
      return { dtype, data: Uint16Array.from(values, float32ToFloat16Bits) };
    case 'int64':
      return { dtype, data: BigInt64Array.from(values, (value) => BigInt(Math.round(value))) };
    case 'int32':
      return { dtype, data: Int32Array.from(values, (value) => toInteger(value, INT32_RANGE)) };
    case 'int8':
      return { dtype, data: Int8Array.from(values, (value) => toInteger(value, INT8_RANGE)) };
    case 'uint8':
      return { dtype, data: Uint8Array.from(values, (value) => toInteger(value, UINT8_RANGE)) };
    case 'bool':
      return { dtype, data: Uint8Array.from(values, (value) => (value === 0 ? 0 : 1)) };
  }
}

const F16_EXPONENT_BIAS = 15;
const F32_EXPONENT_BIAS = 127;
const F16_MAX_EXPONENT = 0x1f;
const F16_INFINITY = 0x7c00;
const F16_QUIET_NAN = 0x7e00;
const F32_MANTISSA_BITS = 23;
const F16_MANTISSA_BITS = 10;
const DROPPED_MANTISSA_BITS = F32_MANTISSA_BITS - F16_MANTISSA_BITS;

const scratchFloat = new Float32Array(1);
const scratchBits = new Uint32Array(scratchFloat.buffer);

/** Drops `shift` low bits of `value`, rounding half to even like IEEE 754 conversions do. */
function shiftRoundingToEven(value: number, shift: number): number {
  const kept = Math.floor(value / 2 ** shift);
  const remainder = value - kept * 2 ** shift;
  const half = 2 ** (shift - 1);
  return remainder > half || (remainder === half && kept % 2 === 1) ? kept + 1 : kept;
}

/** IEEE 754 half-precision bits for `value`, rounded to nearest even. */
export function float32ToFloat16Bits(value: number): number {
  scratchFloat[0] = value;
  const bits = scratchBits[0] ?? 0;
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> F32_MANTISSA_BITS) & 0xff;
  const mantissa = bits & 0x7fffff;
  if (exponent === 0xff) return sign | (mantissa === 0 ? F16_INFINITY : F16_QUIET_NAN);
  const halfExponent = exponent - F32_EXPONENT_BIAS + F16_EXPONENT_BIAS;
  if (halfExponent >= F16_MAX_EXPONENT) return sign | F16_INFINITY;
  if (halfExponent <= 0) {
    // Subnormal half: the implicit leading 1 becomes explicit and shifts further right.
    const shift = DROPPED_MANTISSA_BITS + 1 - halfExponent;
    if (shift > F32_MANTISSA_BITS + 1) return sign;
    return sign | shiftRoundingToEven(mantissa | 0x800000, shift);
  }
  // A rounding carry out of the mantissa correctly bumps the exponent (up to infinity).
  const rounded = shiftRoundingToEven(mantissa, DROPPED_MANTISSA_BITS);
  return sign | ((halfExponent << F16_MANTISSA_BITS) + rounded);
}

/** Decodes IEEE 754 half-precision bits. */
export function float16BitsToFloat32(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> F16_MANTISSA_BITS) & F16_MAX_EXPONENT;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** (1 - F16_EXPONENT_BIAS - F16_MANTISSA_BITS);
  if (exponent === F16_MAX_EXPONENT) return mantissa === 0 ? sign * Infinity : NaN;
  return sign * (1 + mantissa / 2 ** F16_MANTISSA_BITS) * 2 ** (exponent - F16_EXPONENT_BIAS);
}

type NumericTensorData =
  | Float32Array
  | Float64Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Int8Array
  | Uint8Array
  | BigInt64Array
  | BigUint64Array;

/**
 * Copies runtime output to float32 for display. 64-bit integers become (possibly rounded)
 * numbers, booleans 0/1, and float16 delivered as raw bits is decoded.
 */
export function toDisplayValues(type: string, data: NumericTensorData): Float32Array {
  if (data instanceof BigInt64Array || data instanceof BigUint64Array) {
    return Float32Array.from(data, (value) => Number(value));
  }
  if (type === 'float16' && data instanceof Uint16Array) {
    return Float32Array.from(data, float16BitsToFloat32);
  }
  return Float32Array.from(data);
}
