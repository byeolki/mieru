import type { OpFamily } from '@mieru/shared';

export type { OpFamily };

/**
 * Muted data palette, capped at six families so the graph stays readable. Kept apart from
 * brand colors so a data color never reads as selection.
 */
export const OP_COLORS: Record<OpFamily, string> = {
  compute: '#5B7FC4',
  attention: '#D7795A',
  normalization: '#46A596',
  activation: '#E3B14A',
  shape: '#9A92BE',
  other: '#C9C2D6',
};

export const OP_FAMILY_LABELS: Record<OpFamily, string> = {
  compute: '연산',
  attention: '어텐션',
  normalization: '정규화',
  activation: '활성화',
  shape: '형태 · 풀링',
  other: '기타',
};
