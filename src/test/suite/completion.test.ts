import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TestHelper } from '../testUtils';

suite.skip('Completion Test Suite', () => {
  let testDocUri: vscode.Uri;
  let testProjectPath: string;

  suiteSetup(async function () {
    this.timeout(30000); // Increase timeout for setup

    // Get the test project path
    testProjectPath = path.resolve(__dirname, '../../../test/fixtures');
    testDocUri = vscode.Uri.file(path.join(testProjectPath, 'test-completions.soar'));

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

    // Open the test document to ensure it's loaded in the LSP
    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Wait for LSP to be ready
    await TestHelper.waitForLanguageServer(testDocUri);
  });

  test('Should provide root attribute completions after ^', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Find line with "^" and position after it
    // Line 10: "   (state <s> ^io <io>)"
    const position = new vscode.Position(10, 17); // After "^"

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);

    // Should suggest root attributes from the datamap
    TestHelper.assertCompletionContains(
      completions,
      ['io', 'operator', 'type', 'name', 'superstate'],
      'Should suggest root attributes from the datamap'
    );
  });

  test('Should provide completions for dotted path ^io.', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    const editor = await vscode.window.showTextDocument(document);

    // Create a test line: "(<s> ^io <io>)\n   (<io> ^io."
    const testLine = 25; // Use a blank line in the file
    await TestHelper.insertTestContent(testDocUri, testLine, '   (<s> ^io <io>)\n   (<io> ^io.', 0);

    // Wait for document to be saved and parsed by LSP
    await TestHelper.saveAndWait(document);

    const position = new vscode.Position(testLine + 1, 17); // After "^io."

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const labels = TestHelper.getCompletionLabels(completions);

    // Should suggest children of io vertex
    if (!labels.includes('input-link') && !labels.includes('output-link')) {
      assert.fail(
        `No datamap completions found. Completions received: ${labels.slice(0, 10).join(', ')}...`
      );
    }

    TestHelper.assertCompletionContains(
      completions,
      ['input-link', 'output-link'],
      'Should suggest io children'
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 2);
    await document.save();
  });

  test('Should provide completions for nested path ^io.input-link.', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Create a test line
    const testLine = 25;
    await TestHelper.insertTestContent(testDocUri, testLine, '   (<in> ^io.input-link.');

    const position = new vscode.Position(testLine, 25); // After "^io.input-link."

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);

    // Should suggest children of input-link vertex
    TestHelper.assertCompletionContains(
      completions,
      ['data', 'value'],
      'Should suggest input-link children'
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 1);
  });

  test('Should provide completions for output-link path ^io.output-link.', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    await TestHelper.insertTestContent(
      testDocUri,
      testLine,
      '   (<s> ^io.output-link <out>)\n   (<out> ^',
      0
    );

    await TestHelper.saveAndWait(document);

    const position = new vscode.Position(testLine + 1, 13); // After "(<out> ^"

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const labels = TestHelper.getCompletionLabels(completions);

    assert.ok(
      labels.length > 0,
      'No completions returned - LSP may not be ready or project not loaded'
    );

    TestHelper.assertCompletionContains(
      completions,
      ['command', 'status'],
      'Should suggest output-link children'
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 2);
    await document.save();
  });

  test('Should use variable bindings for completions', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Test that after binding <il> to input-link, completions work from <il>
    const testLine = 25;
    await TestHelper.insertTestContent(
      testDocUri,
      testLine,
      '   (<s> ^io.input-link <il>)\n   (<il> ^',
      0
    );

    await TestHelper.saveAndWait(document);

    const position = new vscode.Position(testLine + 1, 12); // After "(<il> ^"

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const labels = TestHelper.getCompletionLabels(completions);

    assert.ok(
      labels.length > 0,
      'No completions returned - LSP may not be ready or project not loaded'
    );

    // <il> is bound to input-link vertex, so should suggest its attributes
    TestHelper.assertCompletionContains(
      completions,
      ['data', 'value'],
      'Should suggest attributes from bound variable'
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 2);
    await document.save();
  });

  test('Should provide completions for operator.name path', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    await TestHelper.insertTestContent(testDocUri, testLine, '   (<s> ^operator.');

    const position = new vscode.Position(testLine, 19); // After "^operator."

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);

    TestHelper.assertCompletionContains(completions, ['name'], 'Should suggest name for operator');

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 1);
  });

  test('Should provide enum completions after ^operator.name', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    await TestHelper.insertTestContent(testDocUri, testLine, '   (<o> ^operator.name ');

    const position = new vscode.Position(testLine, 24); // After space

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const labels = TestHelper.getCompletionLabels(completions);

    // Should suggest enum values if operator.name points to an ENUMERATION
    // Based on test-project.vsa.json, operator.name should have enum values
    assert.ok(labels.length > 0, 'Should have some completions for enum values');

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 1);
  });

  test('Should handle partial path completion ^io.inp', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 21; // Inside the first production where <s> is bound
    await TestHelper.insertTestContent(testDocUri, testLine, '   (<s> ^io.inp)\n');

    const position = new vscode.Position(testLine, 16); // After "^io.inp"

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const datamapCompletions = TestHelper.getDatamapCompletions(completions);

    // Should suggest children of io (including input-link)
    assert.ok(
      datamapCompletions.includes('input-link') || datamapCompletions.includes('output-link'),
      `Should suggest io children for partial path, got: ${datamapCompletions.join(', ')}`
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 1);
  });

  test('Should not provide completions for non-existent paths', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    await TestHelper.insertTestContent(testDocUri, testLine, '   (<s> ^nonexistent.', 0);

    await TestHelper.saveAndWait(document);

    const position = new vscode.Position(testLine, 22); // After "^nonexistent."

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const datamapCompletions = TestHelper.getDatamapCompletions(completions);

    console.log(`Datamap completions for non-existent path: ${datamapCompletions.length} items`);
    console.log(`Datamap completions: ${datamapCompletions.join(', ')}`);

    // For non-existent paths, LSP should not provide any datamap property completions
    assert.strictEqual(
      datamapCompletions.length,
      0,
      `Should not suggest datamap attributes for non-existent path, got: ${datamapCompletions.join(
        ', '
      )}`
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 1);
    await document.save();
  });

  test('Should provide completions respecting variable context', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Bind <out> to output-link and test completions
    const testLine = 25;
    await TestHelper.insertTestContent(
      testDocUri,
      testLine,
      '   (<s> ^io.output-link <out>)\n   (<out> ^',
      0
    );

    await TestHelper.saveAndWait(document);

    const position = new vscode.Position(testLine + 1, 13); // After "(<out> ^"

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const datamapCompletions = TestHelper.getDatamapCompletions(completions);

    assert.ok(
      datamapCompletions.includes('command') || datamapCompletions.includes('status'),
      'No output-link datamap completions found - LSP may not be ready or variable binding failed'
    );

    // <out> is bound to output-link vertex - should suggest its attributes
    const items = Array.isArray(completions) ? completions : completions.items;
    const propertyItems = items.filter(
      (c: vscode.CompletionItem) => c.kind === vscode.CompletionItemKind.Property
    );

    TestHelper.assertCompletionContains(
      propertyItems,
      ['command', 'status'],
      'Should suggest output-link attributes'
    );

    // The key test: input-link attributes should not be suggested for output-link context
    // This validates that variable binding context is working correctly
    TestHelper.assertCompletionExcludes(
      propertyItems,
      ['data', 'value'],
      'Should not suggest input-link attributes for output-link context'
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 2);
    await document.save();
  });

  test('Should handle superstate path completions', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    await TestHelper.insertTestContent(testDocUri, testLine, '   (<s> ^superstate.');

    const position = new vscode.Position(testLine, 21); // After "^superstate."

    const completions = await TestHelper.getCompletionsAt(testDocUri, position);
    const labels = TestHelper.getCompletionLabels(completions);

    // ^superstate should navigate to root state attributes
    assert.ok(
      labels.includes('io') || labels.includes('operator'),
      'Should suggest root state attributes for superstate'
    );

    // Clean up
    await TestHelper.deleteTestContent(testDocUri, testLine, testLine + 1);
  });
});
