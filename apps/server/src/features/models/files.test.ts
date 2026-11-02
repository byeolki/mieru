import { describe, expect, it } from 'vitest';
import { contentDisposition, parseRange } from './files.js';

describe('parseRange', () => {
  it('parses bounded, open and suffix ranges', () => {
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('flags unsatisfiable ranges and ignores other forms', () => {
    expect(parseRange('bytes=2000-', 1000)).toBe('invalid');
    expect(parseRange('bytes=-', 1000)).toBe('invalid');
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull();
    expect(parseRange(undefined, 1000)).toBeNull();
  });
});

describe('contentDisposition', () => {
  it('encodes non-ASCII names and escapes quotes', () => {
    expect(contentDisposition('모델 "v2".onnx')).toBe(
      `attachment; filename="__ _v2_.onnx"; filename*=UTF-8''%EB%AA%A8%EB%8D%B8%20%22v2%22.onnx`,
    );
  });
});
