import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectLoader } from '../../../../src/server/projectLoader';
import { SoarParser } from '../../../../src/server/soarParser';
import { DatamapValidator, ValidationError } from '../../../../src/datamap/datamapValidator';
import { DatamapMetadataCache } from '../../../../src/datamap/datamapMetadata';

suite('Datamap Validation Fixtures', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  const expectedDir = path.resolve(__dirname, '../expected');

  const projectLoader = new ProjectLoader();
  const parser = new SoarParser();
  const validator = new DatamapValidator();

  // Recursively find all .vsa.json files in fixtures
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

  // Build a map of project contexts (cached to avoid reloading for each file)
  const projectContexts = new Map<string, any>();

  // Collect all soar files from all projects
  const soarFilesPerProject = new Map<string, string[]>();
  for (const projectFile of projectFiles) {
    const projectDir = path.dirname(projectFile);

    // Load project synchronously during test discovery
    const projectContext = projectLoader.loadProject(projectFile);
    projectContexts.set(projectFile, projectContext);

    // This will be resolved during test execution
    const soarFiles: string[] = [];
    soarFilesPerProject.set(projectFile, soarFiles);
  }

  // Generate tests for each soar file within each project
  for (const projectFile of projectFiles) {
    const projectDir = path.dirname(projectFile);
    const projectRelPath = path.relative(fixturesDir, projectFile);
    const projectName = projectRelPath.replace(/\//g, ' > ').replace('.vsa.json', '');

    suite(`Project: ${projectName}`, () => {
      let projectContext: any;
      let soarFiles: string[] = [];

      suiteSetup(async () => {
        // Load the project
        projectContext = await projectLoader.loadProject(projectFile);

        // Create datamap metadata cache
        const dmMetadata = DatamapMetadataCache.build(
          projectContext.project,
          projectContext.datamapIndex
        );
        (projectContext as any).datamapMetadata = dmMetadata;

        // Find all .soar files referenced in the project layout
        soarFiles = collectSoarFilesFromLayout(projectContext.project.layout, projectDir);
      });

      test('Project should have at least one .soar file', () => {
        assert.ok(soarFiles.length > 0, 'Project should contain at least one .soar file');
      });

      // We'll dynamically add tests for each soar file
      // This is a workaround since we can't know the files until the project loads
      test('Validate all soar files in project', async function () {
        const missingExpectedFiles: string[] = [];
        const validationResults: Array<{
          soarFile: string;
          soarRelPath: string;
          actualErrors: any[];
          expectedErrors: any[];
          expectedPath: string;
        }> = [];

        // First pass: validate all files and create missing expected files
        for (const soarFile of soarFiles) {
          if (!fs.existsSync(soarFile)) {
            continue; // Skip missing files
          }

          const soarRelPath = path.relative(fixturesDir, soarFile);
          const content = fs.readFileSync(soarFile, 'utf8');
          const doc = parser.parse(soarFile, content, 0);
          const errors = validator.validateDocument(doc, projectContext, content);

          // Sort errors for consistent comparison
          errors.sort((a, b) => {
            if (a.line !== b.line) {
              return a.line - b.line;
            }
            return a.column - b.column;
          });

          // Serialize errors for comparison
          const actualErrors = errors.map(e => ({
            production: e.production,
            attribute: e.attribute,
            attributePath: e.attributePath,
            line: e.line,
            column: e.column,
            range: e.range,
            message: e.message,
            severity: e.severity,
          }));

          // Expected file maps to the .soar file: fixtures/old/test.soar -> expected/old/test.soar.json
          const expectedPath = path.join(expectedDir, `${soarRelPath}.json`);

          // If expected file does not exist, create it from actual errors
          if (!fs.existsSync(expectedPath)) {
            try {
              fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
            } catch (e) {
              // ignore mkdir errors if already exists
            }
            fs.writeFileSync(expectedPath, JSON.stringify(actualErrors, null, 2), 'utf8');
            missingExpectedFiles.push(soarRelPath);
          }

          // Load expected errors
          let expectedErrors: any[] = [];
          if (fs.existsSync(expectedPath)) {
            const data = fs.readFileSync(expectedPath, 'utf8').trim();
            if (data.length > 0) {
              const parsed = JSON.parse(data);
              if (Array.isArray(parsed)) {
                expectedErrors = parsed;
              } else if (Array.isArray(parsed.errors)) {
                expectedErrors = parsed.errors;
              } else {
                throw new Error(
                  `Expected JSON must be an array of validation errors or an object with an errors array (${expectedPath})`
                );
              }
            }
          }

          validationResults.push({
            soarFile,
            soarRelPath,
            actualErrors,
            expectedErrors,
            expectedPath,
          });
        }

        // If any expected files were missing, fail the test now after creating all of them
        if (missingExpectedFiles.length > 0) {
          assert.fail(
            `Expected files did not exist for ${missingExpectedFiles.length} file(s):\n` +
              missingExpectedFiles.map(f => `  - ${f}`).join('\n') +
              `\n\nCreated expected files from actual validation errors. Review and re-run tests.`
          );
        }

        // Second pass: compare all results
        for (const result of validationResults) {
          const { soarRelPath, actualErrors, expectedErrors } = result;

          // Compare expected vs actual
          if (expectedErrors.length === 0 && actualErrors.length === 0) {
            // Both empty - pass
            continue;
          }

          if (expectedErrors.length === 0) {
            assert.fail(
              `Expected no validation errors for ${soarRelPath}, but got:\n${JSON.stringify(
                actualErrors,
                null,
                2
              )}`
            );
          }

          if (actualErrors.length === 0) {
            assert.fail(
              `Expected validation errors for ${soarRelPath} but got none. Expected:\n${JSON.stringify(
                expectedErrors,
                null,
                2
              )}`
            );
          }

          // Deep comparison
          assert.deepStrictEqual(
            actualErrors,
            expectedErrors,
            `Validation errors mismatch for ${soarRelPath}`
          );
        }
      });
    });
  }
});

/**
 * Collect all .soar files from the project layout
 */
function collectSoarFilesFromLayout(node: any, projectDir: string): string[] {
  const files: string[] = [];

  // Check if this node has a file property (FILE, OPERATOR, FILE_OPERATOR, etc.)
  if (node.file) {
    const fullPath = path.join(projectDir, node.file);
    if (fullPath.endsWith('.soar')) {
      files.push(fullPath);
    }
  }

  // Recursively check children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      files.push(...collectSoarFilesFromLayout(child, projectDir));
    }
  }

  return files;
}
