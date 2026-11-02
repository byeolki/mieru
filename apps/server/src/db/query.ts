import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

/** Anything that can run a prepared statement: the pool or a transaction's connection. */
export type Queryable = Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>;

export type SqlParam = string | number | bigint | boolean | Date | Buffer | null;

/**
 * mysql2's `execute()` rejects numeric LIMIT/OFFSET bindings on MySQL 8.0.22+
 * (ER_WRONG_ARGUMENTS), so pagination values are bound as strings.
 */
export function limitParam(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid LIMIT/OFFSET value: ${value}`);
  }
  return String(value);
}

/** Runs a prepared SELECT and returns its rows typed as `T`. */
export async function selectRows<T extends object>(
  db: Queryable,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<T[]> {
  const [rows] = await db.execute<RowDataPacket[]>(sql, params as SqlParam[]);
  return rows as unknown as T[];
}

/** Runs a prepared SELECT expected to return at most one row. */
export async function selectOne<T extends object>(
  db: Queryable,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<T | null> {
  const rows = await selectRows<T>(db, sql, params);
  return rows[0] ?? null;
}

/** Runs a prepared INSERT/UPDATE/DELETE and returns the result header. */
export async function execute(
  db: Queryable,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, params as SqlParam[]);
  return result;
}

/**
 * Runs `work` inside a transaction on a dedicated connection.
 * Commits when `work` resolves and rolls back (then rethrows) when it rejects.
 */
export async function withTransaction<T>(
  pool: Pool,
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
