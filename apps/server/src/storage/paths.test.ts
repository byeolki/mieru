import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathFor } from './paths.js';

const key = '01933c1e-7a6b-7cde-8f00-123456789abc';

describe('pathFor', () => {
  it('builds paths inside the storage area', () => {
    expect(pathFor('/data/storage', 'blobs', key)).toBe(path.join('/data/storage/blobs', key));
    expect(pathFor('/data/storage', 'parsed', key, '.v1.json.gz')).toBe(
      path.join('/data/storage/parsed', `${key}.v1.json.gz`),
    );
  });

  it('rejects anything that is not a generated key', () => {
    for (const hostile of [
      '../etc/passwd',
      `${key}/../../x`,
      'model.onnx',
      key.toUpperCase(),
      '',
    ]) {
      expect(() => pathFor('/data/storage', 'blobs', hostile)).toThrow('Invalid storage key');
    }
  });

  it('rejects suffixes that could escape the directory', () => {
    expect(() => pathFor('/data/storage', 'parsed', key, '/../../x')).toThrow(
      'Invalid storage suffix',
    );
  });
});
