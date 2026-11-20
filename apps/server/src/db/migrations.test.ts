import { describe, expect, it } from 'vitest';
import { splitDatabaseUrl } from './migrations.js';

describe('splitDatabaseUrl', () => {
  it('separates the database from the server address and keeps credentials and options', () => {
    expect(splitDatabaseUrl('mysql://mieru:secret@db:3306/mieru?ssl=true')).toEqual({
      serverUrl: 'mysql://mieru:secret@db:3306/?ssl=true',
      databaseName: 'mieru',
    });
  });

  it.each(['mysql://db:3306', 'mysql://db:3306/', 'mysql://db/bad`name', 'mysql://db/a-b'])(
    'refuses %s',
    (url) => {
      expect(() => splitDatabaseUrl(url)).toThrow(/must name a database/);
    },
  );
});
