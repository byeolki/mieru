import { describe, expect, it } from 'vitest';
import { MODEL_SLUG_MAX, modelSlugFromName } from './models.js';

describe('modelSlugFromName', () => {
  it('keeps URL-safe names as they are, lowercased', () => {
    expect(modelSlugFromName('Gemma-3-270m-it')).toBe('gemma-3-270m-it');
    expect(modelSlugFromName('resnet_50.v2')).toBe('resnet_50.v2');
  });

  it('collapses spaces and other characters into single dashes', () => {
    expect(modelSlugFromName('  My  감정 분류기 (v2)! ')).toBe('my-v2');
  });

  it('falls back to "model" when nothing URL-safe is left', () => {
    expect(modelSlugFromName('감정 분류기')).toBe('model');
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = modelSlugFromName(`${'a'.repeat(MODEL_SLUG_MAX - 1)} b`);
    expect(slug.length).toBeLessThanOrEqual(MODEL_SLUG_MAX);
    expect(slug.endsWith('-')).toBe(false);
  });
});
