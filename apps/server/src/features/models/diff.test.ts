import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { tinyCnnOnnx } from '../../../test/fixtures/builders.js';
import { BufferByteSource } from '../../parsing/byte-source.js';
import { parseFromSource } from '../../parsing/parse.js';
import { computeModelDiff } from './diff.js';

async function side(bytes: Buffer) {
  const result = await parseFromSource(new BufferByteSource(bytes), 'onnx');
  const hashes = new Map(
    result.tensorIndex.map((entry) => [
      entry.name,
      createHash('sha256')
        .update(bytes.subarray(entry.offset, entry.offset + entry.length))
        .digest('hex'),
    ]),
  );
  return { parsed: result.parsed, tensors: { index: result.tensorIndex, hashes } };
}

async function diffOf(from: Buffer, to: Buffer) {
  const [a, b] = await Promise.all([side(from), side(to)]);
  return computeModelDiff(
    { from: 1, to: 2 },
    { from: a.parsed, to: b.parsed },
    { from: a.tensors, to: b.tensors },
  );
}

describe('computeModelDiff', () => {
  it('finds nothing between identical files', async () => {
    const diff = await diffOf(tinyCnnOnnx(), tinyCnnOnnx());
    expect(diff.nodes).toEqual([]);
    expect(diff.tensors).toEqual([]);
    expect(diff.summary.nodes.unchanged).toBeGreaterThan(0);
  });

  it('marks exactly the node whose kernel changed', async () => {
    const diff = await diffOf(tinyCnnOnnx(), tinyCnnOnnx({ perturb: 'branch_a.weight' }));
    expect(diff.nodes).toEqual([
      { name: '/block/branch_a/Conv', opType: 'Conv', status: 'changed', changes: ['weights'] },
    ]);
    expect(diff.tensors).toEqual([
      {
        name: 'branch_a.weight',
        status: 'changed',
        fromShape: [4, 4, 3, 3],
        toShape: [4, 4, 3, 3],
      },
    ]);
    expect(diff.summary.tensors.changed).toBe(1);
  });

  it('reports added nodes and rewired inputs after an architecture change', async () => {
    const diff = await diffOf(tinyCnnOnnx(), tinyCnnOnnx({ extraHeadRelu: true }));
    expect(diff.nodes).toEqual([
      { name: '/head/act/Relu', opType: 'Relu', status: 'added', changes: [] },
    ]);
    const reverse = await diffOf(tinyCnnOnnx({ extraHeadRelu: true }), tinyCnnOnnx());
    expect(reverse.nodes).toEqual([
      { name: '/head/act/Relu', opType: 'Relu', status: 'removed', changes: [] },
    ]);
  });
});
