import type { Pool } from 'mysql2/promise';
import type {
  AdminReport,
  CreateReportBody,
  IssueState,
  ReportReason,
  ReportStatus,
  ResolveReportBody,
} from '@mieru/shared';
import { recordAudit } from '../../audit.js';
import { execute, limitParam, selectOne, selectRows, type Queryable } from '../../db/query.js';
import { AppError, notFound } from '../../errors.js';
import { newId } from '../../ids.js';
import { softDeleteIssue } from '../issues/service.js';

const REPORT_PAGE = 100;

export interface Reporter {
  userId: string | null;
  ip: string;
}

/** Files a report against a repository, or against one of its issues when `issueNumber` is set. */
export async function createReport(
  db: Pool,
  modelId: string,
  body: CreateReportBody,
  reporter: Reporter,
  now: Date,
): Promise<void> {
  let issueId: string | null = null;
  if (body.issueNumber !== undefined) {
    const issue = await selectOne<{ id: string }>(
      db,
      'SELECT id FROM issues WHERE model_id = ? AND number = ? AND deleted_at IS NULL',
      [modelId, body.issueNumber],
    );
    if (!issue) throw notFound('Issue not found');
    issueId = issue.id;
  }
  await execute(
    db,
    `INSERT INTO reports (id, model_id, issue_id, reporter_id, reason, details, reporter_ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      modelId,
      issueId,
      reporter.userId,
      body.reason,
      body.details || null,
      reporter.ip,
      now,
    ],
  );
}

interface ReportRow {
  id: string;
  model_id: string;
  issue_id: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: Date;
  resolved_at: Date | null;
  reporter_username: string | null;
  resolver_username: string | null;
  model_name: string;
  owner_username: string;
  taken_down_at: Date | null;
  issue_number: number | null;
  issue_title: string | null;
  issue_state: IssueState | null;
  issue_deleted_at: Date | null;
}

const REPORT_SELECT = `
  SELECT r.id, r.model_id, r.issue_id, r.reason, r.details, r.status, r.created_at, r.resolved_at,
         reporter.username AS reporter_username, resolver.username AS resolver_username,
         m.name AS model_name, owner.username AS owner_username, m.taken_down_at,
         i.number AS issue_number, i.title AS issue_title, i.state AS issue_state,
         i.deleted_at AS issue_deleted_at
    FROM reports r
    JOIN models m ON m.id = r.model_id
    JOIN users owner ON owner.id = m.owner_id
    LEFT JOIN users reporter ON reporter.id = r.reporter_id
    LEFT JOIN users resolver ON resolver.id = r.resolved_by
    LEFT JOIN issues i ON i.id = r.issue_id`;

function toAdminReport(row: ReportRow): AdminReport {
  return {
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    reporterUsername: row.reporter_username,
    resolverUsername: row.resolver_username,
    model: {
      id: row.model_id,
      name: row.model_name,
      ownerUsername: row.owner_username,
      takenDown: row.taken_down_at !== null,
    },
    issue:
      row.issue_number !== null && row.issue_title !== null
        ? {
            number: row.issue_number,
            title: row.issue_title,
            deleted: row.issue_deleted_at !== null,
          }
        : null,
  };
}

/** Open reports oldest first so nothing starves; resolved ones newest first for reference. */
export async function listReports(db: Pool, status: ReportStatus): Promise<AdminReport[]> {
  const order = status === 'open' ? 'r.created_at ASC' : 'r.resolved_at DESC';
  const rows = await selectRows<ReportRow>(
    db,
    `${REPORT_SELECT} WHERE r.status = ? ORDER BY ${order}, r.id LIMIT ?`,
    [status, limitParam(REPORT_PAGE)],
  );
  return rows.map(toAdminReport);
}

async function setTakedown(db: Queryable, modelId: string, reason: string | null, now: Date) {
  const result = await execute(
    db,
    'UPDATE models SET taken_down_at = ?, taken_down_reason = ? WHERE id = ?',
    [reason === null ? null : now, reason, modelId],
  );
  if (result.affectedRows === 0) throw notFound('Model not found');
}

/** Hides a repository from everyone but its owner (read-only) and admins. */
export async function takedownModel(
  db: Pool,
  modelId: string,
  reason: string,
  adminId: string,
  now: Date,
): Promise<void> {
  await setTakedown(db, modelId, reason, now);
  await recordAudit(db, {
    actorId: adminId,
    action: 'model.takedown',
    targetType: 'model',
    targetId: modelId,
  });
}

export async function restoreModel(
  db: Pool,
  modelId: string,
  adminId: string,
  now: Date,
): Promise<void> {
  await setTakedown(db, modelId, null, now);
  await recordAudit(db, {
    actorId: adminId,
    action: 'model.restore',
    targetType: 'model',
    targetId: modelId,
  });
}

const DEFAULT_TAKEDOWN_REASON = '신고 검토 결과 운영 정책에 따라 비공개 처리되었어요.';

/**
 * Applies an admin decision. Taking a repository down also closes every other open report on
 * it, since they no longer need a decision.
 */
export async function resolveReport(
  db: Pool,
  reportId: string,
  body: ResolveReportBody,
  adminId: string,
  now: Date,
): Promise<void> {
  const row = await selectOne<ReportRow>(db, `${REPORT_SELECT} WHERE r.id = ?`, [reportId]);
  if (!row) throw notFound('Report not found');
  if (row.status !== 'open') throw new AppError(409, 'already_resolved', 'Report already resolved');

  if (body.action === 'takedown') {
    await takedownModel(db, row.model_id, body.reason ?? DEFAULT_TAKEDOWN_REASON, adminId, now);
    await execute(
      db,
      `UPDATE reports SET status = 'actioned', resolved_by = ?, resolved_at = ?
        WHERE model_id = ? AND status = 'open'`,
      [adminId, now, row.model_id],
    );
    return;
  }
  if (body.action === 'delete_issue') {
    if (!row.issue_id || !row.issue_state)
      throw new AppError(400, 'no_issue', 'This report is not about an issue');
    await softDeleteIssue(
      db,
      { id: row.issue_id, model_id: row.model_id, state: row.issue_state },
      now,
    );
    await recordAudit(db, {
      actorId: adminId,
      action: 'issue.delete',
      targetType: 'issue',
      targetId: row.issue_id,
    });
  }
  await execute(
    db,
    'UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?',
    [body.action === 'dismiss' ? 'dismissed' : 'actioned', adminId, now, reportId],
  );
}
