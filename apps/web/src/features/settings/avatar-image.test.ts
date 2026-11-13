import { describe, expect, it } from 'vitest';
import { centerSquare } from './avatar-image.js';

describe('centerSquare', () => {
  it('takes the middle of a wide photo', () => {
    expect(centerSquare(400, 300)).toEqual({ x: 50, y: 0, side: 300 });
  });

  it('takes the middle of a tall photo', () => {
    expect(centerSquare(300, 500)).toEqual({ x: 0, y: 100, side: 300 });
  });
});
