import { describe, expect, it } from 'vitest';
import { scoreTrending, type TrendingEvent } from './trending.js';

const now = new Date('2026-11-08T00:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
const star = (modelId: string, hours: number, actor: string): TrendingEvent => ({
  modelId,
  kind: 'star',
  at: hoursAgo(hours),
  actor,
});

describe('scoreTrending', () => {
  it('ranks recent activity above older, larger activity', () => {
    const scores = scoreTrending(
      [
        star('fresh', 20, 'a'),
        star('fresh', 22, 'b'),
        star('fresh', 24, 'c'),
        ...['a', 'b', 'c', 'd', 'e'].map((actor) => star('old', 6 * 24, actor)),
      ],
      now,
    );
    expect(scores.map((score) => score.modelId)).toEqual(['fresh', 'old']);
  });

  it('ignores models pushed by a single person', () => {
    const scores = scoreTrending(
      [star('solo', 1, 'a'), { modelId: 'solo', kind: 'issue', at: hoursAgo(1), actor: 'a' }],
      now,
    );
    expect(scores).toEqual([]);
  });

  it('weights stars over views', () => {
    const scores = scoreTrending(
      [
        star('starred', 1, 'a'),
        star('starred', 1, 'b'),
        { modelId: 'viewed', kind: 'view', at: hoursAgo(1), actor: 'v1' },
        { modelId: 'viewed', kind: 'view', at: hoursAgo(1), actor: 'v2' },
      ],
      now,
    );
    expect(scores[0]?.modelId).toBe('starred');
    expect(scores[0]?.score).toBeCloseTo(6, 0);
  });
});
