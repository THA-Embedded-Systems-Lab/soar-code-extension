/**
 * Integration test suite loader
 * Collects and runs all integration tests in the VS Code extension host
 */

import * as path from 'path';
import { glob } from 'glob';

// eslint-disable-next-line @typescript-eslint/naming-convention
const Mocha = require('mocha');

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20000, // Longer timeout for integration tests
  });

  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    glob('**/**.test.js', { cwd: testsRoot })
      .then((files: string[]) => {
        // Add files to the test suite
        files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

        try {
          // Run the mocha test
          mocha.run((failures: number) => {
            if (failures > 0) {
              reject(new Error(`${failures} integration tests failed.`));
            } else {
              resolve();
            }
          });
        } catch (err: any) {
          console.error(err);
          reject(err);
        }
      })
      .catch((err: any) => {
        console.error('Failed to find test files:', err);
        reject(err);
      });
  });
}
