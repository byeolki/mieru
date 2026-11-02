import { describe, expect, it } from 'vitest';
import { BACKUP_STALE_MS, evaluateDeepHealth, type DeepHealthInputs } from './health.js';

const NOW = new Date('2026-11-02T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const healthy: DeepHealthInputs = {
  db: 'ok',
  storage: 'ok',
  freeBytes: 100,
  diskReserveBytes: 50,
  stuckVersions: 0,
  trendingLastRunAt: minutesAgo(10),
  startedAt: minutesAgo(600),
};

describe('evaluateDeepHealth', () => {
  it('is ok when every check passes and backups are not configured', () => {
    const report = evaluateDeepHealth(healthy, NOW);
    expect(report.status).toBe('ok');
    expect(report.checks.backups?.status).toBe('skipped');
  });

  it.each<[string, Partial<DeepHealthInputs>, string]>([
    ['free space below the reserve', { freeBytes: 49 }, 'disk'],
    ['an unreadable disk', { freeBytes: null }, 'disk'],
    ['a stuck version', { stuckVersions: 1 }, 'processing'],
    ['trending older than an hour', { trendingLastRunAt: minutesAgo(61) }, 'trending'],
    [
      'a stale backup',
      { newestBackupAt: new Date(NOW.getTime() - BACKUP_STALE_MS - 1) },
      'backups',
    ],
    ['an empty backup directory', { newestBackupAt: null }, 'backups'],
  ])('fails on %s', (_name, override, check) => {
    const report = evaluateDeepHealth({ ...healthy, ...override }, NOW);
    expect(report.status).toBe('error');
    expect(report.checks[check]?.status).toBe('error');
  });

  it('gives a freshly started process an hour before trending counts as stale', () => {
    const fresh = { ...healthy, trendingLastRunAt: null, startedAt: minutesAgo(5) };
    expect(evaluateDeepHealth(fresh, NOW).status).toBe('ok');
    expect(evaluateDeepHealth({ ...fresh, startedAt: minutesAgo(61) }, NOW).status).toBe('error');
  });
});
