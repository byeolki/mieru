/** Largest avatar file accepted; the browser sends a 256 × 256 PNG, usually well under this. */
export const AVATAR_MAX_BYTES = 512 * 1024;
/** Largest side accepted, with room above the 256 px the client produces. */
export const AVATAR_MAX_SIDE = 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_OFFSET = 8;
const MIN_PNG_BYTES = 33;

export type AvatarCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: 'too_large' | 'not_png' | 'bad_size' };

/**
 * Accepts only a PNG within the size limits, read from its header. The client re-encodes every
 * photo to PNG, so other formats (and anything a browser might sniff as HTML) never get stored.
 */
export function checkAvatarPng(bytes: Buffer): AvatarCheck {
  if (bytes.length > AVATAR_MAX_BYTES) return { ok: false, reason: 'too_large' };
  if (bytes.length < MIN_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, reason: 'not_png' };
  }
  if (bytes.toString('ascii', IHDR_OFFSET + 4, IHDR_OFFSET + 8) !== 'IHDR') {
    return { ok: false, reason: 'not_png' };
  }
  const width = bytes.readUInt32BE(IHDR_OFFSET + 8);
  const height = bytes.readUInt32BE(IHDR_OFFSET + 12);
  if (width === 0 || height === 0 || width > AVATAR_MAX_SIDE || height > AVATAR_MAX_SIDE) {
    return { ok: false, reason: 'bad_size' };
  }
  return { ok: true, width, height };
}
