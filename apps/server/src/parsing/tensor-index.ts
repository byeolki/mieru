/**
 * How a tensor's elements are laid out: `raw` is packed little-endian bytes (raw_data,
 * float_data, double_data, safetensors); `varint` is protobuf varints (int32_data, int64_data,
 * uint64_data), one per element.
 */
export type TensorEncoding = 'raw' | 'varint';

/** Where each weight tensor's bytes live; kept server-side for weight statistics and diffs. */
export interface TensorIndexEntry {
  name: string;
  dtype: string;
  shape: number[];
  offset: number;
  length: number;
  encoding: TensorEncoding;
  /** External data file name the bytes live in, or null when they are inside the model file. */
  location: string | null;
}
