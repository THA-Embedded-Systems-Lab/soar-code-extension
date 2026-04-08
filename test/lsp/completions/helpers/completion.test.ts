/**
 * LSP Completion Fixture Tests
 *
 * Each .soar file in test/lsp/completions/fixtures/ contains a single line of
 * Soar text representing text up to the cursor position.  The test computes
 * datamap-driven completions for that line using the CompletionTest project
 * (test/lsp/completions/CompletionTest/CompletionTest.vsa.json) and compares
 * them to the corresponding expected file in test/lsp/completions/expected/.
 *
 * If the expected file does not yet exist it is generated from the actual
 * completions and the test fails with an instruction to review and re-run.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectLoader } from '../../../../src/server/projectLoader';
import { SoarParser } from '../../../../src/server/soarParser';
import { getDatamapCompletions } from '../../../../src/server/completionProvider';

suite('LSP Completion Fixtures', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  const expectedDir = path.resolve(__dirname, '../expected');
  const projectFile = path.resolve(__dirname, '../CompletionTest/CompletionTest.vsa.json');

  const projectLoader = new ProjectLoader();
  const parser = new SoarParser();
  const projectContext = projectLoader.loadProject(projectFile) as any;

  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter(f => f.endsWith('.soar') && !f.startsWith('.'));

  for (const file of fixtureFiles) {
    const stem = path.basename(file, '.soar');

    test(`Fixture ${file}`, async () => {
      const content = fs.readFileSync(path.join(fixturesDir, file), 'utf-8');

      // Resolve project context (loader.loadProject may return a Promise)
      const ctx = projectContext instanceof Promise ? await projectContext : projectContext;

      // Parse the partial production so variable bindings can be resolved
      const doc = parser.parse(file, content, 0);

      // The cursor is at the very end of the file — last non-empty line
      const lines = content.split('\n');
      let lastLineIndex = lines.length - 1;
      while (lastLineIndex > 0 && lines[lastLineIndex].trim().length === 0) {
        lastLineIndex--;
      }
      const lastLine = lines[lastLineIndex].trimEnd();

      // Find the production that contains the last line
      const production =
        doc.productions.find(
          p => p.range.start.line <= lastLineIndex && p.range.end.line >= lastLineIndex
        ) ?? (doc.productions.length > 0 ? doc.productions[doc.productions.length - 1] : null);

      const completions = getDatamapCompletions(
        lastLine,
        content, // full text before cursor for variable context
        production,
        ctx,
        projectLoader
      );

      // Normalise to a stable, serialisable shape
      const actual = completions
        .map(c => ({ label: c.label, kind: c.kind }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const expectedPath = path.join(expectedDir, `${stem}.json`);

      if (!fs.existsSync(expectedPath)) {
        fs.mkdirSync(expectedDir, { recursive: true });
        fs.writeFileSync(expectedPath, JSON.stringify(actual, null, 2), 'utf-8');
        assert.fail(
          `Expected file did not exist for ${file}; created ${expectedPath} from actual completions. Review and re-run tests.`
        );
      }

      const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));

      assert.deepStrictEqual(
        actual,
        expected,
        `Completion mismatch for ${file}.\nActual:   ${JSON.stringify(
          actual
        )}\nExpected: ${JSON.stringify(expected)}`
      );
    });
  }
});
