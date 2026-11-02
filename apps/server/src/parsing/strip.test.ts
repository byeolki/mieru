import { describe, expect, it } from 'vitest';
import { buildStrip } from './strip.js';
import { opFamily, tensorFamily } from './families.js';

describe('buildStrip', () => {
  it('merges adjacent runs of the same family', () => {
    expect(
      buildStrip([
        { family: 'compute', weight: 1 },
        { family: 'compute', weight: 1 },
        { family: 'activation', weight: 1 },
        { family: 'compute', weight: 1 },
      ]),
    ).toEqual([
      { family: 'compute', weight: 2 },
      { family: 'activation', weight: 1 },
      { family: 'compute', weight: 1 },
    ]);
  });

  it('caps very long sequences', () => {
    const items = Array.from({ length: 10_000 }, (_, index) => ({
      family: index % 2 === 0 ? ('compute' as const) : ('activation' as const),
      weight: 1,
    }));
    const strip = buildStrip(items);
    expect(strip.length).toBeLessThanOrEqual(512);
    expect(Math.round(strip.reduce((sum, segment) => sum + segment.weight, 0))).toBe(10_000);
    // Both families survive compression instead of collapsing to the dominant one.
    expect(new Set(strip.map((segment) => segment.family))).toEqual(
      new Set(['compute', 'activation']),
    );
  });
});

describe('families', () => {
  it('maps common ops', () => {
    expect(opFamily('Conv')).toBe('compute');
    expect(opFamily('LayerNormalization')).toBe('normalization');
    expect(opFamily('MaxPool')).toBe('shape');
    expect(opFamily('Add')).toBe('other');
  });

  it('infers tensor families from names', () => {
    expect(tensorFamily('model.layers.0.self_attn.q_proj.weight', 2)).toBe('attention');
    expect(tensorFamily('model.layers.0.input_layernorm.weight', 1)).toBe('normalization');
    expect(tensorFamily('model.embed_tokens.weight', 2)).toBe('shape');
    expect(tensorFamily('model.layers.0.mlp.up_proj.weight', 2)).toBe('compute');
  });
});
