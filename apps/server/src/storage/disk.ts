import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { pathFor } from './paths.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const GZIP_LEVEL = 6;

/** Bytes available to unprivileged writers on the storage volume. */
export async function freeBytes(storageDir: string): Promise<number> {
  const stats = await statfs(storageDir);
  return stats.bavail * stats.bsize;
}

export function sha256OfFile(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest()));
  });
}

export function sidecarPath(
  storageDir: string,
  blobKey: string,
  kind: 'graph' | 'tensors',
  parserVersion: number,
): string {
  const suffix =
    kind === 'graph' ? `.v${parserVersion}.json.gz` : `.tensors.v${parserVersion}.json.gz`;
  return pathFor(storageDir, 'parsed', blobKey, suffix);
}

/** Writes gzipped JSON atomically (temp file + rename) so readers never see a partial sidecar. */
export async function writeGzipJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, await gzipAsync(JSON.stringify(value), { level: GZIP_LEVEL }));
  await rename(temporary, filePath);
}

export async function readGzipJson(filePath: string): Promise<unknown> {
  return JSON.parse((await gunzipAsync(await readFile(filePath))).toString('utf8')) as unknown;
}

export async function removeQuietly(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}
