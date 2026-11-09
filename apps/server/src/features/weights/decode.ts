/** Reads one element as a float from a little-endian buffer. */
export interface ElementDecoder {
  bytesPerElement: number;
  read: (buffer: Buffer, offset: number) => number;
}

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
  scratch.setUint32(0, bits << 16);
  return scratch.getFloat32(0);
}

const DECODERS: Record<string, ElementDecoder> = {
  float32: { bytesPerElement: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
  float64: { bytesPerElement: 8, read: (buffer, offset) => buffer.readDoubleLE(offset) },
  float16: {
    bytesPerElement: 2,
    read: (buffer, offset) => halfToFloat(buffer.readUInt16LE(offset)),
  },
  bfloat16: {
    bytesPerElement: 2,
    read: (buffer, offset) => bfloatToFloat(buffer.readUInt16LE(offset)),
  },
  int8: { bytesPerElement: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  uint8: { bytesPerElement: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  int32: { bytesPerElement: 4, read: (buffer, offset) => buffer.readInt32LE(offset) },
};

// safetensors spells dtypes differently from ONNX; both map onto the same decoders.
const ALIASES: Record<string, string> = {
  F32: 'float32',
  F64: 'float64',
  F16: 'float16',
  BF16: 'bfloat16',
  I8: 'int8',
  U8: 'uint8',
  I32: 'int32',
};

/** Decoder for a dtype name from either format, or null when it isn't supported. */
export function decoderFor(dtype: string): ElementDecoder | null {
  return DECODERS[ALIASES[dtype] ?? dtype] ?? null;
}
