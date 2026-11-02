import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tinyCnnOnnx } from '../../test/fixtures/builders.js';
import { parseTimeoutMs, runInWorker, runParser } from './run-parser.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'mieru-worker-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('runParser', () => {
  it('parses in a worker and returns the result', async () => {
    const filePath = path.join(dir, 'tiny.onnx');
    await writeFile(filePath, tinyCnnOnnx());
    const result = await runParser(filePath, 'onnx', 3000);
    expect(result.parsed.summary.nodeCount).toBe(9);
  }, 30_000);

  it('reports parse failures with their stable code', async () => {
    const filePath = path.join(dir, 'garbage.onnx');
    await writeFile(filePath, 'definitely not onnx');
    await expect(runParser(filePath, 'onnx', 20)).rejects.toMatchObject({ name: 'ParseError' });
  }, 30_000);

  it('terminates a worker that never finishes and keeps the main thread responsive', async () => {
    let ticks = 0;
    const heartbeat = setInterval(() => (ticks += 1), 20);
    const looping = new URL('../../test/fixtures/looping-worker.ts', import.meta.url);
    await expect(runInWorker(looping, {}, { timeoutMs: 1000 })).rejects.toMatchObject({
      code: 'timeout',
    });
    clearInterval(heartbeat);
    expect(ticks).toBeGreaterThan(10);
  }, 30_000);
});

describe('parseTimeoutMs', () => {
  it('scales with file size', () => {
    expect(parseTimeoutMs(1000)).toBe(60_000);
    expect(parseTimeoutMs(2 * 1024 ** 3)).toBe(90_000);
  });
});
