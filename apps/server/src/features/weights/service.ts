import { open, type FileHandle } from 'node:fs/promises';
import type { Pool } from 'mysql2/promise';
import {
  HISTOGRAM_BINS,
  PARSER_VERSION,
  type TensorFilters,
  type TensorListItem,
  type TensorStats,
} from '@mieru/shared';
import { AppError, notFound } from '../../errors.js';
import type { TensorIndexEntry } from '../../parsing/tensor-index.js';
import { readGzipJson, sidecarPath } from '../../storage/disk.js';
import {
  externalDataName,
  tensorFilePath,
  versionFiles,
  type VersionFiles,
} from '../models/version-files.js';
import { codecFor, resynchronized, type TensorCodec } from './decode.js';
import { Histogram, StatsAccumulator } from './stats.js';

const READ_CHUNK_BYTES = 1024 * 1024;
/** Above this many elements, stats come from evenly spaced windows instead of every value. */
const FULL_SCAN_LIMIT = 16 * 1024 * 1024;
const SAMPLE_WINDOWS = 64;
const MAX_FILTERS = 64;
const MAX_KERNEL_SIDE = 11;
const RGB_CHANNELS = 3;
/** Bounds the values held in memory for a filter grid when input channels are very wide. */
const MAX_FILTER_ELEMENTS = FULL_SCAN_LIMIT;

async function tensorIndex(storageDir: string, files: VersionFiles): Promise<TensorIndexEntry[]> {
  return (await readGzipJson(
    sidecarPath(storageDir, files.storageKey, 'tensors', PARSER_VERSION),
  )) as TensorIndexEntry[];
}

const elementCount = (shape: readonly number[]) => shape.reduce((product, dim) => product * dim, 1);

export async function listTensors(
  pool: Pool,
  storageDir: string,
  modelId: string,
  version: number | null,
): Promise<TensorListItem[]> {
  const index = await tensorIndex(storageDir, await versionFiles(pool, modelId, version));
  return index.map((entry) => ({
    name: entry.name,
    dtype: entry.dtype,
    shape: entry.shape,
    params: elementCount(entry.shape),
    bytes: entry.length,
  }));
}

/** A byte range to decode and how many elements to take from it. */
interface ScanWindow {
  start: number;
  end: number;
  maxElements: number;
  /** Set when `start` may fall inside a varint, so decoding must skip to the next one. */
  startsMidVarint: boolean;
}

/** Calls `visit` for up to `window.maxElements` elements of the window, reading in chunks. */
async function forEachElement(
  handle: FileHandle,
  codec: TensorCodec,
  window: ScanWindow,
  visit: (value: number) => void,
): Promise<void> {
  const reader = window.startsMidVarint
    ? resynchronized(codec.createReader())
    : codec.createReader();
  let remaining = window.maxElements;
  // Cuts off int4 padding nibbles and anything decoded past the window's quota.
  const emit = (value: number) => {
    if (remaining <= 0) return;
    remaining--;
    visit(value);
  };
  const buffer = Buffer.alloc(Math.min(READ_CHUNK_BYTES, Math.max(1, window.end - window.start)));
  for (let position = window.start; position < window.end && remaining > 0;) {
    const length = Math.min(buffer.length, window.end - position);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead === 0)
      throw new Error(`Blob ended at byte ${position}, before the tensor's bytes did`);
    reader.push(buffer.subarray(0, bytesRead), emit);
    position += bytesRead;
  }
}

/** Windows to scan: the whole tensor, or evenly spaced windows for very large ones. */
function scanWindows(
  entry: TensorIndexEntry,
  codec: TensorCodec,
): { sampled: boolean; windows: ScanWindow[] } {
  const elements = elementCount(entry.shape);
  const end = entry.offset + entry.length;
  if (elements <= FULL_SCAN_LIMIT) {
    return {
      sampled: false,
      windows: [{ start: entry.offset, end, maxElements: elements, startsMidVarint: false }],
    };
  }
  const windowElements = Math.floor(FULL_SCAN_LIMIT / SAMPLE_WINDOWS);
  const indices = Array.from({ length: SAMPLE_WINDOWS }, (_, index) => index);
  if (codec.kind === 'packed') {
    const { unitBytes, unitElements } = codec;
    const windowUnits = Math.floor(windowElements / unitElements);
    const strideUnits = Math.floor(Math.ceil(elements / unitElements) / SAMPLE_WINDOWS);
    const windows = indices.map((index) => {
      const startUnit = index * strideUnits;
      const start = entry.offset + startUnit * unitBytes;
      return {
        start,
        end: Math.min(start + windowUnits * unitBytes, end),
        maxElements: Math.min(windowUnits * unitElements, elements - startUnit * unitElements),
        startsMidVarint: false,
      };
    });
    return { sampled: true, windows };
  }
  const windowBytes = Math.ceil((windowElements * entry.length) / elements);
  const stride = Math.floor(entry.length / SAMPLE_WINDOWS);
  const windows = indices.map((index) => {
    // Later windows start one byte early so that, after resynchronizing, a window whose
    // nominal start is already a varint boundary keeps its first element.
    const start = index === 0 ? entry.offset : entry.offset + index * stride - 1;
    return {
      start,
      end: Math.min(start + windowBytes, end),
      maxElements: windowElements,
      startsMidVarint: index !== 0,
    };
  });
  return { sampled: true, windows };
}

/** The window holding the first `count` elements of a tensor. */
function leadingWindow(entry: TensorIndexEntry, codec: TensorCodec, count: number): ScanWindow {
  const end = entry.offset + entry.length;
  // Varint widths aren't known ahead, so read from the start until `count` elements are seen.
  const bytes =
    codec.kind === 'packed'
      ? Math.ceil(count / codec.unitElements) * codec.unitBytes
      : entry.length;
  return {
    start: entry.offset,
    end: Math.min(entry.offset + bytes, end),
    maxElements: count,
    startsMidVarint: false,
  };
}

function findEntry(index: readonly TensorIndexEntry[], name: string): TensorIndexEntry {
  const entry = index.find((candidate) => candidate.name === name);
  if (!entry) throw notFound('Tensor not found');
  return entry;
}

function requireCodec(entry: TensorIndexEntry): TensorCodec {
  const codec = codecFor(entry.dtype, entry.encoding);
  if (!codec) {
    throw new AppError(422, 'unsupported_dtype', `${entry.dtype} tensors can't be summarized yet`);
  }
  return codec;
}

/** Id of the blob holding the tensor's bytes: the model file or one of its external data files. */
function dataBlobId(files: VersionFiles, entry: TensorIndexEntry): string {
  if (entry.location === null) return files.blobId;
  const data = files.externalData.get(externalDataName(entry.location));
  if (!data) throw notFound('External data file not found');
  return data.blobId;
}

const CACHE_SIZE = 256;
// Blobs are immutable, so a tensor's stats never change. The model blob pins the tensor's
// offsets and the data blob its bytes; versions sharing one can differ in the other.
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
  const files = await versionFiles(pool, modelId, version);
  const entry = findEntry(await tensorIndex(storageDir, files), name);
  const cacheKey = `${files.blobId}:${dataBlobId(files, entry)}:${name}`;
  const cached = statsCache.get(cacheKey);
  if (cached) return cached;

  const codec = requireCodec(entry);
  const { sampled, windows } = scanWindows(entry, codec);
  const handle = await open(tensorFilePath(storageDir, files, entry), 'r');
  try {
    const accumulator = new StatsAccumulator();
    for (const window of windows)
      await forEachElement(handle, codec, window, (value) => accumulator.add(value));
    const summary = accumulator.summary();
    const histogram = new Histogram(summary.min, summary.max, HISTOGRAM_BINS);
    for (const window of windows)
      await forEachElement(handle, codec, window, (value) => histogram.add(value));
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
  const files = await versionFiles(pool, modelId, version);
  const entry = findEntry(await tensorIndex(storageDir, files), name);
  const [outChannels = 0, inChannels = 0, kernelHeight = 0, kernelWidth = 0] = entry.shape;
  if (entry.shape.length !== 4 || kernelHeight > MAX_KERNEL_SIDE || kernelWidth > MAX_KERNEL_SIDE) {
    throw new AppError(
      422,
      'not_a_filter',
      'Only 4-D convolution weights with small kernels have filters',
    );
  }
  const codec = requireCodec(entry);
  const plane = kernelHeight * kernelWidth;
  const perFilter = inChannels * plane;
  const shown = Math.min(
    outChannels,
    MAX_FILTERS,
    Math.max(1, Math.floor(MAX_FILTER_ELEMENTS / Math.max(1, perFilter))),
  );
  const values: number[] = [];
  const handle = await open(tensorFilePath(storageDir, files, entry), 'r');
  try {
    // Output channels are the outermost dim, so the first filters are one contiguous range.
    await forEachElement(handle, codec, leadingWindow(entry, codec, shown * perFilter), (value) =>
      values.push(value),
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
