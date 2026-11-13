import type { Pool } from 'mysql2/promise';
import {
  hasRoleAtLeast,
  type ActivityItem,
  type Issue,
  type IssueKind,
  type IssueListItem,
  type IssueState,
  type ModelAccess,
  type Reply,
} from '@mieru/shared';
import { execute, limitParam, selectOne, selectRows, withTransaction } from '../../db/query.js';
import { AppError, forbidden, notFound } from '../../errors.js';
import { newId } from '../../ids.js';

const REPLY_PAGE = 200;
const ACTIVITY_LIMIT = 50;

interface IssueRow {
  id: string;
  model_id: string;
  number: number;
  kind: IssueKind;
  title: string;
  body_md: string;
  node_ref: string | null;
  state: IssueState;
  closed_at: Date | null;
  locked_at: Date | null;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  closer_username: string | null;
  closer_display_name: string | null;
  reply_count: number;
  last_activity_at: Date;
  deleted_at: Date | null;
  created_at: Date;
}

const ISSUE_SELECT = `
  SELECT i.id, i.model_id, i.number, i.kind, i.title, i.body_md, i.node_ref, i.state, i.closed_at,
         i.locked_at, i.author_id, a.username AS author_username, a.display_name AS author_display_name,
         c.username AS closer_username, c.display_name AS closer_display_name,
         i.reply_count, i.last_activity_at, i.deleted_at, i.created_at
    FROM issues i
    LEFT JOIN users a ON a.id = i.author_id
    LEFT JOIN users c ON c.id = i.closed_by`;

const userRef = (username: string | null, displayName: string | null) =>
  username ? { username, displayName: displayName ?? username } : null;

function toListItem(row: IssueRow): IssueListItem {
  return {
    number: row.number,
    kind: row.kind,
    title: row.deleted_at ? '삭제된 이슈' : row.title,
    state: row.state,
    author: userRef(row.author_username, row.author_display_name),
    nodeRef: row.node_ref,
    replyCount: row.reply_count,
    locked: row.locked_at !== null,
    lastActivityAt: row.last_activity_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

const canModerate = (access: ModelAccess) => hasRoleAtLeast(access.role, 'editor');

async function findIssue(pool: Pool, modelId: string, number: number): Promise<IssueRow> {
  const row = await selectOne<IssueRow>(
    pool,
    `${ISSUE_SELECT} WHERE i.model_id = ? AND i.number = ?`,
    [modelId, number],
  );
  if (!row) throw notFound('Issue not found');
  return row;
}

export async function listIssues(
  pool: Pool,
  modelId: string,
  filter: { state: IssueState; kind?: IssueKind; nodeRef?: string; limit: number; cursor?: string },
): Promise<{
  items: IssueListItem[];
  counts: { open: number; closed: number };
  nextCursor: string | null;
}> {
  const clauses = ['i.model_id = ?', 'i.state = ?', 'i.deleted_at IS NULL'];
  const params: (string | Date)[] = [modelId, filter.state];
  if (filter.kind) {
    clauses.push('i.kind = ?');
    params.push(filter.kind);
  }
  if (filter.nodeRef) {
    clauses.push('i.node_ref = ?');
    params.push(filter.nodeRef);
  }
  if (filter.cursor) {
    const [at, id] = Buffer.from(filter.cursor, 'base64url').toString('utf8').split('|');
    if (at && id) {
      clauses.push('(i.last_activity_at < ? OR (i.last_activity_at = ? AND i.id < ?))');
      params.push(new Date(at), new Date(at), id);
    }
  }
  const rows = await selectRows<IssueRow>(
    pool,
    `${ISSUE_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY i.last_activity_at DESC, i.id DESC LIMIT ?`,
    [...params, limitParam(filter.limit + 1)],
  );
  // SUM() comes back as DECIMAL, which mysql2 returns as a string.
  const counts = await selectOne<{ open: string | number; closed: string | number }>(
    pool,
    `SELECT COALESCE(SUM(state = 'open'), 0) AS open, COALESCE(SUM(state = 'closed'), 0) AS closed
       FROM issues WHERE model_id = ? AND deleted_at IS NULL`,
    [modelId],
  );
  const page = rows.slice(0, filter.limit);
  const last = page.at(-1);
  return {
    items: page.map(toListItem),
    counts: { open: Number(counts?.open ?? 0), closed: Number(counts?.closed ?? 0) },
    nextCursor:
      rows.length > filter.limit && last
        ? Buffer.from(`${last.last_activity_at.toISOString()}|${last.id}`).toString('base64url')
        : null,
  };
}

/** Open-issue counts per graph node, for the badges on the canvas. */
export async function nodeIssueCounts(
  pool: Pool,
  modelId: string,
): Promise<Record<string, number>> {
  const rows = await selectRows<{ node_ref: string; count: number }>(
    pool,
    `SELECT node_ref, COUNT(*) AS count FROM issues
      WHERE model_id = ? AND node_ref IS NOT NULL AND state = 'open' AND deleted_at IS NULL
      GROUP BY node_ref`,
    [modelId],
  );
  return Object.fromEntries(rows.map((row) => [row.node_ref, row.count]));
}

/**
 * Opens an issue. The per-repository number comes from `models.next_issue_number`, read
 * under a row lock so concurrent issues never share a number.
 */
export async function createIssue(
  pool: Pool,
  modelId: string,
  authorId: string,
  input: { kind: IssueKind; title: string; body: string; nodeRef?: string },
  now: Date,
): Promise<number> {
  return withTransaction(pool, async (connection) => {
    const model = await selectOne<{ next_issue_number: number }>(
      connection,
      'SELECT next_issue_number FROM models WHERE id = ? FOR UPDATE',
      [modelId],
    );
    if (!model) throw notFound('Model not found');
    const number = model.next_issue_number;
    await execute(
      connection,
      `INSERT INTO issues (id, model_id, number, kind, title, body_md, node_ref, author_id, last_activity_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        modelId,
        number,
        input.kind,
        input.title,
        input.body,
        input.nodeRef ?? null,
        authorId,
        now,
        now,
      ],
    );
    await execute(
      connection,
      'UPDATE models SET next_issue_number = next_issue_number + 1, open_issue_count = open_issue_count + 1 WHERE id = ?',
      [modelId],
    );
    return number;
  });
}

interface ReplyRow {
  id: string;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  body_md: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function getIssue(
  pool: Pool,
  modelId: string,
  number: number,
  access: ModelAccess,
  userId: string | null,
  now: Date,
): Promise<Issue> {
  const row = await findIssue(pool, modelId, number);
  const replies = await selectRows<ReplyRow>(
    pool,
    `SELECT r.id, r.author_id, u.username AS author_username, u.display_name AS author_display_name,
            r.body_md, r.deleted_at, r.created_at, r.updated_at
       FROM issue_replies r LEFT JOIN users u ON u.id = r.author_id
      WHERE r.issue_id = ? ORDER BY r.created_at, r.id LIMIT ?`,
    [row.id, limitParam(REPLY_PAGE)],
  );
  if (userId) {
    await execute(
      pool,
      `INSERT INTO issue_reads (user_id, issue_id, last_read_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
      [userId, row.id, now],
    );
  }
  const isModerator = canModerate(access);
  const isAuthor = userId !== null && row.author_id === userId;
  return {
    ...toListItem(row),
    body: row.deleted_at ? '' : row.body_md,
    deleted: row.deleted_at !== null,
    closedAt: row.closed_at?.toISOString() ?? null,
    closedBy: userRef(row.closer_username, row.closer_display_name),
    canEdit: isAuthor && row.deleted_at === null,
    canModerate: isModerator,
    canReply: userId !== null && row.deleted_at === null && (row.locked_at === null || isModerator),
    replies: replies.map((reply): Reply => ({
      id: reply.id,
      author: userRef(reply.author_username, reply.author_display_name),
      body: reply.deleted_at ? '' : reply.body_md,
      deleted: reply.deleted_at !== null,
      createdAt: reply.created_at.toISOString(),
      updatedAt: reply.updated_at.toISOString(),
      canEdit: userId !== null && reply.author_id === userId && reply.deleted_at === null,
      canDelete:
        reply.deleted_at === null &&
        ((userId !== null && reply.author_id === userId) || isModerator),
    })),
  };
}

/**
 * Applies issue edits with the author/editor split: authors edit text and open/close their
 * own issue; editors can also relabel, lock and close anyone's.
 */
export async function updateIssue(
  pool: Pool,
  modelId: string,
  number: number,
  access: ModelAccess,
  userId: string,
  changes: {
    title?: string;
    body?: string;
    kind?: IssueKind;
    state?: IssueState;
    locked?: boolean;
  },
  now: Date,
): Promise<void> {
  const row = await findIssue(pool, modelId, number);
  if (row.deleted_at) throw notFound('Issue not found');
  const isAuthor = row.author_id === userId;
  const isModerator = canModerate(access);
  if ((changes.title !== undefined || changes.body !== undefined) && !isAuthor)
    throw forbidden('Only the author can edit the text');
  if ((changes.kind !== undefined || changes.locked !== undefined) && !isModerator)
    throw forbidden('Only editors can do this');
  if (changes.state !== undefined && !isAuthor && !isModerator)
    throw forbidden('Only the author or an editor can close this');

  await withTransaction(pool, async (connection) => {
    if (changes.title !== undefined)
      await execute(connection, 'UPDATE issues SET title = ? WHERE id = ?', [
        changes.title,
        row.id,
      ]);
    if (changes.body !== undefined)
      await execute(connection, 'UPDATE issues SET body_md = ? WHERE id = ?', [
        changes.body,
        row.id,
      ]);
    if (changes.kind !== undefined)
      await execute(connection, 'UPDATE issues SET kind = ? WHERE id = ?', [changes.kind, row.id]);
    if (changes.locked !== undefined) {
      await execute(connection, 'UPDATE issues SET locked_at = ? WHERE id = ?', [
        changes.locked ? now : null,
        row.id,
      ]);
    }
    if (changes.state !== undefined && changes.state !== row.state) {
      const isClosing = changes.state === 'closed';
      await execute(
        connection,
        'UPDATE issues SET state = ?, closed_at = ?, closed_by = ?, last_activity_at = ? WHERE id = ?',
        [changes.state, isClosing ? now : null, isClosing ? userId : null, now, row.id],
      );
      await execute(
        connection,
        `UPDATE models SET open_issue_count = ${isClosing ? 'GREATEST(open_issue_count, 1) - 1' : 'open_issue_count + 1'} WHERE id = ?`,
        [modelId],
      );
    }
  });
}

/** Soft-deletes an issue: the author while nobody replied yet, or an editor anytime. */
export async function deleteIssue(
  pool: Pool,
  modelId: string,
  number: number,
  access: ModelAccess,
  userId: string,
  now: Date,
): Promise<void> {
  const row = await findIssue(pool, modelId, number);
  if (row.deleted_at) throw notFound('Issue not found');
  const isAuthorWithoutReplies = row.author_id === userId && row.reply_count === 0;
  if (!isAuthorWithoutReplies && !canModerate(access))
    throw forbidden('You can no longer delete this issue');
  await softDeleteIssue(pool, row, now);
}

/** Hides an issue and keeps the repository's open-issue counter in step. Callers check permission. */
export async function softDeleteIssue(
  pool: Pool,
  issue: { id: string; model_id: string; state: IssueState },
  now: Date,
): Promise<void> {
  await withTransaction(pool, async (connection) => {
    const result = await execute(
      connection,
      'UPDATE issues SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
      [now, issue.id],
    );
    if (result.affectedRows === 1 && issue.state === 'open') {
      await execute(
        connection,
        'UPDATE models SET open_issue_count = GREATEST(open_issue_count, 1) - 1 WHERE id = ?',
        [issue.model_id],
      );
    }
  });
}

export async function createReply(
  pool: Pool,
  modelId: string,
  number: number,
  access: ModelAccess,
  userId: string,
  body: string,
  now: Date,
): Promise<void> {
  const row = await findIssue(pool, modelId, number);
  if (row.deleted_at) throw notFound('Issue not found');
  if (row.locked_at && !canModerate(access))
    throw new AppError(403, 'issue_locked', 'This issue is locked');
  await withTransaction(pool, async (connection) => {
    await execute(
      connection,
      'INSERT INTO issue_replies (id, issue_id, author_id, body_md, created_at) VALUES (?, ?, ?, ?, ?)',
      [newId(), row.id, userId, body, now],
    );
    await execute(
      connection,
      'UPDATE issues SET reply_count = reply_count + 1, last_activity_at = ? WHERE id = ?',
      [now, row.id],
    );
    await execute(
      connection,
      `INSERT INTO issue_reads (user_id, issue_id, last_read_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
      [userId, row.id, now],
    );
  });
}

async function findReply(pool: Pool, modelId: string, number: number, replyId: string) {
  const reply = await selectOne<{
    id: string;
    issue_id: string;
    author_id: string | null;
    deleted_at: Date | null;
  }>(
    pool,
    `SELECT r.id, r.issue_id, r.author_id, r.deleted_at FROM issue_replies r
       JOIN issues i ON i.id = r.issue_id WHERE i.model_id = ? AND i.number = ? AND r.id = ?`,
    [modelId, number, replyId],
  );
  if (!reply || reply.deleted_at) throw notFound('Reply not found');
  return reply;
}

export async function updateReply(
  pool: Pool,
  modelId: string,
  number: number,
  replyId: string,
  userId: string,
  body: string,
): Promise<void> {
  const reply = await findReply(pool, modelId, number, replyId);
  if (reply.author_id !== userId) throw forbidden('Only the author can edit this reply');
  await execute(pool, 'UPDATE issue_replies SET body_md = ? WHERE id = ?', [body, replyId]);
}

export async function deleteReply(
  pool: Pool,
  modelId: string,
  number: number,
  replyId: string,
  access: ModelAccess,
  userId: string,
  now: Date,
): Promise<void> {
  const reply = await findReply(pool, modelId, number, replyId);
  if (reply.author_id !== userId && !canModerate(access))
    throw forbidden('You cannot delete this reply');
  await withTransaction(pool, async (connection) => {
    await execute(connection, 'UPDATE issue_replies SET deleted_at = ? WHERE id = ?', [
      now,
      replyId,
    ]);
    await execute(
      connection,
      'UPDATE issues SET reply_count = GREATEST(reply_count, 1) - 1 WHERE id = ?',
      [reply.issue_id],
    );
  });
}

interface ActivityRow extends IssueRow {
  model_name: string;
  model_slug: string;
  owner_username: string;
  last_read_at: Date | null;
  last_actor_id: string | null;
}

/**
 * Issues the user should hear about: on repositories they own or edit, plus issues they
 * opened or replied to. "Unread" means activity after their last visit that wasn't theirs.
 */
export async function activityFeed(
  pool: Pool,
  userId: string,
): Promise<{ items: ActivityItem[]; unreadCount: number }> {
  const rows = await selectRows<ActivityRow>(
    pool,
    `SELECT i.id, i.model_id, i.number, i.kind, i.title, i.body_md, i.node_ref, i.state, i.closed_at,
            i.locked_at, i.author_id, a.username AS author_username, a.display_name AS author_display_name,
            NULL AS closer_username, NULL AS closer_display_name,
            i.reply_count, i.last_activity_at, i.deleted_at, i.created_at,
            m.name AS model_name, m.slug AS model_slug, o.username AS owner_username, rd.last_read_at,
            COALESCE((SELECT r.author_id FROM issue_replies r WHERE r.issue_id = i.id AND r.deleted_at IS NULL
                       ORDER BY r.created_at DESC, r.id DESC LIMIT 1), i.author_id) AS last_actor_id
       FROM issues i
       JOIN models m ON m.id = i.model_id AND m.taken_down_at IS NULL
       JOIN users o ON o.id = m.owner_id
       LEFT JOIN users a ON a.id = i.author_id
       LEFT JOIN issue_reads rd ON rd.issue_id = i.id AND rd.user_id = ?
      WHERE i.deleted_at IS NULL AND (
            m.owner_id = ?
         OR EXISTS (SELECT 1 FROM shares s WHERE s.model_id = m.id AND s.user_id = ? AND s.role = 'editor'
                     AND m.visibility <> 'private')
         OR i.author_id = ?
         OR EXISTS (SELECT 1 FROM issue_replies r WHERE r.issue_id = i.id AND r.author_id = ?))
      ORDER BY i.last_activity_at DESC
      LIMIT ?`,
    [userId, userId, userId, userId, userId, limitParam(ACTIVITY_LIMIT)],
  );
  const items = rows.map((row) => ({
    model: {
      id: row.model_id,
      name: row.model_name,
      slug: row.model_slug,
      ownerUsername: row.owner_username,
    },
    issue: toListItem(row),
    unread:
      row.last_actor_id !== userId &&
      (row.last_read_at === null || row.last_read_at < row.last_activity_at),
  }));
  return { items, unreadCount: items.filter((item) => item.unread).length };
}
