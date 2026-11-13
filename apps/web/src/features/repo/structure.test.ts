import { describe, expect, it } from 'vitest';
import type { ModuleNode, OnnxNode, ParsedModel } from '@mieru/shared';
import { structureBlocks } from './structure.js';

const summary = {
  format: 'onnx' as const,
  fileSizeBytes: 1,
  totalParams: 0,
  tensorCount: 0,
  dtypeBreakdown: {},
  strip: [],
};

function onnxNode(id: string, groupPath: string[], paramCount = 10): OnnxNode {
  return {
    id,
    name: [...groupPath, 'MatMul'].join('/'),
    opType: 'MatMul',
    domain: '',
    family: 'compute',
    groupPath,
    inputs: [],
    outputs: [],
    params: [],
    paramCount,
    attributes: {},
  };
}

const module = (path: string, children: ModuleNode[], params = 0): ModuleNode => ({
  path,
  name: path.split('.').at(-1) ?? path,
  children,
  tensors: params
    ? [{ name: `${path}.weight`, dtype: 'F32', shape: [params], params, bytes: params * 4 }]
    : [],
  paramCount: params + children.reduce((sum, child) => sum + child.paramCount, 0),
  byteSize: 0,
});

describe('structureBlocks', () => {
  it('lists the layer blocks of a layered ONNX graph with their parameters', () => {
    const nodes = [0, 1, 2].flatMap((layer) =>
      Array.from({ length: 40 }, (_, index) =>
        onnxNode(`n${String(layer)}_${String(index)}`, ['model', `layers.${String(layer)}`]),
      ),
    );
    const parsed: ParsedModel = {
      parserVersion: 3,
      summary,
      payload: { kind: 'onnx-graph', inputs: [], outputs: [], nodes, edges: [], metadata: {} },
    };
    const blocks = structureBlocks(parsed);
    expect(blocks.map((block) => block.label)).toEqual(['layers.0', 'layers.1', 'layers.2']);
    expect(blocks[0]).toMatchObject({ count: 40, countUnit: '노드', paramCount: 400 });
  });

  it('starts a module tree where it first branches', () => {
    const root = module('', [
      module('model', [module('model.embed', [], 100), module('model.layers', [], 50)]),
    ]);
    const parsed: ParsedModel = {
      parserVersion: 3,
      summary: { ...summary, format: 'safetensors' },
      payload: { kind: 'safetensors-tree', root, metadata: {} },
    };
    expect(structureBlocks(parsed).map((block) => [block.label, block.paramCount])).toEqual([
      ['model.embed', 100],
      ['model.layers', 50],
    ]);
  });
});
