/** Remembers when each background job last succeeded in this process, for the deep health check. */
export class JobTracker {
  private readonly lastSuccess = new Map<string, Date>();

  constructor(readonly startedAt: Date) {}

  record(name: string, at: Date): void {
    this.lastSuccess.set(name, at);
  }

  lastSuccessOf(name: string): Date | null {
    return this.lastSuccess.get(name) ?? null;
  }
}
