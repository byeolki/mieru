import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const validEnv = {
  APP_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/db',
  JWT_SECRET: 'j'.repeat(32),
  LINK_TOKEN_KEY: 'l'.repeat(32),
  TICKET_SECRET: 't'.repeat(32),
  VIEW_SALT_SECRET: 'v'.repeat(32),
  STORAGE_DIR: '/tmp/mieru',
};

describe('loadConfig', () => {
  it('applies defaults for optional values', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.MAX_ONNX_BYTES).toBe(2 * 1024 ** 3);
    expect(config.TRUST_PROXY).toBe(0);
  });

  it('fails fast when a secret is missing', () => {
    const { JWT_SECRET: _omitted, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow(/JWT_SECRET/);
  });

  it('rejects secrets that are too short', () => {
    expect(() => loadConfig({ ...validEnv, TICKET_SECRET: 'short' })).toThrow(/TICKET_SECRET/);
  });
});
