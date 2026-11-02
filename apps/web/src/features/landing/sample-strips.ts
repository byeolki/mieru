import type { StripSegment } from '../../components/ArchitectureStrip.js';

const repeat = (pattern: StripSegment[], times: number): StripSegment[] =>
  Array.from({ length: times }, () => pattern).flat();

export const RESNET_STRIP: StripSegment[] = [
  { family: 'compute', weight: 3 },
  { family: 'normalization', weight: 1 },
  { family: 'activation', weight: 1 },
  { family: 'shape', weight: 1 },
  ...repeat(
    [
      { family: 'compute', weight: 2 },
      { family: 'normalization', weight: 1 },
      { family: 'activation', weight: 1 },
      { family: 'compute', weight: 2 },
      { family: 'normalization', weight: 1 },
      { family: 'other', weight: 1 },
      { family: 'activation', weight: 1 },
    ],
    8,
  ),
  { family: 'shape', weight: 1 },
  { family: 'shape', weight: 1 },
  { family: 'compute', weight: 2 },
];

export const TRANSFORMER_STRIP: StripSegment[] = [
  { family: 'shape', weight: 2 },
  { family: 'other', weight: 1 },
  ...repeat(
    [
      { family: 'normalization', weight: 1 },
      { family: 'compute', weight: 3 },
      { family: 'attention', weight: 2 },
      { family: 'compute', weight: 1 },
      { family: 'other', weight: 1 },
      { family: 'normalization', weight: 1 },
      { family: 'compute', weight: 2 },
      { family: 'activation', weight: 1 },
      { family: 'compute', weight: 2 },
      { family: 'other', weight: 1 },
    ],
    6,
  ),
  { family: 'normalization', weight: 1 },
  { family: 'compute', weight: 2 },
];

export const UNET_STRIP: StripSegment[] = [
  ...repeat(
    [
      { family: 'compute', weight: 2 },
      { family: 'normalization', weight: 1 },
      { family: 'activation', weight: 1 },
      { family: 'shape', weight: 1 },
    ],
    4,
  ),
  ...repeat(
    [
      { family: 'shape', weight: 1 },
      { family: 'other', weight: 1 },
      { family: 'compute', weight: 2 },
      { family: 'activation', weight: 1 },
    ],
    4,
  ),
  { family: 'compute', weight: 1 },
];
