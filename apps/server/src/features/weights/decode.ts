import type { TensorEncoding } from '../../parsing/tensor-index.js';

/** Receives one decoded element value. */
export type EmitElement = (value: number) => void;

/** Decodes a tensor payload fed one chunk at a time, carrying partial elements across chunks. */
export interface ElementReader {
  /** Decodes `chunk`, calling `emit` per complete element. The chunk may be reused afterwards. */
  push: (chunk: Buffer, emit: EmitElement) => void;
}

/**
 * How to decode one dtype in one encoding. Packed codecs have fixed-size units that can be
 * addressed directly; varint codecs have variable-width elements and must be read in order or
 * resynchronized (see {@link resynchronized}).
 */
export type TensorCodec =
  | {
      kind: 'packed';
      /** Bytes in one addressable unit. */
      unitBytes: number;
      /** Elements in one unit: 2 for int4/uint4, 1 otherwise. */
      unitElements: number;
      createReader: () => ElementReader;
    }
  | { kind: 'varint'; createReader: () => ElementReader };

type DecodeUnit = (buffer: Buffer, offset: number, emit: EmitElement) => void;
/** Maps one varint, split into its low and high 32 bits, to element values. */
type DecodeVarint = (low: number, high: number, emit: EmitElement) => void;

const TWO_POW_32 = 2 ** 32;
const VARINT_CONTINUATION = 0x80;
const VARINT_PAYLOAD = 0x7f;
const VARINT_MAX_SHIFT = 64;

function halfToFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

const scratch = new DataView(new ArrayBuffer(4));

function bfloatToFloat(bits: number): number {
  // bfloat16 is the top half of a float32.
  scratch.setUint32(0, (bits & 0xffff) << 16);
  return scratch.getFloat32(0);
}

/** Value of a sign-exponent-mantissa byte, ignoring the type's NaN and infinity encodings. */
function minifloat(bits: number, mantissaBits: number, bias: number): number {
  const sign = bits & 0x80 ? -1 : 1;
  const exponent = (bits & 0x7f) >> mantissaBits;
  const mantissa = (bits & ((1 << mantissaBits) - 1)) / (1 << mantissaBits);
  if (exponent === 0) return sign * 2 ** (1 - bias) * mantissa;
  return sign * 2 ** (exponent - bias) * (1 + mantissa);
}

// Float8 layouts follow the ONNX spec (docs/Float8.md): the fn types have no infinity, and
// the fnuz types shift the bias by one and spend negative zero (0x80) on their only NaN.
const FNUZ_NAN = 0x80;

function float8e4m3fn(bits: number): number {
  return (bits & 0x7f) === 0x7f ? Number.NaN : minifloat(bits, 3, 7);
}

function float8e4m3fnuz(bits: number): number {
  return bits === FNUZ_NAN ? Number.NaN : minifloat(bits, 3, 8);
}

function float8e5m2(bits: number): number {
  if ((bits & 0x7c) !== 0x7c) return minifloat(bits, 2, 15);
  if (bits & 0x03) return Number.NaN;
  return bits & 0x80 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
}

function float8e5m2fnuz(bits: number): number {
  return bits === FNUZ_NAN ? Number.NaN : minifloat(bits, 2, 16);
}

const int4 = (nibble: number) => (nibble & 0x8 ? nibble - 0x10 : nibble);
const uint4 = (nibble: number) => nibble;

/** Emits the low nibble, then the high one, of each byte (ONNX packs int4 low nibble first). */
const emitNibbles = (byte: number, toValue: (nibble: number) => number, emit: EmitElement) => {
  emit(toValue(byte & 0x0f));
  emit(toValue((byte >> 4) & 0x0f));
};

// Two exact 32-bit halves combine with a single rounding, matching Number(bigint).
const signed64 = (low: number, high: number) => (high | 0) * TWO_POW_32 + (low >>> 0);
const unsigned64 = (low: number, high: number) => (high >>> 0) * TWO_POW_32 + (low >>> 0);

interface PackedSpec {
  unitBytes: number;
  unitElements: number;
  decodeUnit: DecodeUnit;
}

const single = (
  unitBytes: number,
  read: (buffer: Buffer, offset: number) => number,
): PackedSpec => ({
  unitBytes,
  unitElements: 1,
  decodeUnit: (buffer, offset, emit) => emit(read(buffer, offset)),
});

const RAW: Record<string, PackedSpec> = {
  float32: single(4, (buffer, offset) => buffer.readFloatLE(offset)),
  float64: single(8, (buffer, offset) => buffer.readDoubleLE(offset)),
  float16: single(2, (buffer, offset) => halfToFloat(buffer.readUInt16LE(offset))),
  bfloat16: single(2, (buffer, offset) => bfloatToFloat(buffer.readUInt16LE(offset))),
  int8: single(1, (buffer, offset) => buffer.readInt8(offset)),
  uint8: single(1, (buffer, offset) => buffer.readUInt8(offset)),
  int16: single(2, (buffer, offset) => buffer.readInt16LE(offset)),
  uint16: single(2, (buffer, offset) => buffer.readUInt16LE(offset)),
  int32: single(4, (buffer, offset) => buffer.readInt32LE(offset)),
  uint32: single(4, (buffer, offset) => buffer.readUInt32LE(offset)),
  int64: single(8, (buffer, offset) =>
    signed64(buffer.readUInt32LE(offset), buffer.readUInt32LE(offset + 4)),
  ),
  uint64: single(8, (buffer, offset) =>
    unsigned64(buffer.readUInt32LE(offset), buffer.readUInt32LE(offset + 4)),
  ),
  bool: single(1, (buffer, offset) => (buffer[offset] ? 1 : 0)),
  float8e4m3fn: single(1, (buffer, offset) => float8e4m3fn(buffer.readUInt8(offset))),
  float8e4m3fnuz: single(1, (buffer, offset) => float8e4m3fnuz(buffer.readUInt8(offset))),
  float8e5m2: single(1, (buffer, offset) => float8e5m2(buffer.readUInt8(offset))),
  float8e5m2fnuz: single(1, (buffer, offset) => float8e5m2fnuz(buffer.readUInt8(offset))),
  int4: {
    unitBytes: 1,
    unitElements: 2,
    decodeUnit: (buffer, offset, emit) => emitNibbles(buffer.readUInt8(offset), int4, emit),
  },
  uint4: {
    unitBytes: 1,
    unitElements: 2,
    decodeUnit: (buffer, offset, emit) => emitNibbles(buffer.readUInt8(offset), uint4, emit),
  },
};

// int32_data keeps narrower types (and float16/bfloat16/float8 bit patterns) in the low bits of
// each value; negative int32s are sign-extended to 64 bits, so the low word is still exact.
const fromInt32 =
  (toValue: (int32: number) => number): DecodeVarint =>
  (low, _high, emit) =>
    emit(toValue(low | 0));

const VARINT: Record<string, DecodeVarint> = {
  int8: fromInt32((value) => value),
  uint8: fromInt32((value) => value),
  int16: fromInt32((value) => value),
  uint16: fromInt32((value) => value),
  int32: fromInt32((value) => value),
  bool: fromInt32((value) => (value ? 1 : 0)),
  float16: fromInt32((value) => halfToFloat(value & 0xffff)),
  bfloat16: fromInt32((value) => bfloatToFloat(value)),
  float8e4m3fn: fromInt32((value) => float8e4m3fn(value & 0xff)),
  float8e4m3fnuz: fromInt32((value) => float8e4m3fnuz(value & 0xff)),
  float8e5m2: fromInt32((value) => float8e5m2(value & 0xff)),
  float8e5m2fnuz: fromInt32((value) => float8e5m2fnuz(value & 0xff)),
  // Packed int4 tensors store two elements per int32_data value, low nibble first.
  int4: (low, _high, emit) => emitNibbles(low & 0xff, int4, emit),
  uint4: (low, _high, emit) => emitNibbles(low & 0xff, uint4, emit),
  int64: (low, high, emit) => emit(signed64(low, high)),
  uint32: (low, high, emit) => emit(unsigned64(low, high)),
  uint64: (low, high, emit) => emit(unsigned64(low, high)),
};

// safetensors spells dtypes differently from ONNX; both map onto the same decoders.
const ALIASES: Record<string, string> = {
  F32: 'float32',
  F64: 'float64',
  F16: 'float16',
  BF16: 'bfloat16',
  I8: 'int8',
  U8: 'uint8',
  I16: 'int16',
  U16: 'uint16',
  I32: 'int32',
  U32: 'uint32',
  I64: 'int64',
  U64: 'uint64',
  BOOL: 'bool',
  // PyTorch's float8_e4m3fn and float8_e5m2, the only float8 types safetensors writes.
  F8_E4M3: 'float8e4m3fn',
  F8_E5M2: 'float8e5m2',
};

function packedReader({ unitBytes, decodeUnit }: PackedSpec): ElementReader {
  const pending = Buffer.alloc(unitBytes);
  let pendingLength = 0;
  return {
    push(chunk, emit) {
      let offset = 0;
      if (pendingLength > 0) {
        const taken = Math.min(unitBytes - pendingLength, chunk.length);
        chunk.copy(pending, pendingLength, 0, taken);
        pendingLength += taken;
        offset = taken;
        if (pendingLength < unitBytes) return;
        decodeUnit(pending, 0, emit);
        pendingLength = 0;
      }
      for (; offset + unitBytes <= chunk.length; offset += unitBytes)
        decodeUnit(chunk, offset, emit);
      pendingLength = chunk.copy(pending, 0, offset);
    },
  };
}

function varintReader(decodeVarint: DecodeVarint): ElementReader {
  let low = 0;
  let high = 0;
  let shift = 0;
  return {
    push(chunk, emit) {
      for (const byte of chunk) {
        const bits = byte & VARINT_PAYLOAD;
        // Bits past 64 can't occur in valid protobuf; drop them rather than wrap around.
        if (shift < 32) {
          low |= bits << shift;
          if (shift > 25) high |= bits >>> (32 - shift);
        } else if (shift < VARINT_MAX_SHIFT) {
          high |= bits << (shift - 32);
        }
        if (byte & VARINT_CONTINUATION) {
          shift += 7;
          continue;
        }
        decodeVarint(low, high, emit);
        low = 0;
        high = 0;
        shift = 0;
      }
    },
  };
}

/**
 * Wraps a varint reader whose stream starts at an arbitrary byte: drops bytes up to and
 * including the first one that ends a varint, then decodes the rest normally.
 */
export function resynchronized(reader: ElementReader): ElementReader {
  let isSynced = false;
  return {
    push(chunk, emit) {
      if (isSynced) {
        reader.push(chunk, emit);
        return;
      }
      const end = chunk.findIndex((byte) => (byte & VARINT_CONTINUATION) === 0);
      if (end === -1) return;
      isSynced = true;
      reader.push(chunk.subarray(end + 1), emit);
    },
  };
}

/** Codec for a dtype name from either format in the given encoding, or null when unsupported. */
export function codecFor(dtype: string, encoding: TensorEncoding): TensorCodec | null {
  const name = ALIASES[dtype] ?? dtype;
  if (encoding === 'varint') {
    const decodeVarint = VARINT[name];
    return decodeVarint ? { kind: 'varint', createReader: () => varintReader(decodeVarint) } : null;
  }
  const spec = RAW[name];
  if (!spec) return null;
  return {
    kind: 'packed',
    unitBytes: spec.unitBytes,
    unitElements: spec.unitElements,
    createReader: () => packedReader(spec),
  };
}
