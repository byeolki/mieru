import { describe, expect, it } from 'vitest';
import { formatFromFilename, hasExpectedMagic, sanitizeFilename } from './formats.js';

describe('formatFromFilename', () => {
  it('accepts supported formats case-insensitively', () => {
    expect(formatFromFilename('ResNet.ONNX')).toEqual({ ok: true, format: 'onnx' });
    expect(formatFromFilename('model.safetensors')).toEqual({ ok: true, format: 'safetensors' });
  });

  it('rejects pickle formats with a conversion hint', () => {
    expect(formatFromFilename('model.pt')).toEqual({
      ok: false,
      code: 'unsupported_format',
      hint: 'convert',
    });
    expect(formatFromFilename('notes.txt')).toEqual({
      ok: false,
      code: 'unsupported_format',
      hint: null,
    });
  });
});

describe('sanitizeFilename', () => {
  it('removes separators and control characters', () => {
    expect(sanitizeFilename('../../etc/pass\u0000wd.onnx')).toBe('....etcpasswd.onnx');
    expect(sanitizeFilename('   ')).toBe('model');
  });
});

describe('hasExpectedMagic', () => {
  it('checks the ONNX ir_version tag and the safetensors header', () => {
    expect(hasExpectedMagic('onnx', Buffer.from([0x08, 0x09]), 2)).toBe(true);
    expect(hasExpectedMagic('onnx', Buffer.from('hello'), 5)).toBe(false);
    const header = Buffer.alloc(16);
    header.writeBigUInt64LE(4n);
    header[8] = 0x7b;
    expect(hasExpectedMagic('safetensors', header, 16)).toBe(true);
    expect(hasExpectedMagic('safetensors', header, 10)).toBe(false);
  });
});
