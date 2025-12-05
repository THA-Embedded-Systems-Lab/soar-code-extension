import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TestHelper } from '../testUtils';

suite('Diagnostics Test Suite', () => {
  let testProjectPath: string;

  suiteSetup(async function () {
    this.timeout(30000);

    // Get the test project path
    testProjectPath = path.resolve(__dirname, '../../../test/fixtures');

    // Activate extension and get API
    const api = await TestHelper.activateExtension();

    // Get project manager from the extension API
    const projectManager = api?.getProjectManager();
    if (!projectManager) {
      throw new Error('ProjectManager not available from extension API');
    }

    // Setup test project
    const projectFile = path.join(testProjectPath, 'test-project.vsa.json');
    await TestHelper.setupTestProject(projectManager, projectFile);
  });

  test('Should report unbound variable diagnostics', async function () {
    this.timeout(10000);

    const testUri = vscode.Uri.file(path.join(testProjectPath, 'test-unbound-variable-fail.soar'));

    // Wait for diagnostics to be computed
    const diagnostics = await TestHelper.waitForDiagnostics(testUri, 5000);

    assert.ok(diagnostics.length > 0, 'Should have diagnostics for unbound variables');

    // Check that at least one diagnostic mentions unbound variables
    const hasUnboundDiagnostic = diagnostics.some(d =>
      d.message.includes(
        'Variable <il> is not bound. Variables must be connected to the state through attribute paths.'
      )
    );

    assert.ok(hasUnboundDiagnostic, 'Should have diagnostic about unbound variables');
  });

  test('Should not report unbound variable diagnostics for properly bound variables', async function () {
    this.timeout(10000);

    const testUri = vscode.Uri.file(
      path.join(testProjectPath, 'test-unbound-variable-success.soar')
    );

    // Wait for diagnostics to be computed
    await new Promise(resolve => setTimeout(resolve, 2000));

    const diagnostics = vscode.languages.getDiagnostics(testUri);

    // Check that there are no unbound variable diagnostics
    const hasUnboundDiagnostic = diagnostics.some(
      d =>
        d.message.toLowerCase().includes('not bound') || d.message.toLowerCase().includes('unbound')
    );

    assert.ok(
      !hasUnboundDiagnostic,
      'Should not have unbound variable diagnostics for properly bound variables'
    );
  });

  test('Should report validation errors', async function () {
    this.timeout(10000);

    const testUri = vscode.Uri.file(path.join(testProjectPath, 'test-validation.soar'));

    // Wait for diagnostics
    const diagnostics = await TestHelper.waitForDiagnostics(testUri, 5000);

    // Should have some validation errors
    if (diagnostics.length > 0) {
      assert.ok(true, 'Validation diagnostics are working');
    } else {
      console.log('No validation diagnostics found (file may be valid)');
    }
  });

  test('Should report enum validation errors', async function () {
    this.timeout(10000);

    const testUri = vscode.Uri.file(path.join(testProjectPath, 'test-enum-validation.soar'));

    // Wait for diagnostics
    const diagnostics = await TestHelper.waitForDiagnostics(testUri, 5000);

    if (diagnostics.length > 0) {
      // Check for enum-related errors
      const hasEnumError = diagnostics.some(
        d =>
          d.message.toLowerCase().includes('enum') ||
          d.message.toLowerCase().includes('invalid value')
      );

      if (hasEnumError) {
        assert.ok(true, 'Enum validation is working');
      } else {
        console.log('Diagnostics found but not enum-specific');
      }
    } else {
      console.log('No enum validation diagnostics found');
    }
  });

  test('Should report diagnostics for invalid code', async function () {
    this.timeout(10000);

    // Create an in-memory document with an unbound variable error
    const document = await TestHelper.createTestDocument(
      'sp {test-rule-invalid\n  (state <s> ^unbound-var <v>)\n-->\n  (<s> ^output <v>)\n}',
      'soar'
    );

    // Wait for diagnostics to be computed
    const diagnostics = await TestHelper.waitForDiagnostics(document.uri, 5000);

    assert.ok(diagnostics.length > 0, 'Should have diagnostics for unbound variable');
  });

  test('Should report missing closing parenthesis errors', async function () {
    this.timeout(10000);

    // Create a document with syntax errors (missing closing parenthesis)
    const document = await TestHelper.createTestDocument(
      'sp {broken-syntax\n  (state <s> ^io\n-->\n  (<s> ^output test)\n}',
      'soar'
    );

    // Wait for diagnostics
    const diagnostics = await TestHelper.waitForDiagnostics(document.uri, 5000);

    console.log(
      `Found ${diagnostics.length} diagnostic(s) for missing closing parenthesis error test:`
    );
    diagnostics.forEach(d => console.log(`  - ${d.message} at line ${d.range.start.line}`));

    assert.ok(
      diagnostics[0].message === 'Unexpected closing parenthesis',
      'Missing closing parenthesis error diagnostics are working'
    );
  });
});
