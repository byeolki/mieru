import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findPackageRoot(start: string): string {
  let directory = start;
  while (!existsSync(path.join(directory, 'package.json'))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`No package.json above ${start}`);
    directory = parent;
  }
  return directory;
}

/**
 * The server package directory. Compiled code lives one level deeper (`dist/src`) than the
 * sources, so paths to `assets/` and `migrations/` are resolved from here, not from the module.
 */
export const PACKAGE_ROOT = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
