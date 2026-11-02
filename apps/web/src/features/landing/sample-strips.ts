import type { StripSegment } from '../../components/ArchitectureStrip.js';

const repeat = (pattern: StripSegment[], times: number): StripSegment[] =>
  Array.from({ length: times }, () => pattern).flat();

export const RESNET_STRIP: StripSegment[] = [
  { category: 'compute', weight: 3 },
  { category: 'normalization', weight: 1 },
  { category: 'activation', weight: 1 },
  { category: 'shape', weight: 1 },
  ...repeat(
    [
      { category: 'compute', weight: 2 },
      { category: 'normalization', weight: 1 },
      { category: 'activation', weight: 1 },
      { category: 'compute', weight: 2 },
      { category: 'normalization', weight: 1 },
      { category: 'other', weight: 1 },
      { category: 'activation', weight: 1 },
    ],
    8,
  ),
  { category: 'shape', weight: 1 },
  { category: 'shape', weight: 1 },
  { category: 'compute', weight: 2 },
];

export const TRANSFORMER_STRIP: StripSegment[] = [
  { category: 'shape', weight: 2 },
  { category: 'other', weight: 1 },
  ...repeat(
    [
      { category: 'normalization', weight: 1 },
      { category: 'compute', weight: 3 },
      { category: 'attention', weight: 2 },
      { category: 'compute', weight: 1 },
      { category: 'other', weight: 1 },
      { category: 'normalization', weight: 1 },
      { category: 'compute', weight: 2 },
      { category: 'activation', weight: 1 },
      { category: 'compute', weight: 2 },
      { category: 'other', weight: 1 },
    ],
    6,
  ),
  { category: 'normalization', weight: 1 },
  { category: 'compute', weight: 2 },
];

export const UNET_STRIP: StripSegment[] = [
  ...repeat(
    [
      { category: 'compute', weight: 2 },
      { category: 'normalization', weight: 1 },
      { category: 'activation', weight: 1 },
      { category: 'shape', weight: 1 },
    ],
    4,
  ),
  ...repeat(
    [
      { category: 'shape', weight: 1 },
      { category: 'other', weight: 1 },
      { category: 'compute', weight: 2 },
      { category: 'activation', weight: 1 },
    ],
    4,
  ),
  { category: 'compute', weight: 1 },
];
