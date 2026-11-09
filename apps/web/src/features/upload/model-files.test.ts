import { describe, expect, it } from 'vitest';
import { splitModelFiles } from './model-files.js';

const file = (name: string) => new File([new Uint8Array(1)], name);

describe('splitModelFiles', () => {
  it('takes the .onnx as the model and everything else as external data', () => {
    const model = file('llm.onnx');
    const data = file('llm.onnx.data');
    expect(splitModelFiles([data, model])).toEqual({ ok: true, model, dataFiles: [data] });
  });

  it('accepts a single model file', () => {
    const model = file('weights.safetensors');
    expect(splitModelFiles([model])).toEqual({ ok: true, model, dataFiles: [] });
  });

  it('needs exactly one model file', () => {
    expect(splitModelFiles([file('a.data')])).toEqual({ ok: false, reason: 'no_model' });
    expect(splitModelFiles([file('a.onnx'), file('b.onnx')])).toEqual({
      ok: false,
      reason: 'several_models',
    });
  });

  it('only lets ONNX models bring data files', () => {
    expect(splitModelFiles([file('w.safetensors'), file('x.bin')])).toEqual({
      ok: false,
      reason: 'data_needs_onnx',
    });
  });
});
