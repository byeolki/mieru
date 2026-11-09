import { describe, expect, it } from 'vitest';
import { angleAtFraction, arcMidAngles } from './TiltedOrbit.js';

describe('angleAtFraction', () => {
  it('matches the angle on a circle, where length and angle are proportional', () => {
    expect(angleAtFraction({ rx: 10, ry: 10 }, 0.25)).toBeCloseTo(90, 0);
    expect(angleAtFraction({ rx: 10, ry: 10 }, 0.5)).toBeCloseTo(180, 0);
  });

  it('moves faster through the flat sides of a wide ellipse', () => {
    // A quarter of the length is reached before the end of the first quadrant's angle span.
    expect(angleAtFraction({ rx: 345, ry: 98 }, 0.125)).toBeGreaterThan(45);
  });
});

describe('arcMidAngles', () => {
  it('gives the middle of each weighted arc', () => {
    const angles = arcMidAngles({ cx: 0, cy: 0, rx: 10, ry: 10, tiltDegrees: 0 }, [
      { family: 'compute', weight: 1 },
      { family: 'attention', weight: 1 },
    ]);
    expect(angles[0]).toBeCloseTo(90, 0);
    expect(angles[1]).toBeCloseTo(270, 0);
  });
});
