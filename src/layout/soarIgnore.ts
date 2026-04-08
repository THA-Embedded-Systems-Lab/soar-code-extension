/**
 * SoarIgnore - .soarignore file support
 *
 * Reads and applies gitignore-style ignore patterns from a `.soarignore` file
 * located in the project root (next to the .vsa.json file).
 */

import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

export const SOAR_IGNORE_FILENAME = '.soarignore';

/**
 * Load and parse the .soarignore file from the project root.
 * Returns an Ignore instance ready for path matching.
 * If no .soarignore file exists, returns an instance with no patterns (nothing ignored).
 */
export async function loadSoarIgnore(projectRoot: string): Promise<Ignore> {
  const ig = ignore();
  const ignoreFilePath = path.join(projectRoot, SOAR_IGNORE_FILENAME);

  try {
    const content = await fs.promises.readFile(ignoreFilePath, 'utf-8');
    ig.add(content);
  } catch {
    // No .soarignore file exists — nothing ignored
  }

  return ig;
}

/**
 * Check whether a file should be ignored according to the loaded patterns.
 * `relativePath` must be relative to the project root and use forward slashes.
 */
export function isIgnoredByPatterns(ig: Ignore, relativePath: string): boolean {
  // The `ignore` package requires forward-slash separated, non-leading-slash paths
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\//, '');
  return ig.ignores(normalizedPath);
}

/**
 * Default content written to a newly created .soarignore file.
 */
export const DEFAULT_SOARIGNORE_CONTENT = `# .soarignore
# Gitignore-style patterns for files to exclude from orphaned-file
# detection and datamap validation.
#
# Examples:
#   scratch/          # ignore everything under a scratch/ folder
#   *_wip.soar        # ignore work-in-progress files
#   test/**           # ignore all files under test/
`;
