import mysql from 'mysql2/promise';

export type DbPool = mysql.Pool;

/** Creates the application pool. Multiple statements stay disabled so injected SQL can't chain. */
export function createPool(databaseUrl: string): DbPool {
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    timezone: 'Z',
    dateStrings: false,
    multipleStatements: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    namedPlaceholders: false,
  });
}
