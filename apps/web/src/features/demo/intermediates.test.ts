import { describe, expect, it } from 'vitest';
import type { OnnxNode } from '@mieru/shared';
import { pickIntermediates } from './intermediates.js';

function node(name: string, opType: string, family: OnnxNode['family'], output: string): OnnxNode {
  return {
    id: name,
    name,
    opType,
    domain: '',
    family,
    groupPath: [],
    inputs: [],
    outputs: [output],
    params: [],
    paramCount: 0,
    attributes: {},
  };
}

const graph = {
  outputs: [{ name: 'logits', dtype: 'float32', shape: [1, 10] }],
  nodes: [
    node('conv', 'Conv', 'compute', 'conv_out'),
    node('relu', 'Relu', 'activation', 'relu_out'),
    node('reshape', 'Reshape', 'shape', 'flat'),
    node('fc', 'Gemm', 'compute', 'logits'),
  ],
};

describe('pickIntermediates', () => {
  it('keeps compute and activation outputs in order and skips shape ops and graph outputs', () => {
    expect(pickIntermediates(graph).map((item) => item.output)).toEqual(['conv_out', 'relu_out']);
  });

  it('samples long graphs evenly down to the limit', () => {
    const many = {
      outputs: [],
      nodes: Array.from({ length: 100 }, (_, index) =>
        node(`n${String(index)}`, 'Relu', 'activation', `t${String(index)}`),
      ),
    };
    const picked = pickIntermediates(many, 10).map((item) => item.output);
    expect(picked).toHaveLength(10);
    expect(picked[0]).toBe('t0');
    expect(picked[9]).toBe('t90');
  });
});
