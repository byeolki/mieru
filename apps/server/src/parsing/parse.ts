import { open } from 'node:fs/promises';
import type { ParsedModel } from '@mieru/shared';
import { FileByteSource, type ByteSource } from './byte-source.js';
import { buildOnnxModel } from './onnx/build.js';
import { scanOnnxModel } from './onnx/scan.js';
import { parseSafetensors } from './safetensors/parse-safetensors.js';
import type { TensorIndexEntry } from './tensor-index.js';

export type ModelFormat = 'onnx' | 'safetensors';

export interface ParseResult {
  parsed: ParsedModel;
  tensorIndex: TensorIndexEntry[];
}

export async function parseFromSource(
  source: ByteSource,
  format: ModelFormat,
): Promise<ParseResult> {
  if (format === 'safetensors') return parseSafetensors(source);
  return buildOnnxModel(await scanOnnxModel(source), source.size);
}

/** Parses a model file on disk through positioned reads (never loads the whole file). */
export async function parseModelFile(filePath: string, format: ModelFormat): Promise<ParseResult> {
  const handle = await open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    return await parseFromSource(new FileByteSource(handle, size), format);
  } finally {
    await handle.close();
  }
}
