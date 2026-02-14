import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SoarParser } from '../../../../src/server/soarParser';

suite('LSP Syntax Fixtures', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  const expectedDir = path.resolve(__dirname, '../expected');

  const parser = new SoarParser();

  const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => !f.startsWith('.'));

  for (const file of fixtureFiles) {
    test(`Fixture ${file}`, () => {
      const fixturePath = path.join(fixturesDir, file);
      const content = fs.readFileSync(fixturePath, 'utf8');
      const doc = parser.parse(fixturePath, content, 0);
      const actualDiagnostics = (doc.errors || []).map(e => ({
        range: e.range,
        message: e.message,
        severity: e.severity,
        source: e.source,
      }));

      const expectedPath = path.join(expectedDir, `${file}.json`);
      let expectedMessages: string[] = [];

      // If expected file does not exist, create it from actual diagnostics and fail the test
      if (!fs.existsSync(expectedPath)) {
        try {
          fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
        } catch (e) {
          // ignore mkdir errors if already exists
        }
        fs.writeFileSync(expectedPath, JSON.stringify(actualDiagnostics, null, 2), 'utf8');
        assert.fail(
          `Expected file did not exist for ${file}; created ${expectedPath} from actual diagnostics. Review and re-run tests.`
        );
      }

      if (fs.existsSync(expectedPath)) {
        const data = fs.readFileSync(expectedPath, 'utf8').trim();
        if (data.length > 0) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            // assume array of diagnostic-like objects
            expectedMessages = parsed as any;
          } else if (Array.isArray(parsed.errors)) {
            expectedMessages = parsed.errors as any;
          } else {
            throw new Error(
              'Expected JSON must be an array of diagnostic objects or an object with an errors array'
            );
          }
        }
      }

      // Compare expected diagnostics (full objects) against actual diagnostics
      const expectedDiagnostics: any[] = expectedMessages as any[];

      if (expectedDiagnostics.length === 0) {
        assert.strictEqual(
          actualDiagnostics.length,
          0,
          `Expected no syntax errors for ${file}, but got: ${JSON.stringify(
            actualDiagnostics,
            null,
            2
          )}`
        );
      } else {
        const actualStrings = actualDiagnostics.map(d => JSON.stringify(d));
        const missing = expectedDiagnostics.filter(e => !actualStrings.includes(JSON.stringify(e)));
        assert.strictEqual(
          missing.length,
          0,
          `Missing expected diagnostics in ${file}: ${JSON.stringify(
            missing,
            null,
            2
          )}. Actual: ${JSON.stringify(actualDiagnostics, null, 2)}`
        );
      }
    });
  }
});
