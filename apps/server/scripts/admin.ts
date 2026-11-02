import { recordAudit } from '../src/audit.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { execute } from '../src/db/query.js';

const USAGE = 'usage: npm run admin -w @mieru/server -- <grant|revoke> <username>';
const ROLE_BY_COMMAND = { grant: 'admin', revoke: 'user' } as const;

const [command, username] = process.argv.slice(2);
if ((command !== 'grant' && command !== 'revoke') || !username) {
  console.error(USAGE);
  process.exit(1);
}

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
try {
  const role = ROLE_BY_COMMAND[command];
  const result = await execute(pool, 'UPDATE users SET role = ? WHERE username = ?', [
    role,
    username,
  ]);
  if (result.affectedRows === 0) {
    console.error(`no user named "${username}"`);
    process.exitCode = 1;
  } else {
    await recordAudit(pool, {
      actorId: null,
      action: `admin.${command}`,
      targetType: 'user',
      meta: { username },
    });
    console.log(`${username} is now ${role}`);
  }
} finally {
  await pool.end();
}
