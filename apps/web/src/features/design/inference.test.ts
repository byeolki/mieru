import { describe, expect, it } from 'vitest';
import type { DesignLayer, DesignSpec } from '@mieru/shared';
import { inferShapes } from './inference.js';

const spec = (shape: number[], layers: DesignLayer[]): DesignSpec => ({ input: { shape }, layers });

describe('inferShapes', () => {
  it.each<[string, number[], DesignLayer, number[], number]>([
    [
      'conv with padding keeps size',
      [1, 3, 32, 32],
      {
        id: 'a',
        type: 'conv2d',
        inChannels: 3,
        outChannels: 16,
        kernelSize: 3,
        stride: 1,
        padding: 1,
      },
      [1, 16, 32, 32],
      448,
    ],
    [
      'strided conv halves size',
      [1, 3, 32, 32],
      {
        id: 'a',
        type: 'conv2d',
        inChannels: 3,
        outChannels: 8,
        kernelSize: 3,
        stride: 2,
        padding: 1,
      },
      [1, 8, 16, 16],
      224,
    ],
    [
      'batchnorm keeps shape',
      [1, 16, 8, 8],
      { id: 'a', type: 'batchnorm2d', numFeatures: 16 },
      [1, 16, 8, 8],
      32,
    ],
    [
      'max pool',
      [1, 16, 32, 32],
      { id: 'a', type: 'maxpool2d', kernelSize: 2, stride: 2 },
      [1, 16, 16, 16],
      0,
    ],
    [
      'adaptive pool',
      [1, 64, 7, 7],
      { id: 'a', type: 'adaptiveavgpool2d', outputSize: 1 },
      [1, 64, 1, 1],
      0,
    ],
    ['flatten', [1, 16, 4, 4], { id: 'a', type: 'flatten' }, [1, 256], 0],
    [
      'linear',
      [1, 784],
      { id: 'a', type: 'linear', inFeatures: 784, outFeatures: 10 },
      [1, 10],
      7850,
    ],
    ['activation is identity', [1, 10], { id: 'a', type: 'gelu' }, [1, 10], 0],
  ])('%s', (_name, shape, layer, output, params) => {
    const result = inferShapes(spec(shape, [layer]));
    expect(result.layers[0]).toEqual({ status: 'ok', input: shape, output, params });
    expect(result.output).toEqual(output);
  });

  it('flags a wrong in_features with a fix and blocks the rest', () => {
    const result = inferShapes(
      spec(
        [1, 16, 4, 4],
        [
          { id: 'a', type: 'flatten' },
          { id: 'b', type: 'linear', inFeatures: 100, outFeatures: 10 },
          { id: 'c', type: 'softmax' },
        ],
      ),
    );
    expect(result.layers[1]).toMatchObject({ status: 'error', fix: { inFeatures: 256 } });
    expect(result.layers[2]).toEqual({ status: 'blocked' });
    expect(result.output).toBeNull();
  });

  it('flags convolution on a flat input and a kernel larger than the image', () => {
    const conv = {
      id: 'a',
      type: 'conv2d',
      inChannels: 1,
      outChannels: 1,
      kernelSize: 9,
      stride: 1,
      padding: 0,
    } as const;
    expect(inferShapes(spec([1, 10], [conv])).layers[0]?.status).toBe('error');
    expect(inferShapes(spec([1, 1, 4, 4], [conv])).layers[0]).toMatchObject({ status: 'error' });
  });

  it('suggests the incoming channel count for conv and batchnorm mismatches', () => {
    const result = inferShapes(
      spec(
        [1, 3, 8, 8],
        [
          {
            id: 'a',
            type: 'conv2d',
            inChannels: 1,
            outChannels: 4,
            kernelSize: 3,
            stride: 1,
            padding: 1,
          },
        ],
      ),
    );
    expect(result.layers[0]).toMatchObject({ status: 'error', fix: { inChannels: 3 } });
  });

  it('sums parameters across layers', () => {
    const result = inferShapes(
      spec(
        [1, 784],
        [
          { id: 'a', type: 'linear', inFeatures: 784, outFeatures: 128 },
          { id: 'b', type: 'relu' },
          { id: 'c', type: 'linear', inFeatures: 128, outFeatures: 10 },
        ],
      ),
    );
    expect(result.totalParams).toBe(784 * 128 + 128 + 128 * 10 + 10);
  });
});
