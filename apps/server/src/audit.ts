import { execute, type Queryable } from './db/query.js';

export interface AuditEvent {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

/** Appends a security-relevant event. Callers must not put PII (emails, tokens) in `meta`. */
export async function recordAudit(db: Queryable, event: AuditEvent): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_events (actor_id, action, target_type, target_id, ip, meta)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.actorId,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      event.ip ?? null,
      event.meta ? JSON.stringify(event.meta) : null,
    ],
  );
}
