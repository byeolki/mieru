import { z } from 'zod';

const GIB = 1024 ** 3;
const MIN_SECRET_LENGTH = 32;

const secret = z
  .string()
  .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`);
const byteSize = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Local dev and e2e create many accounts from one IP; production always keeps limits on.
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DATABASE_URL: z.string().startsWith('mysql://'),
  JWT_SECRET: secret,
  LINK_TOKEN_KEY: secret,
  TICKET_SECRET: secret,
  VIEW_SALT_SECRET: secret,
  STORAGE_DIR: z.string().min(1),
  WEB_DIST_DIR: z.string().optional(),
  /** Read-only mount of the backup directory; the deep health check alerts when it goes stale. */
  BACKUP_DIR: z.string().optional(),
  MAX_ONNX_BYTES: byteSize(2 * GIB),
  MAX_SAFETENSORS_BYTES: byteSize(10 * GIB),
  MAX_REPO_BYTES: byteSize(10 * GIB),
  MAX_EXTERNAL_DATA_BYTES: byteSize(10 * GIB),
  DISK_RESERVE_BYTES: byteSize(50 * GIB),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Parses and validates configuration from environment variables.
 * @throws {Error} listing every invalid or missing variable, so a misconfigured deploy fails at boot.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (result.success) return result.data;
  const problems = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid configuration: ${problems}`);
}
