/**
 * Orphaned File Detection Tests
 *
 * Verifies that ProjectSync.findOrphanedFiles() correctly identifies .soar files
 * that exist on disk but are absent from the project layout.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectLoader } from '../../../../src/server/projectLoader';
import { ProjectSync } from '../../../../src/layout/projectSync';

suite('Orphaned File Detection', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures/old');
  const projectFile = path.join(fixturesDir, 'test-project.vsa.json');
  const projectLoader = new ProjectLoader();

  test('orphaned-file.soar is detected and absolutePath matches the file system path', async () => {
    const projectContext = await projectLoader.loadProject(projectFile);
    const orphaned = await ProjectSync.findOrphanedFiles(projectContext);

    const expectedAbsolutePath = path.resolve(fixturesDir, 'orphaned-file.soar');

    assert.ok(
      fs.existsSync(expectedAbsolutePath),
      `Fixture file must exist on disk: ${expectedAbsolutePath}`
    );

    const match = orphaned.find(f => f.absolutePath === expectedAbsolutePath);

    assert.ok(
      match !== undefined,
      `Expected orphaned-file.soar to be detected.\n` +
        `Expected path: ${expectedAbsolutePath}\n` +
        `Detected orphans: ${orphaned.map(f => f.absolutePath).join(', ') || '(none)'}`
    );

    assert.strictEqual(
      match.absolutePath,
      expectedAbsolutePath,
      'absolutePath should match the actual file system path'
    );
  });

  test('orphan-nested.soar in a subdirectory is detected and absolutePath matches the file system path', async () => {
    const projectContext = await projectLoader.loadProject(projectFile);
    const orphaned = await ProjectSync.findOrphanedFiles(projectContext);

    const expectedAbsolutePath = path.resolve(
      fixturesDir,
      'sub-test-state',
      'elaborations',
      'orphan-nested.soar'
    );

    assert.ok(
      fs.existsSync(expectedAbsolutePath),
      `Fixture file must exist on disk: ${expectedAbsolutePath}`
    );

    const match = orphaned.find(f => f.absolutePath === expectedAbsolutePath);

    assert.ok(
      match !== undefined,
      `Expected orphan-nested.soar to be detected.\n` +
        `Expected path: ${expectedAbsolutePath}\n` +
        `Detected orphans: ${orphaned.map(f => f.absolutePath).join(', ') || '(none)'}`
    );

    assert.strictEqual(
      match.absolutePath,
      expectedAbsolutePath,
      'absolutePath should match the actual file system path'
    );
  });
});
