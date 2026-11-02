import { parentPort, workerData } from 'node:worker_threads';
import { ParseError } from './errors.js';
import { parseModelFile, type ModelFormat } from './parse.js';

interface ParseJob {
  filePath: string;
  format: ModelFormat;
}

const job = workerData as ParseJob;

try {
  const result = await parseModelFile(job.filePath, job.format);
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage(
    error instanceof ParseError
      ? { ok: false, code: error.code, message: error.message }
      : {
          ok: false,
          code: 'internal',
          message: error instanceof Error ? error.message : String(error),
        },
  );
}
