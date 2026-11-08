import type { InferenceSession, Tensor } from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';

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

/** Creates a session on WebGPU when the browser has it, otherwise (or if that fails) on WASM. */
export async function createSession(model: Uint8Array): Promise<LoadedSession> {
  const ort = await loadRuntime();
  if (hasWebGpu()) {
    try {
      const session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
      return { session, backend: 'webgpu' };
    } catch (error) {
      console.warn('WebGPU session failed; falling back to WASM', error);
    }
  }
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
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

export type FeedValues =
  { dtype: 'float32'; data: Float32Array } | { dtype: 'int64'; data: BigInt64Array };

/** Runs once and copies every output to plain float arrays the UI can keep after disposal. */
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
    if (typeof data === 'string' || Array.isArray(data)) return [];
    const values = Float32Array.from(data as ArrayLike<number>, Number);
    tensor.dispose();
    return [{ name, dims: [...tensor.dims], values }];
  });
  return { outputs, milliseconds };
}
