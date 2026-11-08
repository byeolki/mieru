import { describe, expect, it } from 'vitest';
import { appendGraphOutputs, encodeExtraOutputs } from './onnx-outputs.js';

describe('encodeExtraOutputs', () => {
  it('nests each name as graph.output.name', () => {
    // 0x3a = field 7 (graph), 0x62 = field 12 (output), 0x0a = field 1 (name), all length-delimited.
    expect([...encodeExtraOutputs(['a'])]).toEqual([0x3a, 0x05, 0x62, 0x03, 0x0a, 0x01, 0x61]);
  });

  it('uses multi-byte varints for long names', () => {
    const name = 'x'.repeat(200);
    const bytes = encodeExtraOutputs([name]);
    // 200 = 0xc8 0x01 as a varint; the name length prefix must use both bytes.
    expect([...bytes.slice(7, 9)]).toEqual([0xc8, 0x01]);
    expect(bytes.length).toBe(1 + 2 + 1 + 2 + 1 + 2 + 200);
  });

  it('encodes UTF-8 names by byte length', () => {
    expect([...encodeExtraOutputs(['한'])]).toEqual([
      0x3a, 0x07, 0x62, 0x05, 0x0a, 0x03, 0xed, 0x95, 0x9c,
    ]);
  });
});

describe('appendGraphOutputs', () => {
  it('keeps the original bytes and appends the suffix', () => {
    const model = Uint8Array.from([1, 2, 3]);
    expect([...appendGraphOutputs(model, ['a'])]).toEqual([
      1, 2, 3, 0x3a, 0x05, 0x62, 0x03, 0x0a, 0x01, 0x61,
    ]);
  });

  it('returns the model untouched when nothing is requested', () => {
    const model = Uint8Array.from([1, 2, 3]);
    expect(appendGraphOutputs(model, [])).toBe(model);
  });
});
