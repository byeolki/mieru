export const OP_CATEGORIES = [
  'conv',
  'matmul',
  'normalization',
  'activation',
  'pooling',
  'elementwise',
  'shape',
  'attention',
  'control',
  'other',
] as const;

export type OpCategory = (typeof OP_CATEGORIES)[number];

/** Data palette for op categories; kept apart from brand colors so data never reads as selection. */
export const OP_COLORS: Record<OpCategory, string> = {
  conv: '#3B6FB6',
  matmul: '#8A5CC2',
  normalization: '#2F9E8F',
  activation: '#E0A125',
  pooling: '#5E9C3A',
  elementwise: '#9AA3B5',
  shape: '#C9CED9',
  attention: '#D2603A',
  control: '#6B4E3D',
  other: '#B7BCC8',
};
