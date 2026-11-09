import type { Pool } from 'mysql2/promise';
import { designSpecSchema, type Design, type SaveDesignBody } from '@mieru/shared';
import { execute, selectOne, selectRows } from '../../db/query.js';
import { notFound } from '../../errors.js';
import { newId } from '../../ids.js';

interface DesignRow {
  id: string;
  owner_id: string;
  name: string;
  spec: unknown;
  visibility: 'private' | 'public';
  created_at: Date;
  updated_at: Date;
  owner_username: string;
  owner_display_name: string;
}

const DESIGN_SELECT = `
  SELECT d.id, d.owner_id, d.name, d.spec, d.visibility, d.created_at, d.updated_at,
         u.username AS owner_username, u.display_name AS owner_display_name
    FROM designs d JOIN users u ON u.id = d.owner_id`;

function toDesign(row: DesignRow, viewerId: string | null): Design {
  return {
    id: row.id,
    name: row.name,
    // mysql2 parses JSON columns; validating keeps a hand-edited row from reaching the client.
    spec: designSpecSchema.parse(row.spec),
    visibility: row.visibility,
    owner: { username: row.owner_username, displayName: row.owner_display_name },
    canEdit: viewerId === row.owner_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listDesigns(pool: Pool, ownerId: string) {
  const rows = await selectRows<{
    id: string;
    name: string;
    visibility: 'private' | 'public';
    layer_count: number;
    updated_at: Date;
  }>(
    pool,
    `SELECT id, name, visibility, JSON_LENGTH(spec, '$.layers') AS layer_count, updated_at
       FROM designs WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100`,
    [ownerId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    layerCount: row.layer_count,
    updatedAt: row.updated_at.toISOString(),
  }));
}

/** Owners see their designs; everyone else sees public ones. Anything else is a 404. */
export async function getDesign(pool: Pool, id: string, viewerId: string | null): Promise<Design> {
  const row = await selectOne<DesignRow>(pool, `${DESIGN_SELECT} WHERE d.id = ?`, [id]);
  if (!row || (row.visibility !== 'public' && row.owner_id !== viewerId))
    throw notFound('Design not found');
  return toDesign(row, viewerId);
}

export async function createDesign(pool: Pool, ownerId: string, body: SaveDesignBody, now: Date) {
  const id = newId();
  await execute(
    pool,
    'INSERT INTO designs (id, owner_id, name, spec, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, ownerId, body.name, JSON.stringify(body.spec), body.visibility ?? 'private', now, now],
  );
  return getDesign(pool, id, ownerId);
}

export async function updateDesign(
  pool: Pool,
  id: string,
  ownerId: string,
  body: SaveDesignBody,
  now: Date,
) {
  const result = await execute(
    pool,
    'UPDATE designs SET name = ?, spec = ?, visibility = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
    [body.name, JSON.stringify(body.spec), body.visibility ?? 'private', now, id, ownerId],
  );
  if (result.affectedRows === 0) throw notFound('Design not found');
  return getDesign(pool, id, ownerId);
}

export async function deleteDesign(pool: Pool, id: string, ownerId: string): Promise<void> {
  const result = await execute(pool, 'DELETE FROM designs WHERE id = ? AND owner_id = ?', [
    id,
    ownerId,
  ]);
  if (result.affectedRows === 0) throw notFound('Design not found');
}
