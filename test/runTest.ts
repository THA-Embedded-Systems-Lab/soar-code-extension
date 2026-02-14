/**
 * Test runner for VS Code extension integration tests
 * Launches VS Code extension host and runs integration tests
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test runner script
    const extensionTestsPath = path.resolve(__dirname, './integration/index');

    // The path to the test workspace
    const testWorkspacePath = path.resolve(__dirname, '../test/legacy-agents/BW-Hierarchical');

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
