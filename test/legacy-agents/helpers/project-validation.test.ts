/**
 * Legacy Project Validation Tests
 *
 * Ensures backward compatibility with VisualSoar projects by verifying
 * that valid legacy projects load without schema validation errors.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectLoader } from '../../../src/server/projectLoader';
import { SoarParser } from '../../../src/server/soarParser';
import { DatamapValidator } from '../../../src/datamap/datamapValidator';
import { ProjectSync } from '../../../src/layout/projectSync';

suite('Legacy Project Validation', () => {
  const projectLoader = new ProjectLoader();
  const parser = new SoarParser();
  const validator = new DatamapValidator();
  const fixturesDir = path.resolve(__dirname, '..', 'fixtures');

  /**
   * Recursively find all .vsa.json project files in test/legacy-agents/fixtures/
   */
  function findProjectFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findProjectFiles(fullPath));
      } else if (entry.name.endsWith('.vsa.json')) {
        results.push(fullPath);
      }
    }

    return results;
  }

  const projectFiles = findProjectFiles(fixturesDir);

  // Auto-generate tests for all discovered projects
  for (const projectFile of projectFiles) {
    const projectName = path.basename(projectFile, '.vsa.json');
    const relativePath = path.relative(fixturesDir, projectFile);

    test(`${projectName} should load without validation errors`, async () => {
      const projectContext = await projectLoader.loadProject(projectFile);

      assert.ok(projectContext, 'Project should load successfully');
      assert.ok(projectContext.project, 'Project data should be populated');
      assert.ok(projectContext.datamapIndex, 'Datamap index should be built');
      assert.ok(projectContext.layoutIndex, 'Layout index should be built');

      // Main assertion: no schema validation errors
      const errorCount = projectContext.validationErrors?.length || 0;
      if (errorCount > 0) {
        const errorSummary = projectContext
          .validationErrors!.map(err => `  - ${err.path}: ${err.message}`)
          .join('\n');
        assert.fail(`${relativePath} has ${errorCount} validation error(s):\n${errorSummary}`);
      }

      assert.strictEqual(
        errorCount,
        0,
        `Legacy project ${projectName} should conform to current schema`
      );
    });

    test(`${projectName} has valid datamap structure`, async () => {
      const projectContext = await projectLoader.loadProject(projectFile);

      // Verify datamap root exists
      assert.ok(projectContext.project.datamap.rootId, 'Datamap should have a root ID');

      const rootVertex = projectContext.datamapIndex.get(projectContext.project.datamap.rootId);
      assert.ok(rootVertex, 'Root vertex should exist in datamap index');

      // Verify all vertices are indexed
      const vertexCount = projectContext.project.datamap.vertices.length;
      assert.strictEqual(
        projectContext.datamapIndex.size,
        vertexCount,
        'All vertices should be indexed'
      );

      // Verify no dangling edge references
      for (const vertex of projectContext.project.datamap.vertices) {
        if ('outEdges' in vertex && vertex.outEdges) {
          for (const edge of vertex.outEdges) {
            const targetVertex = projectContext.datamapIndex.get(edge.toId);
            assert.ok(
              targetVertex,
              `Edge from ${vertex.id} references non-existent vertex ${edge.toId}`
            );
          }
        }
      }
    });

    test(`${projectName} has valid layout structure`, async () => {
      const projectContext = await projectLoader.loadProject(projectFile);

      const layout = projectContext.project.layout;
      assert.ok(layout, 'Layout should exist');
      assert.ok(layout.name, 'Layout should have a name');
      assert.ok(layout.type, 'Layout should have a type');

      // Verify layout index contains all nodes
      assert.ok(projectContext.layoutIndex.size > 0, 'Layout index should contain nodes');

      // Verify root layout is indexed
      assert.ok(projectContext.layoutIndex.get(layout.id), 'Root layout node should be indexed');
    });

    test(`${projectName} validates all Soar files against datamap`, async () => {
      const projectContext = await projectLoader.loadProject(projectFile);
      const projectDir = path.dirname(projectContext.projectFile);
      const soarFiles = await ProjectSync.collectExistingSoarFiles(projectContext);

      assert.ok(
        soarFiles.length > 0,
        `${projectName} should reference at least one existing .soar file`
      );

      const validationErrorsByFile: Array<{ filePath: string; errors: string[] }> = [];

      for (const soarFile of soarFiles) {
        const content = fs.readFileSync(soarFile, 'utf8');
        const doc = parser.parse(soarFile, content, 0);

        const errors = validator.validateDocument(doc, projectContext, content, {
          sourceFilePath: soarFile,
        });

        if (errors.length > 0) {
          validationErrorsByFile.push({
            filePath: path.relative(projectDir, soarFile),
            errors: errors.map(error => `${error.attributePath}: ${error.message}`),
          });
        }
      }

      if (validationErrorsByFile.length > 0) {
        const formatted = validationErrorsByFile
          .map(fileResult =>
            [
              `- ${fileResult.filePath}`,
              ...fileResult.errors.map(message => `    • ${message}`),
            ].join('\n')
          )
          .join('\n');

        assert.fail(
          `${projectName} contains datamap validation errors when validating all project Soar files:\n${formatted}`
        );
      }
    });
  }

  test('At least one legacy project exists for testing', () => {
    assert.ok(
      projectFiles.length > 0,
      'test/legacy-agents/fixtures/ should contain at least one .vsa.json project file'
    );
  });
});
