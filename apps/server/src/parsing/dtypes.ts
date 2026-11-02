import { ParseError } from './errors.js';

interface DtypeInfo {
  name: string;
  /** Bits per element (sub-byte types like int4 are 4). */
  bits: number;
}

/** ONNX TensorProto.DataType enum values. */
const ONNX_DTYPES: Record<number, DtypeInfo> = {
  1: { name: 'float32', bits: 32 },
  2: { name: 'uint8', bits: 8 },
  3: { name: 'int8', bits: 8 },
  4: { name: 'uint16', bits: 16 },
  5: { name: 'int16', bits: 16 },
  6: { name: 'int32', bits: 32 },
  7: { name: 'int64', bits: 64 },
  8: { name: 'string', bits: 0 },
  9: { name: 'bool', bits: 8 },
  10: { name: 'float16', bits: 16 },
  11: { name: 'float64', bits: 64 },
  12: { name: 'uint32', bits: 32 },
  13: { name: 'uint64', bits: 64 },
  14: { name: 'complex64', bits: 64 },
  15: { name: 'complex128', bits: 128 },
  16: { name: 'bfloat16', bits: 16 },
  17: { name: 'float8e4m3fn', bits: 8 },
  18: { name: 'float8e4m3fnuz', bits: 8 },
  19: { name: 'float8e5m2', bits: 8 },
  20: { name: 'float8e5m2fnuz', bits: 8 },
  21: { name: 'uint4', bits: 4 },
  22: { name: 'int4', bits: 4 },
  23: { name: 'float4e2m1', bits: 4 },
};

export function onnxDtype(code: number): DtypeInfo | null {
  return ONNX_DTYPES[code] ?? null;
}

/** safetensors dtype names and their element sizes in bytes. */
const SAFETENSORS_DTYPE_BYTES: Record<string, number> = {
  BOOL: 1,
  U8: 1,
  I8: 1,
  F8_E4M3: 1,
  F8_E5M2: 1,
  I16: 2,
  U16: 2,
  F16: 2,
  BF16: 2,
  I32: 4,
  U32: 4,
  F32: 4,
  I64: 8,
  U64: 8,
  F64: 8,
};

export function safetensorsDtypeBytes(dtype: string): number {
  const size = SAFETENSORS_DTYPE_BYTES[dtype];
  if (size === undefined) throw new ParseError('unsupported_dtype', `Unsupported dtype ${dtype}`);
  return size;
}

/** Product of dims as a safe integer; throws if the shape implies an impossible size. */
export function elementCount(shape: readonly number[]): number {
  let count = 1;
  for (const dim of shape) {
    if (!Number.isSafeInteger(dim) || dim < 0)
      throw new ParseError('offsets_invalid', 'Invalid dimension');
    count *= dim;
    if (!Number.isSafeInteger(count)) throw new ParseError('limits_exceeded', 'Tensor too large');
  }
  return count;
}
