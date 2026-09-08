/**
 * Test runner for VS Code extension integration tests
 * Launches VS Code extension host and runs integration tests
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test runner script
    const extensionTestsPath = path.resolve(__dirname, './integration/index.js');

    // The path to the test workspace (must exist — newer VS Code CLI treats a
    // missing first positional arg as a script path and crashes).
    // __dirname is out/test, so repo root is ../..
    const testWorkspacePath = path.resolve(
      __dirname,
      '../../test/legacy-agents/Agents/BW-Hierarchical'
    );

    // Download VS Code, unzip it and run the integration tests
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspacePath,
        '--disable-extensions', // Disable other extensions
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  } catch (err) {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
  }
}

main();
