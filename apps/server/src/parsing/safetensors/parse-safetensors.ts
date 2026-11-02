import { PARSER_VERSION, type ModuleNode, type ParsedModel } from '@mieru/shared';
import type { ByteSource } from '../byte-source.js';
import { elementCount, safetensorsDtypeBytes } from '../dtypes.js';
import { ParseError } from '../errors.js';
import { tensorFamily } from '../families.js';
import { LIMITS } from '../limits.js';
import { buildStrip } from '../strip.js';
import type { TensorIndexEntry } from '../tensor-index.js';

const HEADER_LENGTH_BYTES = 8;
const METADATA_KEY = '__metadata__';

interface HeaderTensor {
  name: string;
  dtype: string;
  shape: number[];
  begin: number;
  end: number;
}

export interface SafetensorsBuildResult {
  parsed: ParsedModel;
  tensorIndex: TensorIndexEntry[];
}

/** Nesting depth of a JSON text, computed without parsing so deep nesting can't blow the stack. */
function jsonDepth(text: string): number {
  let depth = 0;
  let maxDepth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') maxDepth = Math.max(maxDepth, ++depth);
    else if (char === '}' || char === ']') depth -= 1;
  }
  return maxDepth;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readHeaderTensor(name: string, value: unknown): HeaderTensor {
  if (name.length > LIMITS.maxNameBytes)
    throw new ParseError('limits_exceeded', 'Tensor name too long');
  if (!isRecord(value)) throw new ParseError('bad_json', `Tensor ${name} is not an object`);
  const { dtype, shape, data_offsets: offsets } = value;
  if (typeof dtype !== 'string') throw new ParseError('bad_json', `Tensor ${name} has no dtype`);
  if (
    !Array.isArray(shape) ||
    shape.length > LIMITS.maxDims ||
    !shape.every((dim) => Number.isSafeInteger(dim) && (dim as number) >= 0)
  ) {
    throw new ParseError('bad_json', `Tensor ${name} has an invalid shape`);
  }
  if (
    !Array.isArray(offsets) ||
    offsets.length !== 2 ||
    !offsets.every((offset) => Number.isSafeInteger(offset) && (offset as number) >= 0)
  ) {
    throw new ParseError('offsets_invalid', `Tensor ${name} has invalid offsets`);
  }
  const [begin, end] = offsets as [number, number];
  return { name, dtype, shape: shape as number[], begin, end };
}

function insertTensor(root: ModuleNode, tensor: HeaderTensor, params: number, bytes: number): void {
  const segments = tensor.name.split('.');
  const leafName = segments.pop() ?? tensor.name;
  let node = root;
  node.paramCount += params;
  node.byteSize += bytes;
  for (const segment of segments) {
    let child = node.children.find((candidate) => candidate.name === segment);
    if (!child) {
      child = {
        path: node.path ? `${node.path}.${segment}` : segment,
        name: segment,
        children: [],
        tensors: [],
        paramCount: 0,
        byteSize: 0,
      };
      node.children.push(child);
    }
    child.paramCount += params;
    child.byteSize += bytes;
    node = child;
  }
  node.tensors.push({ name: leafName, dtype: tensor.dtype, shape: tensor.shape, params, bytes });
}

/**
 * Reads the 8-byte header length and the JSON header only, then validates that every
 * tensor's byte range is consistent with its dtype and shape and that the ranges tile
 * the data section exactly. Tensor bytes are never read.
 */
export async function parseSafetensors(source: ByteSource): Promise<SafetensorsBuildResult> {
  if (source.size < HEADER_LENGTH_BYTES + 2) throw new ParseError('bad_header', 'File too small');
  const lengthBytes = await source.read(0, HEADER_LENGTH_BYTES);
  const headerLength = Number(lengthBytes.readBigUInt64LE(0));
  if (headerLength < 2 || headerLength > LIMITS.maxSafetensorsHeaderBytes) {
    throw new ParseError('bad_header', 'Header length out of range');
  }
  if (HEADER_LENGTH_BYTES + headerLength > source.size)
    throw new ParseError('truncated', 'Header extends past the file');

  const headerText = (await source.read(HEADER_LENGTH_BYTES, headerLength)).toString('utf8');
  if (jsonDepth(headerText) > LIMITS.maxSafetensorsJsonDepth)
    throw new ParseError('limits_exceeded', 'Header nested too deeply');
  let header: unknown;
  try {
    header = JSON.parse(headerText);
  } catch {
    throw new ParseError('bad_json', 'Header is not valid JSON');
  }
  if (!isRecord(header)) throw new ParseError('bad_json', 'Header is not an object');

  const metadata: Record<string, string> = {};
  const tensors: HeaderTensor[] = [];
  for (const [name, value] of Object.entries(header)) {
    if (name === METADATA_KEY) {
      if (isRecord(value)) {
        for (const [key, entry] of Object.entries(value).slice(0, LIMITS.maxMetadataEntries)) {
          if (typeof entry === 'string')
            metadata[key] = entry.slice(0, LIMITS.maxMetadataValueBytes);
        }
      }
      continue;
    }
    tensors.push(readHeaderTensor(name, value));
    if (tensors.length > LIMITS.maxTensors)
      throw new ParseError('limits_exceeded', 'Too many tensors');
  }

  const dataStart = HEADER_LENGTH_BYTES + headerLength;
  const byOffset = [...tensors].sort((a, b) => a.begin - b.begin || a.end - b.end);
  let expectedBegin = 0;
  for (const tensor of byOffset) {
    const params = elementCount(tensor.shape);
    if (tensor.end - tensor.begin !== params * safetensorsDtypeBytes(tensor.dtype)) {
      throw new ParseError(
        'offsets_invalid',
        `Tensor ${tensor.name} size does not match its shape`,
      );
    }
    if (tensor.begin !== expectedBegin)
      throw new ParseError('offsets_invalid', 'Tensor ranges overlap or leave gaps');
    expectedBegin = tensor.end;
  }
  if (dataStart + expectedBegin !== source.size) {
    throw new ParseError('offsets_invalid', 'Data section length does not match the file size');
  }

  const root: ModuleNode = {
    path: '',
    name: '',
    children: [],
    tensors: [],
    paramCount: 0,
    byteSize: 0,
  };
  const dtypeBreakdown: Record<string, { params: number; bytes: number }> = {};
  const tensorIndex: TensorIndexEntry[] = [];
  const stripItems = [];
  for (const tensor of tensors) {
    const params = elementCount(tensor.shape);
    const bytes = tensor.end - tensor.begin;
    insertTensor(root, tensor, params, bytes);
    const entry = (dtypeBreakdown[tensor.dtype] ??= { params: 0, bytes: 0 });
    entry.params += params;
    entry.bytes += bytes;
    tensorIndex.push({
      name: tensor.name,
      dtype: tensor.dtype,
      shape: tensor.shape,
      offset: dataStart + tensor.begin,
      length: bytes,
    });
    stripItems.push({
      family: tensorFamily(tensor.name, tensor.shape.length),
      weight: Math.max(params, 1),
    });
  }

  return {
    parsed: {
      parserVersion: PARSER_VERSION,
      summary: {
        format: 'safetensors',
        fileSizeBytes: source.size,
        totalParams: root.paramCount,
        tensorCount: tensors.length,
        dtypeBreakdown,
        strip: buildStrip(stripItems),
      },
      payload: { kind: 'safetensors-tree', root, metadata },
    },
    tensorIndex,
  };
}
