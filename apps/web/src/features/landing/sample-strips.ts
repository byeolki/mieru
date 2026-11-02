import type { StripSegment } from '../../components/ArchitectureStrip.js';

const repeat = (pattern: StripSegment[], times: number): StripSegment[] =>
  Array.from({ length: times }, () => pattern).flat();

export const RESNET_STRIP: StripSegment[] = [
  { category: 'conv', weight: 3 },
  { category: 'normalization', weight: 1 },
  { category: 'activation', weight: 1 },
  { category: 'pooling', weight: 1 },
  ...repeat(
    [
      { category: 'conv', weight: 2 },
      { category: 'normalization', weight: 1 },
      { category: 'activation', weight: 1 },
      { category: 'conv', weight: 2 },
      { category: 'normalization', weight: 1 },
      { category: 'elementwise', weight: 1 },
      { category: 'activation', weight: 1 },
    ],
    8,
  ),
  { category: 'pooling', weight: 1 },
  { category: 'shape', weight: 1 },
  { category: 'matmul', weight: 2 },
];

export const TRANSFORMER_STRIP: StripSegment[] = [
  { category: 'shape', weight: 2 },
  { category: 'elementwise', weight: 1 },
  ...repeat(
    [
      { category: 'normalization', weight: 1 },
      { category: 'matmul', weight: 3 },
      { category: 'attention', weight: 2 },
      { category: 'matmul', weight: 1 },
      { category: 'elementwise', weight: 1 },
      { category: 'normalization', weight: 1 },
      { category: 'matmul', weight: 2 },
      { category: 'activation', weight: 1 },
      { category: 'matmul', weight: 2 },
      { category: 'elementwise', weight: 1 },
    ],
    6,
  ),
  { category: 'normalization', weight: 1 },
  { category: 'matmul', weight: 2 },
];

export const UNET_STRIP: StripSegment[] = [
  ...repeat(
    [
      { category: 'conv', weight: 2 },
      { category: 'normalization', weight: 1 },
      { category: 'activation', weight: 1 },
      { category: 'pooling', weight: 1 },
    ],
    4,
  ),
  ...repeat(
    [
      { category: 'shape', weight: 1 },
      { category: 'elementwise', weight: 1 },
      { category: 'conv', weight: 2 },
      { category: 'activation', weight: 1 },
    ],
    4,
  ),
  { category: 'conv', weight: 1 },
];
