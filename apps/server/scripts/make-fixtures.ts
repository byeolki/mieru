import { createHash } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NESTED_SAFETENSORS,
  safetensorsBuffer,
  syntheticTransformerOnnx,
  tinyCnnOnnx,
  tinyMlpOnnx,
} from '../test/fixtures/builders.js';

const LARGE_SAFETENSORS_BYTES = 128 * 1024 * 1024;
const outputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../test/fixtures/generated',
);

async function writeFixture(name: string, bytes: Buffer): Promise<void> {
  await writeFile(path.join(outputDir, name), bytes);
  console.log(`${name}\t${bytes.length}\t${createHash('sha256').update(bytes).digest('hex')}`);
}

/** A >100 MB safetensors file written sparsely: a real header, then a hole the OS doesn't allocate. */
async function writeLargeSafetensors(name: string): Promise<void> {
  const tensorBytes = LARGE_SAFETENSORS_BYTES;
  const header = JSON.stringify({
    'big.weight': { dtype: 'U8', shape: [tensorBytes], data_offsets: [0, tensorBytes] },
  });
  const headerBytes = Buffer.from(header);
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(headerBytes.length));
  const handle = await open(path.join(outputDir, name), 'w');
  try {
    await handle.write(Buffer.concat([length, headerBytes]), 0, 8 + headerBytes.length, 0);
    await handle.truncate(8 + headerBytes.length + tensorBytes);
  } finally {
    await handle.close();
  }
  console.log(`${name}\t${8 + headerBytes.length + tensorBytes}\t(sparse)`);
}

await mkdir(outputDir, { recursive: true });
await writeFixture('tiny-cnn.onnx', tinyCnnOnnx());
// A "retrained" next version: one kernel changed and an extra Relu on the head.
await writeFixture(
  'tiny-cnn-v2.onnx',
  tinyCnnOnnx({ perturb: 'branch_a.weight', extraHeadRelu: true }),
);
await writeFixture('tiny-mlp.onnx', tinyMlpOnnx());
await writeFixture('synthetic-transformer-10k.onnx', syntheticTransformerOnnx(770));
await writeFixture('nested.safetensors', safetensorsBuffer(NESTED_SAFETENSORS, { format: 'pt' }));
await writeFixture('garbage.onnx', Buffer.from('this is not a protobuf file at all, just text'));
await writeLargeSafetensors('large-sparse.safetensors');
