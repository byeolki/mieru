import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsedModelSchema } from '@mieru/shared';
import {
  NESTED_SAFETENSORS,
  NESTED_SAFETENSORS_PARAMS,
  EXTERNAL_DATA_NAME,
  QUIRKS_PARAMS,
  TINY_CNN_PARAMS,
  externalDataOnnx,
  largeOnnxLayout,
  realWorldQuirksOnnx,
  safetensorsBuffer,
  safetensorsWithHeader,
  seededRandom,
  syntheticTransformerOnnx,
  tinyCnnOnnx,
} from '../../test/fixtures/builders.js';
import { BufferByteSource } from './byte-source.js';
import { ParseError } from './errors.js';
import { parseFromSource, parseModelFile, type ModelFormat } from './parse.js';

const parseBuffer = (bytes: Buffer, format: ModelFormat) =>
  parseFromSource(new BufferByteSource(bytes), format);

async function expectParseError(bytes: Buffer, format: ModelFormat, code: string) {
  await expect(parseBuffer(bytes, format)).rejects.toMatchObject({ name: 'ParseError', code });
}

describe('ONNX parser', () => {
  it('extracts nodes, edges, folded params and groups from the tiny CNN', async () => {
    const { parsed, tensorIndex } = await parseBuffer(tinyCnnOnnx(), 'onnx');
    expect(parsedModelSchema.safeParse(parsed).success).toBe(true);
    const { summary, payload } = parsed;
    if (payload.kind !== 'onnx-graph') throw new Error('expected an ONNX graph');

    expect(summary.totalParams).toBe(TINY_CNN_PARAMS);
    expect(summary.opsetVersion).toBe(17);
    expect(summary.producer).toBe('mieru-fixtures 1');
    // The Constant node is folded into Reshape's params, so 9 of 10 nodes remain.
    expect(summary.nodeCount).toBe(9);
    expect(payload.nodes.map((node) => node.opType)).not.toContain('Constant');

    const conv = payload.nodes.find((node) => node.name === '/stem/conv/Conv');
    expect(conv).toMatchObject({
      family: 'compute',
      groupPath: ['stem', 'conv'],
      paramCount: 112,
      inputs: ['input'],
    });
    expect(conv?.attributes.kernel_shape).toEqual({
      kind: 'ints',
      value: [3, 3],
      truncated: false,
    });
    const reshape = payload.nodes.find((node) => node.opType === 'Reshape');
    expect(reshape?.params).toEqual([{ name: 'shape', dtype: 'int64', shape: [2] }]);

    expect(payload.inputs).toEqual([
      { name: 'input', dtype: 'float32', shape: ['batch', 3, 8, 8] },
    ]);
    const add = payload.nodes.find((node) => node.opType === 'Add');
    expect(payload.edges.filter((edge) => edge.target === add?.id)).toHaveLength(2);
    expect(payload.edges.find((edge) => edge.source === 'in:input')).toBeDefined();
    expect(payload.edges.find((edge) => edge.target === 'out:logits')).toBeDefined();
    const reluEdge = payload.edges.find((edge) => edge.tensor.name === 'relu_out');
    expect(reluEdge?.tensor.shape).toEqual(['batch', 4, 8, 8]);
    expect(payload.metadata).toEqual({ author: 'mieru' });

    expect(tensorIndex.find((entry) => entry.name === 'fc.weight')).toMatchObject({
      dtype: 'float32',
      shape: [10, 4],
      length: 160,
    });
    expect(summary.strip.length).toBeGreaterThan(0);
  });

  it('handles a 10k-node transformer graph', async () => {
    const { parsed } = await parseBuffer(syntheticTransformerOnnx(770), 'onnx');
    expect(parsed.summary.nodeCount).toBe(770 * 13);
    if (parsed.payload.kind !== 'onnx-graph') throw new Error('expected an ONNX graph');
    expect(parsed.payload.nodes[1]?.groupPath).toEqual([
      'model',
      'layers.0',
      'self_attn',
      'q_proj',
    ]);
    expect(parsed.summary.strip.length).toBeLessThanOrEqual(512);
  });

  it('rejects truncated files', async () => {
    const bytes = tinyCnnOnnx();
    await expectParseError(bytes.subarray(0, bytes.length - 40), 'onnx', 'truncated');
  });

  it('rejects text and other non-protobuf bytes', async () => {
    const result = parseBuffer(Buffer.from('this is not a protobuf file at all'), 'onnx');
    await expect(result).rejects.toBeInstanceOf(ParseError);
  });

  it('maps external tensors to their data file, offset and length', async () => {
    const { parsed, tensorIndex, externalData } = await parseBuffer(
      externalDataOnnx().model,
      'onnx',
    );
    expect(parsed.summary.totalParams).toBe(8);
    expect(tensorIndex).toEqual([
      expect.objectContaining({
        name: 'w1',
        offset: 0,
        length: 16,
        location: `./${EXTERNAL_DATA_NAME}`,
      }),
      expect.objectContaining({
        name: 'w2',
        offset: 16,
        length: 16,
        location: `./${EXTERNAL_DATA_NAME}`,
      }),
    ]);
    expect(externalData).toEqual([{ location: `./${EXTERNAL_DATA_NAME}`, requiredBytes: 32 }]);
  });

  it('accepts INT64_MAX attributes, subgraph weights, sparse and varint tensors', async () => {
    const { parsed, tensorIndex } = await parseBuffer(realWorldQuirksOnnx(), 'onnx');
    expect(parsedModelSchema.safeParse(parsed).success).toBe(true);
    const { summary, payload } = parsed;
    if (payload.kind !== 'onnx-graph') throw new Error('expected an ONNX graph');
    expect(summary.totalParams).toBe(QUIRKS_PARAMS);

    const slice = payload.nodes.find((node) => node.opType === 'Slice');
    expect(slice?.attributes.ends).toEqual({
      kind: 'ints',
      value: ['9223372036854775807'],
      truncated: false,
    });
    const branch = payload.nodes.find((node) => node.opType === 'If');
    expect(branch?.attributes.then_branch).toEqual({ kind: 'graph', nodeCount: 2 });

    const names = tensorIndex.map((entry) => entry.name).sort();
    expect(names).toEqual(['q', 'then_c', 'then_w', 'w']);
    expect(tensorIndex.find((entry) => entry.name === 'q')).toMatchObject({
      dtype: 'int8',
      encoding: 'varint',
      location: null,
    });
    expect(tensorIndex.find((entry) => entry.name === 'w')?.encoding).toBe('raw');
  });

  it('never throws anything but ParseError on corrupted bytes (seeded fuzz)', async () => {
    const original = tinyCnnOnnx();
    const random = seededRandom(42);
    for (let round = 0; round < 300; round += 1) {
      const mutated = Buffer.from(original);
      const flips = 1 + Math.floor(random() * 8);
      for (let flip = 0; flip < flips; flip += 1) {
        mutated[Math.floor(random() * mutated.length)] = Math.floor(random() * 256);
      }
      try {
        await parseBuffer(mutated, 'onnx');
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
      }
    }
  });
});

describe('safetensors parser', () => {
  it('builds the module tree with totals', async () => {
    const { parsed, tensorIndex } = await parseBuffer(
      safetensorsBuffer(NESTED_SAFETENSORS, { format: 'pt' }),
      'safetensors',
    );
    expect(parsedModelSchema.safeParse(parsed).success).toBe(true);
    expect(parsed.summary.totalParams).toBe(NESTED_SAFETENSORS_PARAMS);
    expect(parsed.summary.tensorCount).toBe(7);
    expect(parsed.summary.dtypeBreakdown.F16).toEqual({ params: 16, bytes: 32 });
    if (parsed.payload.kind !== 'safetensors-tree') throw new Error('expected a tree');
    const model = parsed.payload.root.children.find((child) => child.name === 'model');
    const layer0 = model?.children
      .find((child) => child.name === 'layers')
      ?.children.find((child) => child.name === '0');
    expect(layer0?.paramCount).toBe(64 + 64 + 8);
    expect(layer0?.children.map((child) => child.name)).toEqual(['self_attn', 'input_layernorm']);
    expect(parsed.payload.metadata).toEqual({ format: 'pt' });
    expect(tensorIndex[0]?.offset).toBeGreaterThan(8);
  });

  it('rejects an out-of-range header length', async () => {
    const bytes = Buffer.alloc(32);
    bytes.writeBigUInt64LE(2n ** 63n);
    await expectParseError(bytes, 'safetensors', 'bad_header');
  });

  it('rejects a header that runs past the file', async () => {
    const bytes = safetensorsWithHeader('{"a":1}', 0);
    bytes.writeBigUInt64LE(10_000n);
    await expectParseError(bytes, 'safetensors', 'truncated');
  });

  it('rejects overlapping offsets', async () => {
    const header = JSON.stringify({
      a: { dtype: 'F32', shape: [2], data_offsets: [0, 8] },
      b: { dtype: 'F32', shape: [2], data_offsets: [4, 12] },
    });
    await expectParseError(safetensorsWithHeader(header, 12), 'safetensors', 'offsets_invalid');
  });

  it('rejects sizes that disagree with the shape', async () => {
    const header = JSON.stringify({ a: { dtype: 'F32', shape: [4], data_offsets: [0, 8] } });
    await expectParseError(safetensorsWithHeader(header, 8), 'safetensors', 'offsets_invalid');
  });

  it('rejects unknown dtypes', async () => {
    const header = JSON.stringify({ a: { dtype: 'Q4', shape: [2], data_offsets: [0, 2] } });
    await expectParseError(safetensorsWithHeader(header, 2), 'safetensors', 'unsupported_dtype');
  });

  it('rejects invalid JSON and deep nesting', async () => {
    await expectParseError(safetensorsWithHeader('{not json', 0), 'safetensors', 'bad_json');
    await expectParseError(
      safetensorsWithHeader('{"__metadata__":{"a":[[[[[1]]]]]}}', 0),
      'safetensors',
      'limits_exceeded',
    );
  });
});

describe('parsing large files from disk', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'mieru-parse-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('scans a 512 MB ONNX file without loading its weights into memory', async () => {
    const payloadBytes = 512 * 1024 * 1024;
    const { head, tail } = largeOnnxLayout(payloadBytes);
    const filePath = path.join(dir, 'large.onnx');
    const handle = await open(filePath, 'w');
    try {
      await handle.write(head, 0, head.length, 0);
      await handle.write(tail, 0, tail.length, head.length + payloadBytes);
    } finally {
      await handle.close();
    }
    const before = process.memoryUsage().rss;
    const { parsed, tensorIndex } = await parseModelFile(filePath, 'onnx');
    const growth = process.memoryUsage().rss - before;
    expect(parsed.summary.totalParams).toBe(payloadBytes / 4);
    expect(tensorIndex[0]).toMatchObject({
      name: 'big.weight',
      offset: head.length,
      length: payloadBytes,
    });
    expect(growth).toBeLessThan(200 * 1024 * 1024);
  });

  it('reads only the header of a large safetensors file', async () => {
    const filePath = path.join(dir, 'large.safetensors');
    const tensorBytes = 256 * 1024 * 1024;
    const header = JSON.stringify({
      w: { dtype: 'U8', shape: [tensorBytes], data_offsets: [0, tensorBytes] },
    });
    const prefix = safetensorsWithHeader(header, 0);
    await writeFile(filePath, prefix);
    const handle = await open(filePath, 'r+');
    await handle.truncate(prefix.length + tensorBytes);
    await handle.close();
    const { parsed } = await parseModelFile(filePath, 'safetensors');
    expect(parsed.summary.totalParams).toBe(tensorBytes);
  });
});
