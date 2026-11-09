import type { DesignLayer, DesignSpec } from '@mieru/shared';
import { inferShapes } from './inference.js';

const INDENT = '    ';

function moduleFor(layer: DesignLayer): string {
  switch (layer.type) {
    case 'conv2d': {
      const extras = [
        layer.stride !== 1 ? `stride=${String(layer.stride)}` : null,
        layer.padding !== 0 ? `padding=${String(layer.padding)}` : null,
      ].filter(Boolean);
      return `nn.Conv2d(${[String(layer.inChannels), String(layer.outChannels), `kernel_size=${String(layer.kernelSize)}`, ...extras].join(', ')})`;
    }
    case 'batchnorm2d':
      return `nn.BatchNorm2d(${String(layer.numFeatures)})`;
    case 'maxpool2d':
      return `nn.MaxPool2d(kernel_size=${String(layer.kernelSize)}, stride=${String(layer.stride)})`;
    case 'avgpool2d':
      return `nn.AvgPool2d(kernel_size=${String(layer.kernelSize)}, stride=${String(layer.stride)})`;
    case 'adaptiveavgpool2d':
      return `nn.AdaptiveAvgPool2d(${String(layer.outputSize)})`;
    case 'flatten':
      return 'nn.Flatten()';
    case 'linear':
      return `nn.Linear(${String(layer.inFeatures)}, ${String(layer.outFeatures)})`;
    case 'relu':
      return 'nn.ReLU()';
    case 'gelu':
      return 'nn.GELU()';
    case 'sigmoid':
      return 'nn.Sigmoid()';
    case 'tanh':
      return 'nn.Tanh()';
    case 'dropout':
      return `nn.Dropout(p=${String(layer.p)})`;
    case 'softmax':
      return 'nn.Softmax(dim=1)';
  }
}

/**
 * PyTorch source for the design as an `nn.Sequential`, with a shape check at the bottom so
 * the reader can run it and see the same output shape mieru inferred.
 */
export function toPyTorch(spec: DesignSpec): string {
  const result = inferShapes(spec);
  const body = spec.layers.map((layer) => `${INDENT}${moduleFor(layer)},`).join('\n');
  const expected = result.output ? `  # torch.Size([${result.output.join(', ')}])` : '';
  return [
    'import torch',
    'from torch import nn',
    '',
    `model = nn.Sequential(${spec.layers.length ? `\n${body}\n` : ''})`,
    '',
    `x = torch.randn(${spec.input.shape.join(', ')})`,
    `print(model(x).shape)${expected}`,
    '',
  ].join('\n');
}
