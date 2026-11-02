import { Worker } from 'node:worker_threads';
import { ParseError, isParseFailureCode } from './errors.js';
import type { ModelFormat, ParseResult } from './parse.js';

const BASE_TIMEOUT_MS = 30_000;
const TIMEOUT_PER_GIB_MS = 30_000;
const GIB = 1024 ** 3;
const MAX_HEAP_MB = 512;

/** 30 s plus 30 s per GiB, so a 2 GiB file gets 90 s. */
export function parseTimeoutMs(fileSizeBytes: number): number {
  return BASE_TIMEOUT_MS + Math.ceil(fileSizeBytes / GIB) * TIMEOUT_PER_GIB_MS;
}

type WorkerReply<T> = { ok: true; result: T } | { ok: false; code: string; message: string };

/**
 * Runs a worker script with a heap cap and a hard timeout; the worker is terminated on timeout
 * so a hostile file can never block the server's event loop or exhaust its heap.
 * When running from TypeScript sources (dev, tests), the worker is booted through tsx.
 */
export function runInWorker<T>(
  scriptUrl: URL,
  data: unknown,
  options: { timeoutMs: number; maxHeapMb?: number },
): Promise<T> {
  const isTypeScript = scriptUrl.pathname.endsWith('.ts');
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(scriptUrl, {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: options.maxHeapMb ?? MAX_HEAP_MB },
      execArgv: isTypeScript ? ['--import', 'tsx', '--conditions=development'] : [],
    });
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new ParseError('timeout', 'Parsing took too long')));
      void worker.terminate();
    }, options.timeoutMs);

    worker.once('message', (reply: WorkerReply<T>) => {
      finish(() => {
        if (reply.ok) resolve(reply.result);
        else
          reject(
            new ParseError(isParseFailureCode(reply.code) ? reply.code : 'internal', reply.message),
          );
      });
      void worker.terminate();
    });
    worker.once('error', (error: Error) => {
      const code = /heap|memory/i.test(error.message) ? 'limits_exceeded' : 'internal';
      finish(() => reject(new ParseError(code, error.message)));
    });
    worker.once('exit', (exitCode) => {
      finish(() => reject(new ParseError('internal', `Parser exited with code ${exitCode}`)));
    });
  });
}

const PARSER_SCRIPT = new URL(
  import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js',
  import.meta.url,
);

/** Parses a model file in an isolated worker. */
export function runParser(
  filePath: string,
  format: ModelFormat,
  fileSizeBytes: number,
): Promise<ParseResult> {
  return runInWorker<ParseResult>(
    PARSER_SCRIPT,
    { filePath, format },
    { timeoutMs: parseTimeoutMs(fileSizeBytes) },
  );
}
