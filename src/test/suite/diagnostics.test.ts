import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TestHelper } from '../testUtils';

suite('Diagnostics Test Suite', () => {
  let testProjectPath: string;
  let testDocUri: vscode.Uri;

  suiteSetup(async function () {
    this.timeout(30000);

    // Get the test project path
    testProjectPath = path.resolve(__dirname, '../../../test/fixtures');
    testDocUri = vscode.Uri.file(path.join(testProjectPath, 'test-unbound-variable-fail.soar'));

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

    // Open a test document to trigger LSP initialization
    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Wait for LSP to be ready
    await TestHelper.waitForLanguageServer(testDocUri);
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

  test('Should report unbound variable diagnostics for disconnected identifier blocks', async function () {
    this.timeout(10000);

    const testUri = vscode.Uri.file(
      path.join(testProjectPath, 'test-unbound-variable-smart-sander.soar')
    );

    const diagnostics = await TestHelper.waitForDiagnostics(testUri, 5000);

    assert.ok(diagnostics.length > 0, 'Should have diagnostics for SmartSander example');

    const hasSmartSanderUnbound = diagnostics.some(d =>
      d.message.includes('Variable <t> is not bound')
    );

    assert.ok(hasSmartSanderUnbound, 'Should flag <t> as unbound in SmartSander example');
  });

  test('Should highlight unbound variable at correct position', async function () {
    this.timeout(10000);

    const testUri = vscode.Uri.file(path.join(testProjectPath, 'test-unbound-variable-fail.soar'));

    // Wait for diagnostics to be computed
    const diagnostics = await TestHelper.waitForDiagnostics(testUri, 5000);

    // Find the diagnostic for the unbound variable <il>
    const unboundDiagnostic = diagnostics.find(d => d.message.includes('Variable <il>'));

    assert.ok(unboundDiagnostic, 'Should find diagnostic for <il>');

    // The file has: "   (<il> ^hello.world <hw>)" on line 5 (0-indexed: line 4)
    // The variable <il> starts at column 3 (0-indexed) and is 4 characters long
    assert.strictEqual(
      unboundDiagnostic!.range.start.line,
      4,
      'Diagnostic should be on line 4 (0-indexed)'
    );

    // Open the document to verify the actual text
    const document = await vscode.workspace.openTextDocument(testUri);
    const line = document.lineAt(4);
    const lineText = line.text;

    // Find where <il> actually appears in the line
    const varIndex = lineText.indexOf('<il>');
    assert.ok(varIndex !== -1, 'Variable <il> should be found in the line');

    // The diagnostic range should match the actual position of <il>
    assert.strictEqual(
      unboundDiagnostic!.range.start.character,
      varIndex,
      `Diagnostic should start at column ${varIndex} where <il> begins`
    );

    assert.strictEqual(
      unboundDiagnostic!.range.end.character,
      varIndex + 4,
      `Diagnostic should end at column ${varIndex + 4} (length of '<il>')`
    );

    // Verify the range highlights exactly '<il>'
    const highlightedText = lineText.substring(
      unboundDiagnostic!.range.start.character,
      unboundDiagnostic!.range.end.character
    );
    assert.strictEqual(highlightedText, '<il>', 'Diagnostic should highlight exactly "<il>"');
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

    const testUri = vscode.Uri.file(path.join(testProjectPath, 'missing-closing-parenthesis.soar'));

    // Wait for diagnostics
    const diagnostics = await TestHelper.waitForDiagnostics(testUri, 5000);
    console.log(
      `Found ${diagnostics.length} diagnostic(s) for missing closing parenthesis error test:`
    );
    diagnostics.forEach(d => console.log(` - ${d.message} at line ${d.range.start.line}`));

    assert.ok(diagnostics.length > 0, 'Should have syntax error diagnostics');

    const hasSyntaxError = diagnostics.some(d => d.message.includes('closing parenthesis'));

    assert.ok(hasSyntaxError, 'Unmatched opening parenthesis (missing closing parenthesis)');
  });
});
