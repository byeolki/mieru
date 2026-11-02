import type { OpFamily } from '@mieru/shared';

export type { OpFamily };

/**
 * Muted data palette, capped at six families so the graph stays readable. Kept apart from
 * brand colors so a data color never reads as selection.
 */
export const OP_COLORS: Record<OpFamily, string> = {
  compute: '#4F74B8',
  attention: '#C76A4A',
  normalization: '#3E9688',
  activation: '#D9A53F',
  shape: '#8E8AA8',
  other: '#BCC1CC',
};

export const OP_FAMILY_LABELS: Record<OpFamily, string> = {
  compute: '연산',
  attention: '어텐션',
  normalization: '정규화',
  activation: '활성화',
  shape: '형태 · 풀링',
  other: '기타',
};
