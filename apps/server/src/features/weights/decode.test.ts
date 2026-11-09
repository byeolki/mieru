import { describe, expect, it } from 'vitest';
import type { TensorEncoding } from '../../parsing/tensor-index.js';
import { codecFor, resynchronized, type ElementReader } from './decode.js';

function requireReader(dtype: string, encoding: TensorEncoding): ElementReader {
  const codec = codecFor(dtype, encoding);
  if (!codec) throw new Error(`no codec for ${dtype}/${encoding}`);
  return codec.createReader();
}

function readAll(reader: ElementReader, chunks: readonly Buffer[]): number[] {
  const values: number[] = [];
  for (const chunk of chunks) reader.push(chunk, (value) => values.push(value));
  return values;
}

const decode = (dtype: string, encoding: TensorEncoding, bytes: Buffer) =>
  readAll(requireReader(dtype, encoding), [bytes]);

/** Protobuf varint of a 64-bit two's complement value, as int32_data/int64_data write it. */
function varint(value: bigint): Buffer {
  let remaining = BigInt.asUintN(64, value);
  const bytes: number[] = [];
  do {
    const low = Number(remaining & 0x7fn);
    remaining >>= 7n;
    bytes.push(remaining ? low | 0x80 : low);
  } while (remaining);
  return Buffer.from(bytes);
}

const varints = (values: readonly bigint[]) => Buffer.concat(values.map(varint));

function rawOf(write: (buffer: Buffer, offset: number, value: number) => void, size: number) {
  return (values: readonly number[]) => {
    const buffer = Buffer.alloc(values.length * size);
    values.forEach((value, index) => write(buffer, index * size, value));
    return buffer;
  };
}

describe('codecFor with raw bytes', () => {
  it.each([
    ['float32', rawOf((b, o, v) => b.writeFloatLE(v, o), 4), [1.5, -2.25]],
    ['float64', rawOf((b, o, v) => b.writeDoubleLE(v, o), 8), [Math.PI, -1e300]],
    ['int8', rawOf((b, o, v) => b.writeInt8(v, o), 1), [-128, 127]],
    ['uint8', rawOf((b, o, v) => b.writeUInt8(v, o), 1), [0, 255]],
    ['int16', rawOf((b, o, v) => b.writeInt16LE(v, o), 2), [-32768, 300]],
    ['uint16', rawOf((b, o, v) => b.writeUInt16LE(v, o), 2), [65535, 1]],
    ['int32', rawOf((b, o, v) => b.writeInt32LE(v, o), 4), [-2147483648, 70000]],
    ['uint32', rawOf((b, o, v) => b.writeUInt32LE(v, o), 4), [4294967295, 7]],
  ])('reads %s', (dtype, encode, values) => {
    expect(decode(dtype, 'raw', encode(values))).toEqual(values);
  });

  it('reads 64-bit integers, rounding past 2^53 like Number()', () => {
    const signed = Buffer.alloc(24);
    signed.writeBigInt64LE(-5n, 0);
    signed.writeBigInt64LE(-(2n ** 63n), 8);
    signed.writeBigInt64LE(2n ** 53n + 1n, 16);
    expect(decode('int64', 'raw', signed)).toEqual([-5, -(2 ** 63), Number(2n ** 53n + 1n)]);
    const unsigned = Buffer.alloc(16);
    unsigned.writeBigUInt64LE(2n ** 64n - 1n, 0);
    unsigned.writeBigUInt64LE(123n, 8);
    expect(decode('uint64', 'raw', unsigned)).toEqual([Number(2n ** 64n - 1n), 123]);
  });

  it('reads float16 and bfloat16, including subnormals and infinities', () => {
    // 1.0, smallest subnormal, -infinity
    expect(decode('float16', 'raw', Buffer.from([0x00, 0x3c, 0x01, 0x00, 0x00, 0xfc]))).toEqual([
      1,
      2 ** -24,
      Number.NEGATIVE_INFINITY,
    ]);
    // -1.0, 3.0 in bfloat16
    expect(decode('bfloat16', 'raw', Buffer.from([0x80, 0xbf, 0x40, 0x40]))).toEqual([-1, 3]);
  });

  it('reads bool bytes as 0 and 1', () => {
    expect(decode('bool', 'raw', Buffer.from([0, 1, 2]))).toEqual([0, 1, 1]);
  });

  it('unpacks int4 and uint4 low nibble first', () => {
    const bytes = Buffer.from([0x8f, 0x71]);
    expect(decode('int4', 'raw', bytes)).toEqual([-1, -8, 1, 7]);
    expect(decode('uint4', 'raw', bytes)).toEqual([15, 8, 1, 7]);
    expect(codecFor('int4', 'raw')).toMatchObject({
      kind: 'packed',
      unitBytes: 1,
      unitElements: 2,
    });
  });
});

describe('float8 decoding', () => {
  const float8 = (dtype: string, bits: readonly number[]) =>
    decode(dtype, 'raw', Buffer.from(bits));

  it('decodes float8e4m3fn: no infinity, NaN only at S.1111.111', () => {
    const [one, max, subnormal, negativeZero, nan, negativeNan, negativeMax] = float8(
      'float8e4m3fn',
      [0x38, 0x7e, 0x01, 0x80, 0x7f, 0xff, 0xfe],
    );
    expect([one, max, subnormal, negativeMax]).toEqual([1, 448, 2 ** -9, -448]);
    expect(Object.is(negativeZero, -0)).toBe(true);
    expect(nan).toBeNaN();
    expect(negativeNan).toBeNaN();
    // Exponent 1111 with other mantissas is a normal number, not infinity.
    expect(float8('float8e4m3fn', [0x78])).toEqual([256]);
  });

  it('decodes float8e4m3fnuz: bias 8, NaN only at 0x80, no negative zero', () => {
    const [one, max, subnormal, negativeMax, nan, zero] = float8(
      'float8e4m3fnuz',
      [0x40, 0x7f, 0x01, 0xff, 0x80, 0x00],
    );
    expect([one, max, subnormal, negativeMax]).toEqual([1, 240, 2 ** -10, -240]);
    expect(nan).toBeNaN();
    expect(Object.is(zero, 0)).toBe(true);
  });

  it('decodes float8e5m2 like IEEE with infinities and NaN', () => {
    const [one, max, subnormal, negativeZero, infinity, negativeInfinity, nan] = float8(
      'float8e5m2',
      [0x3c, 0x7b, 0x01, 0x80, 0x7c, 0xfc, 0x7d],
    );
    expect([one, max, subnormal, infinity, negativeInfinity]).toEqual([
      1,
      57344,
      2 ** -16,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]);
    expect(Object.is(negativeZero, -0)).toBe(true);
    expect(nan).toBeNaN();
  });

  it('decodes float8e5m2fnuz: bias 16, no infinity, NaN only at 0x80', () => {
    const [one, max, subnormal, topExponent, nan] = float8(
      'float8e5m2fnuz',
      [0x40, 0x7f, 0x01, 0xfc, 0x80],
    );
    expect([one, max, subnormal, topExponent]).toEqual([1, 57344, 2 ** -17, -32768]);
    expect(nan).toBeNaN();
  });
});

describe('codecFor with varints', () => {
  it('reads int32_data values, including 10-byte negative int32s', () => {
    const bytes = varints([-1n, 300n, -2147483648n, 2147483647n]);
    expect(varint(-1n)).toHaveLength(10);
    expect(decode('int32', 'varint', bytes)).toEqual([-1, 300, -2147483648, 2147483647]);
  });

  it.each([
    ['int8', [-5n, 127n], [-5, 127]],
    ['uint8', [255n, 0n], [255, 0]],
    ['int16', [-32768n, 5n], [-32768, 5]],
    ['uint16', [65535n], [65535]],
    ['bool', [0n, 1n], [0, 1]],
    ['float16', [0x3c00n, 0xc000n], [1, -2]],
    ['bfloat16', [0xbf80n, 0x4040n], [-1, 3]],
    ['float8e4m3fn', [0x7en, 0x01n], [448, 2 ** -9]],
    ['float8e4m3fnuz', [0x7fn], [240]],
    ['float8e5m2', [0x7bn, 0x7cn], [57344, Number.POSITIVE_INFINITY]],
    ['float8e5m2fnuz', [0x7fn], [57344]],
  ])('maps int32_data %s values', (dtype, stored, expected) => {
    expect(decode(dtype, 'varint', varints(stored))).toEqual(expected);
  });

  it('reads float8 NaN bit patterns from int32_data', () => {
    expect(decode('float8e4m3fnuz', 'varint', varint(0x80n))).toEqual([Number.NaN]);
    expect(decode('float8e4m3fn', 'varint', varint(0xffn))).toEqual([Number.NaN]);
  });

  it('unpacks two int4/uint4 elements per int32_data value', () => {
    const bytes = varints([0x8fn, 0x71n]);
    expect(decode('int4', 'varint', bytes)).toEqual([-1, -8, 1, 7]);
    expect(decode('uint4', 'varint', bytes)).toEqual([15, 8, 1, 7]);
  });

  it('reads int64_data as two’s complement 64-bit', () => {
    const bytes = varints([-2n, -(2n ** 63n), 2n ** 53n + 1n, 0n]);
    expect(decode('int64', 'varint', bytes)).toEqual([-2, -(2 ** 63), Number(2n ** 53n + 1n), 0]);
  });

  it('reads uint64_data for uint32 and uint64', () => {
    expect(decode('uint32', 'varint', varints([4294967295n, 1n]))).toEqual([4294967295, 1]);
    expect(decode('uint64', 'varint', varints([2n ** 64n - 1n, 2n ** 32n]))).toEqual([
      Number(2n ** 64n - 1n),
      2 ** 32,
    ]);
  });
});

describe('dtype names', () => {
  it.each([
    ['F32', 'float32'],
    ['F64', 'float64'],
    ['F16', 'float16'],
    ['BF16', 'bfloat16'],
    ['I8', 'int8'],
    ['U8', 'uint8'],
    ['I16', 'int16'],
    ['U16', 'uint16'],
    ['I32', 'int32'],
    ['U32', 'uint32'],
    ['I64', 'int64'],
    ['U64', 'uint64'],
    ['BOOL', 'bool'],
    ['F8_E4M3', 'float8e4m3fn'],
    ['F8_E5M2', 'float8e5m2'],
  ])('decodes safetensors %s like %s', (alias, onnx) => {
    const bytes = Buffer.from([0x01, 0x3c, 0x80, 0xbf, 0x7b, 0x7c, 0xff, 0x00]);
    expect(decode(alias, 'raw', bytes)).toEqual(decode(onnx, 'raw', bytes));
  });

  it.each([
    ['string', 'raw'],
    ['complex64', 'raw'],
    ['complex128', 'raw'],
    ['float4e2m1', 'raw'],
    ['float32', 'varint'],
    ['float64', 'varint'],
    ['F8_E8M0', 'raw'],
    ['mystery', 'varint'],
  ] as const)('rejects %s in %s form', (dtype, encoding) => {
    expect(codecFor(dtype, encoding)).toBeNull();
  });
});

/** Every split of `bytes` into two chunks, plus one byte per chunk. */
function splits(bytes: Buffer): Buffer[][] {
  const pairs = Array.from({ length: bytes.length + 1 }, (_, at) => [
    bytes.subarray(0, at),
    bytes.subarray(at),
  ]);
  const singles = Array.from(bytes, (_, index) => bytes.subarray(index, index + 1));
  return [...pairs, singles];
}

describe('chunk boundaries', () => {
  it('carries partial varints across chunks', () => {
    const bytes = varints([-1n, 300n, 5n, -(2n ** 40n), 0n]);
    for (const chunks of splits(bytes))
      expect(readAll(requireReader('int64', 'varint'), chunks)).toEqual([
        -1,
        300,
        5,
        -(2 ** 40),
        0,
      ]);
  });

  it('carries int4 bytes and partial multi-byte elements across chunks', () => {
    const nibbles = Buffer.from([0x8f, 0x71, 0x00, 0x7f]);
    for (const chunks of splits(nibbles))
      expect(readAll(requireReader('int4', 'raw'), chunks)).toEqual([-1, -8, 1, 7, 0, 0, -1, 7]);
    const floats = rawOf((b, o, v) => b.writeDoubleLE(v, o), 8)([1.25, -3.5]);
    for (const chunks of splits(floats))
      expect(readAll(requireReader('float64', 'raw'), chunks)).toEqual([1.25, -3.5]);
  });

  it('carries packed int4 varints across chunks', () => {
    const bytes = varints([0x8fn, 0x71n]);
    for (const chunks of splits(bytes))
      expect(readAll(requireReader('int4', 'varint'), chunks)).toEqual([-1, -8, 1, 7]);
  });
});

describe('resynchronized', () => {
  // 300 takes 2 bytes, -1 takes 10, the rest 1 each.
  const bytes = varints([300n, 1n, -1n, 5n, 6n]);

  const resyncFrom = (start: number, chunks: (tail: Buffer) => Buffer[] = (tail) => [tail]) =>
    readAll(resynchronized(requireReader('int32', 'varint')), chunks(bytes.subarray(start)));

  it('skips the rest of a varint the stream starts inside', () => {
    expect(resyncFrom(1)).toEqual([1, -1, 5, 6]);
    expect(resyncFrom(4)).toEqual([5, 6]);
  });

  it('keeps the first element when started one byte before a varint boundary', () => {
    // Byte 2 is where `1` begins, so starting at byte 1 (the end of 300) lands right on it.
    expect(resyncFrom(2 - 1)).toEqual([1, -1, 5, 6]);
    expect(resyncFrom(3 - 1)).toEqual([-1, 5, 6]);
  });

  it('resynchronizes when the skipped bytes span chunks', () => {
    const oneByteChunks = (tail: Buffer) =>
      Array.from(tail, (_, index) => tail.subarray(index, index + 1));
    expect(resyncFrom(4, oneByteChunks)).toEqual([5, 6]);
    expect(resyncFrom(4, (tail) => [tail.subarray(0, 3), tail.subarray(3)])).toEqual([5, 6]);
  });

  it('emits nothing while no varint has ended', () => {
    expect(resyncFrom(3, (tail) => [tail.subarray(0, 5)])).toEqual([]);
  });
});
