import { describe, expect, it } from 'vitest';
import { pngHeader } from '../../../test/fixtures/builders.js';
import { AVATAR_MAX_BYTES, checkAvatarPng } from './png.js';

describe('checkAvatarPng', () => {
  it('accepts a square PNG within the limits', () => {
    expect(checkAvatarPng(pngHeader(256, 256))).toEqual({ ok: true, width: 256, height: 256 });
  });

  it('rejects other formats, oversized images and oversized files', () => {
    expect(checkAvatarPng(Buffer.from('<html><script>x</script></html>'.padEnd(40)))).toEqual({
      ok: false,
      reason: 'not_png',
    });
    expect(checkAvatarPng(pngHeader(4096, 256))).toEqual({ ok: false, reason: 'bad_size' });
    expect(
      checkAvatarPng(Buffer.concat([pngHeader(256, 256), Buffer.alloc(AVATAR_MAX_BYTES)])),
    ).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});
