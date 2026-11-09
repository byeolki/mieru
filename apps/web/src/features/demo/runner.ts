import type { InferenceSession, Tensor } from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { toDisplayValues, type FeedValues } from './tensor-data.js';

export type Backend = 'webgpu' | 'wasm';

/** Largest file the demo will load; the bytes live in browser memory twice while patching. */
export const DEMO_MAX_BYTES = 512 * 1024 * 1024;

const MAX_WASM_THREADS = 4;

export interface LoadedSession {
  session: InferenceSession;
  backend: Backend;
}

export interface RunOutput {
  name: string;
  dims: number[];
  values: Float32Array;
}

async function loadRuntime() {
  const ort = await import('onnxruntime-web');
  // Point the runtime at the bundled binary instead of letting it guess a URL next to itself,
  // which breaks once Vite fingerprints the asset.
  ort.env.wasm.wasmPaths = { wasm: wasmUrl };
  // Threads need SharedArrayBuffer, which only exists on cross-origin isolated pages.
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated
    ? Math.min(MAX_WASM_THREADS, navigator.hardwareConcurrency || 1)
    : 1;
  return ort;
}

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/** A weights file stored next to the model and referenced from it by `path`. */
export interface ExternalDataFile {
  /** Location string the model's initializers use, e.g. `model.onnx.data`. */
  path: string;
  url: string;
}

export interface CreateSessionOptions {
  externalData?: readonly ExternalDataFile[];
}

/** Creates a session on WebGPU when the browser has it, otherwise (or if that fails) on WASM. */
export async function createSession(
  model: Uint8Array,
  options: CreateSessionOptions = {},
): Promise<LoadedSession> {
  const ort = await loadRuntime();
  // The runtime fetches each URL itself and matches it to initializers by `path`.
  const externalData = options.externalData?.map(({ path, url }) => ({ path, data: url }));
  if (hasWebGpu()) {
    try {
      const session = await ort.InferenceSession.create(model, {
        executionProviders: ['webgpu'],
        externalData,
      });
      return { session, backend: 'webgpu' };
    } catch (error) {
      console.warn('WebGPU session failed; falling back to WASM', error);
    }
  }
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    externalData,
  });
  return { session, backend: 'wasm' };
}

/** Downloads a file while reporting progress; `total` is null when the server sends no length. */
export async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok || !response.body)
    throw new Error(`download failed (${String(response.status)})`);
  const header = response.headers.get('content-length');
  const total = header ? Number(header) : null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Runs once and copies every numeric output to plain float arrays the UI can keep after
 * disposal; string outputs are skipped.
 */
export async function runSession(
  loaded: LoadedSession,
  feeds: Record<string, { values: FeedValues; dims: number[] }>,
): Promise<{ outputs: RunOutput[]; milliseconds: number }> {
  const ort = await loadRuntime();
  const tensors: Record<string, Tensor> = {};
  for (const [name, feed] of Object.entries(feeds)) {
    tensors[name] = new ort.Tensor(feed.values.dtype, feed.values.data, feed.dims);
  }
  const started = performance.now();
  const results = await loaded.session.run(tensors);
  const milliseconds = performance.now() - started;
  const outputs = Object.entries(results).flatMap(([name, tensor]) => {
    const data = tensor.data;
    const values = Array.isArray(data) ? null : toDisplayValues(tensor.type, data);
    tensor.dispose();
    if (!values) return [];
    return [{ name, dims: [...tensor.dims], values }];
  });
  return { outputs, milliseconds };
}
