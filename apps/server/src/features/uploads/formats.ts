import type { ModelFormat } from '@mieru/shared';
import type { AppConfig } from '../../config.js';

const CONVERTIBLE_EXTENSIONS = ['.pt', '.pth', '.bin', '.pkl', '.ckpt'];

export type FormatCheck =
  | { ok: true; format: ModelFormat }
  | { ok: false; code: 'unsupported_format'; hint: 'convert' | null };

/** Decides the format from the file name; pickle-based formats get a conversion hint. */
export function formatFromFilename(filename: string): FormatCheck {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.onnx')) return { ok: true, format: 'onnx' };
  if (lower.endsWith('.safetensors')) return { ok: true, format: 'safetensors' };
  const isConvertible = CONVERTIBLE_EXTENSIONS.some((extension) => lower.endsWith(extension));
  return { ok: false, code: 'unsupported_format', hint: isConvertible ? 'convert' : null };
}

export function maxBytesFor(format: ModelFormat, config: AppConfig): number {
  return format === 'onnx' ? config.MAX_ONNX_BYTES : config.MAX_SAFETENSORS_BYTES;
}

/** Strips control characters and path separators; the result is only ever displayed. */
export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what we remove
    .replace(/[\u0000-\u001f\u007f/\\]/g, '')
    .trim();
  return (cleaned || 'model').slice(0, 255);
}

/**
 * First tag bytes of every ModelProto field with its proper wire type: ir_version, producer
 * name/version, domain, model_version, doc_string, graph, opset_import and metadata_props fit in
 * one byte; training_info (20), configuration (21) and functions (25) start with 0xa2/0xaa/0xca.
 * ONNX has no magic number and exporters don't all write ir_version first.
 */
const MODEL_PROTO_FIRST_BYTES = new Set([
  0x08, 0x12, 0x1a, 0x22, 0x28, 0x32, 0x3a, 0x42, 0x72, 0xa2, 0xaa, 0xca,
]);

/** Cheap first-bytes check before queueing a parse (the parser does the full validation). */
export function hasExpectedMagic(format: ModelFormat, head: Buffer, fileSize: number): boolean {
  if (format === 'onnx') return MODEL_PROTO_FIRST_BYTES.has(head[0] ?? -1);
  if (head.length < 9) return false;
  const headerLength = Number(head.readBigUInt64LE(0));
  return (
    headerLength >= 2 &&
    headerLength <= 100 * 1024 * 1024 &&
    8 + headerLength <= fileSize &&
    head[8] === 0x7b
  );
}
