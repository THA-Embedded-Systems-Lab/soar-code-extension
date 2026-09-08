/**
 * Integration test suite loader
 * Collects and runs all integration tests in the VS Code extension host
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { glob } from 'glob';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20000, // Longer timeout for integration tests
  });

  const testsRoot = path.resolve(__dirname, '.');

  const files = await glob('**/**.test.js', { cwd: testsRoot });
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  // out/ is ESM ("type": "module"), so the test files must be imported, not
  // require()d — loadFilesAsync() is mandatory before run() for ESM specs.
  await mocha.loadFilesAsync();

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} integration tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
