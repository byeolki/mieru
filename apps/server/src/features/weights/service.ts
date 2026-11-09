import { open, type FileHandle } from 'node:fs/promises';
import type { Pool } from 'mysql2/promise';
import {
  HISTOGRAM_BINS,
  PARSER_VERSION,
  type TensorFilters,
  type TensorListItem,
  type TensorStats,
} from '@mieru/shared';
import { selectOne } from '../../db/query.js';
import { AppError, notFound } from '../../errors.js';
import type { TensorIndexEntry } from '../../parsing/tensor-index.js';
import { readGzipJson, sidecarPath } from '../../storage/disk.js';
import { pathFor } from '../../storage/paths.js';
import { decoderFor, type ElementDecoder } from './decode.js';
import { Histogram, StatsAccumulator } from './stats.js';

const READ_CHUNK_BYTES = 1024 * 1024;
/** Above this many elements, stats come from evenly spaced windows instead of every value. */
const FULL_SCAN_LIMIT = 16 * 1024 * 1024;
const SAMPLE_WINDOWS = 64;
const MAX_FILTERS = 64;
const MAX_KERNEL_SIDE = 11;
const RGB_CHANNELS = 3;

interface VersionBlob {
  blobId: string;
  storageKey: string;
}

async function versionBlob(
  pool: Pool,
  modelId: string,
  version: number | null,
): Promise<VersionBlob> {
  const filter = version === null ? 'v.id = m.current_version_id' : 'v.version_number = ?';
  const row = await selectOne<{
    status: string;
    blob_id: string | null;
    storage_key: string | null;
  }>(
    pool,
    `SELECT v.status, b.id AS blob_id, b.storage_key
       FROM models m
       JOIN model_versions v ON v.model_id = m.id AND ${filter}
       LEFT JOIN model_files f ON f.version_id = v.id AND f.kind = 'model'
       LEFT JOIN blobs b ON b.id = f.blob_id
      WHERE m.id = ?`,
    version === null ? [modelId] : [version, modelId],
  );
  if (!row) throw notFound('Version not found');
  if (row.status !== 'ready' || !row.blob_id || !row.storage_key) {
    throw new AppError(409, 'not_ready', 'This version is still being processed', {
      retryAfterSec: 2,
    });
  }
  return { blobId: row.blob_id, storageKey: row.storage_key };
}

async function tensorIndex(storageDir: string, blob: VersionBlob): Promise<TensorIndexEntry[]> {
  return (await readGzipJson(
    sidecarPath(storageDir, blob.storageKey, 'tensors', PARSER_VERSION),
  )) as TensorIndexEntry[];
}

const elementCount = (shape: readonly number[]) => shape.reduce((product, dim) => product * dim, 1);

export async function listTensors(
  pool: Pool,
  storageDir: string,
  modelId: string,
  version: number | null,
): Promise<TensorListItem[]> {
  const index = await tensorIndex(storageDir, await versionBlob(pool, modelId, version));
  return index.map((entry) => ({
    name: entry.name,
    dtype: entry.dtype,
    shape: entry.shape,
    params: elementCount(entry.shape),
    bytes: entry.length,
  }));
}

/** Calls `visit` for each element in `[start, end)` byte range, reading in chunks. */
async function forEachElement(
  handle: FileHandle,
  decoder: ElementDecoder,
  range: { start: number; end: number },
  visit: (value: number) => void,
): Promise<void> {
  const step = decoder.bytesPerElement;
  const chunkBytes = Math.max(step, READ_CHUNK_BYTES - (READ_CHUNK_BYTES % step));
  const buffer = Buffer.alloc(chunkBytes);
  for (let position = range.start; position < range.end; position += chunkBytes) {
    const length = Math.min(chunkBytes, range.end - position);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    for (let offset = 0; offset + step <= bytesRead; offset += step)
      visit(decoder.read(buffer, offset));
  }
}

/** Byte ranges to scan: the whole tensor, or evenly spaced windows for very large ones. */
function scanRanges(entry: TensorIndexEntry, decoder: ElementDecoder) {
  const elements = entry.length / decoder.bytesPerElement;
  const end = entry.offset + entry.length;
  if (elements <= FULL_SCAN_LIMIT)
    return { sampled: false, ranges: [{ start: entry.offset, end }] };
  const windowBytes = Math.floor(FULL_SCAN_LIMIT / SAMPLE_WINDOWS) * decoder.bytesPerElement;
  const stride = Math.floor(entry.length / SAMPLE_WINDOWS);
  const ranges = Array.from({ length: SAMPLE_WINDOWS }, (_, index) => {
    const start = entry.offset + index * stride - ((index * stride) % decoder.bytesPerElement);
    return { start, end: Math.min(start + windowBytes, end) };
  });
  return { sampled: true, ranges };
}

function findEntry(index: readonly TensorIndexEntry[], name: string): TensorIndexEntry {
  const entry = index.find((candidate) => candidate.name === name);
  if (!entry) throw notFound('Tensor not found');
  return entry;
}

function requireDecoder(entry: TensorIndexEntry): ElementDecoder {
  const decoder = decoderFor(entry.dtype);
  if (!decoder) {
    throw new AppError(422, 'unsupported_dtype', `${entry.dtype} tensors can't be summarized yet`);
  }
  return decoder;
}

const CACHE_SIZE = 256;
// Blobs are immutable, so a tensor's stats never change; cache recent ones by blob and name.
const statsCache = new Map<string, TensorStats>();

/**
 * Summary statistics and a histogram for one weight tensor. Two passes over the bytes: one
 * for min/max/moments, one to bin values into that range.
 * @throws AppError 404 for unknown tensors, 422 for dtypes that can't be decoded.
 */
export async function tensorStats(
  pool: Pool,
  storageDir: string,
  modelId: string,
  name: string,
  version: number | null,
): Promise<TensorStats> {
  const blob = await versionBlob(pool, modelId, version);
  const cacheKey = `${blob.blobId}:${name}`;
  const cached = statsCache.get(cacheKey);
  if (cached) return cached;

  const entry = findEntry(await tensorIndex(storageDir, blob), name);
  const decoder = requireDecoder(entry);
  const { sampled, ranges } = scanRanges(entry, decoder);
  const handle = await open(pathFor(storageDir, 'blobs', blob.storageKey), 'r');
  try {
    const accumulator = new StatsAccumulator();
    for (const range of ranges)
      await forEachElement(handle, decoder, range, (value) => accumulator.add(value));
    const summary = accumulator.summary();
    const histogram = new Histogram(summary.min, summary.max, HISTOGRAM_BINS);
    for (const range of ranges)
      await forEachElement(handle, decoder, range, (value) => histogram.add(value));
    const stats: TensorStats = {
      name: entry.name,
      dtype: entry.dtype,
      shape: entry.shape,
      ...summary,
      sampled,
      histogram: { min: histogram.min, max: histogram.max, counts: histogram.counts },
    };
    statsCache.set(cacheKey, stats);
    if (statsCache.size > CACHE_SIZE) statsCache.delete(statsCache.keys().next().value ?? '');
    return stats;
  } finally {
    await handle.close();
  }
}

/**
 * The first output filters of a 4-D convolution weight `[out, in, kh, kw]`. Three-channel
 * inputs are returned as RGB (the classic first-layer view); others as the mean over inputs.
 * @throws AppError 422 when the tensor is not a small-kernel convolution weight.
 */
export async function tensorFilters(
  pool: Pool,
  storageDir: string,
  modelId: string,
  name: string,
  version: number | null,
): Promise<TensorFilters> {
  const blob = await versionBlob(pool, modelId, version);
  const entry = findEntry(await tensorIndex(storageDir, blob), name);
  const [outChannels = 0, inChannels = 0, kernelHeight = 0, kernelWidth = 0] = entry.shape;
  if (entry.shape.length !== 4 || kernelHeight > MAX_KERNEL_SIDE || kernelWidth > MAX_KERNEL_SIDE) {
    throw new AppError(
      422,
      'not_a_filter',
      'Only 4-D convolution weights with small kernels have filters',
    );
  }
  const decoder = requireDecoder(entry);
  const shown = Math.min(outChannels, MAX_FILTERS);
  const plane = kernelHeight * kernelWidth;
  const perFilter = inChannels * plane;
  const values: number[] = [];
  const handle = await open(pathFor(storageDir, 'blobs', blob.storageKey), 'r');
  try {
    // Output channels are the outermost dim, so the first filters are one contiguous range.
    await forEachElement(
      handle,
      decoder,
      { start: entry.offset, end: entry.offset + shown * perFilter * decoder.bytesPerElement },
      (value) => values.push(value),
    );
  } finally {
    await handle.close();
  }
  const mode = inChannels === RGB_CHANNELS ? 'rgb' : 'gray';
  const filters = Array.from({ length: shown }, (_, filter) => {
    const start = filter * perFilter;
    if (mode === 'rgb') return values.slice(start, start + perFilter);
    return Array.from({ length: plane }, (_, pixel) => {
      let sum = 0;
      for (let channel = 0; channel < inChannels; channel++)
        sum += values[start + channel * plane + pixel] ?? 0;
      return sum / inChannels;
    });
  });
  const flat = filters.flat().filter(Number.isFinite);
  return {
    name: entry.name,
    mode,
    kernelHeight,
    kernelWidth,
    outChannels,
    filters,
    min: flat.length ? Math.min(...flat) : 0,
    max: flat.length ? Math.max(...flat) : 0,
  };
}
