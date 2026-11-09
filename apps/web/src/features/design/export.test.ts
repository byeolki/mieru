import { describe, expect, it } from 'vitest';
import { toPyTorch } from './export.js';

describe('toPyTorch', () => {
  it('writes an nn.Sequential with only non-default arguments and the inferred shape', () => {
    const code = toPyTorch({
      input: { shape: [1, 3, 32, 32] },
      layers: [
        {
          id: 'a',
          type: 'conv2d',
          inChannels: 3,
          outChannels: 16,
          kernelSize: 3,
          stride: 1,
          padding: 1,
        },
        { id: 'b', type: 'batchnorm2d', numFeatures: 16 },
        { id: 'c', type: 'relu' },
        { id: 'd', type: 'maxpool2d', kernelSize: 2, stride: 2 },
        { id: 'e', type: 'flatten' },
        { id: 'f', type: 'dropout', p: 0.5 },
        { id: 'g', type: 'linear', inFeatures: 4096, outFeatures: 10 },
        { id: 'h', type: 'softmax' },
      ],
    });
    expect(code).toBe(`import torch
from torch import nn

model = nn.Sequential(
    nn.Conv2d(3, 16, kernel_size=3, padding=1),
    nn.BatchNorm2d(16),
    nn.ReLU(),
    nn.MaxPool2d(kernel_size=2, stride=2),
    nn.Flatten(),
    nn.Dropout(p=0.5),
    nn.Linear(4096, 10),
    nn.Softmax(dim=1),
)

x = torch.randn(1, 3, 32, 32)
print(model(x).shape)  # torch.Size([1, 10])
`);
  });

  it('omits the shape comment when the design does not check out', () => {
    const code = toPyTorch({
      input: { shape: [1, 10] },
      layers: [{ id: 'a', type: 'linear', inFeatures: 5, outFeatures: 2 }],
    });
    expect(code).toContain('print(model(x).shape)\n');
  });
});
