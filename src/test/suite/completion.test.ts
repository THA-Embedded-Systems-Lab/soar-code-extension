import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('Completion Test Suite', () => {
  let testDocUri: vscode.Uri;
  let testProjectPath: string;

  suiteSetup(async function () {
    this.timeout(30000); // Increase timeout for setup

    // Get the test project path
    testProjectPath = path.resolve(__dirname, '../../../test/fixtures');
    testDocUri = vscode.Uri.file(path.join(testProjectPath, 'test-completions.soar'));

    // Ensure extension is activated
    const extension = vscode.extensions.getExtension('tha-embedded-systems-lab.soar');
    if (!extension?.isActive) {
      await extension?.activate();
    }

    // Wait for extension activation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Load the test project explicitly
    const projectFile = path.join(testProjectPath, 'test-project.vsa.json');

    // Try to trigger project manager to discover projects
    try {
      await vscode.commands.executeCommand('soar.refreshLayout');
      await vscode.commands.executeCommand('soar.refreshDatamap');
    } catch (e) {
      // Commands might not exist yet, that's ok
    }

    // Wait for LSP to initialize and load project
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  /**
   * Helper function to get completions at a specific position
   */
  async function getCompletionsAt(
    uri: vscode.Uri,
    position: vscode.Position
  ): Promise<vscode.CompletionList | vscode.CompletionItem[]> {
    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      uri,
      position
    );
    return result || [];
  }

  /**
   * Helper to find completion labels
   */
  function getCompletionLabels(
    completions: vscode.CompletionList | vscode.CompletionItem[]
  ): string[] {
    const items = Array.isArray(completions) ? completions : completions.items;
    return items.map(item => (typeof item.label === 'string' ? item.label : item.label.label));
  }

  /**
   * Helper to find datamap property completions (from LSP, not text-based)
   */
  function getDatamapCompletions(
    completions: vscode.CompletionList | vscode.CompletionItem[]
  ): string[] {
    const items = Array.isArray(completions) ? completions : completions.items;
    // Filter for Property kind completions (datamap attributes from LSP)
    return items
      .filter(item => item.kind === vscode.CompletionItemKind.Property)
      .map(item => (typeof item.label === 'string' ? item.label : item.label.label));
  }

  test('Should provide root attribute completions after ^', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Find line with "^" and position after it
    // Line 10: "   (state <s> ^io <io>)"
    const position = new vscode.Position(10, 17); // After "^"

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    // Should suggest root attributes from the datamap
    assert.ok(labels.includes('io'), 'Should suggest "io"');
    assert.ok(labels.includes('operator'), 'Should suggest "operator"');
    assert.ok(labels.includes('type'), 'Should suggest "type"');
    assert.ok(labels.includes('name'), 'Should suggest "name"');
    assert.ok(labels.includes('superstate'), 'Should suggest "superstate"');
  });

  test('Should provide completions for dotted path ^io.', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    const editor = await vscode.window.showTextDocument(document);

    // Create a test line: "(<s> ^io <io>)\n   (<io> ^io."
    const testLine = 25; // Use a blank line in the file
    const edit = new vscode.WorkspaceEdit();
    edit.insert(testDocUri, new vscode.Position(testLine, 0), '   (<s> ^io <io>)\n   (<io> ^io.');
    await vscode.workspace.applyEdit(edit);

    // Wait for document to be saved and parsed by LSP
    await document.save();
    await new Promise(resolve => setTimeout(resolve, 1500));

    const position = new vscode.Position(testLine + 1, 17); // After "^io."

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    // Should suggest children of io vertex
    // Note: Completions may include text-based suggestions from VS Code's default provider
    // We just need to verify our datamap completions are present

    if (!labels.includes('input-link') && !labels.includes('output-link')) {
      assert.fail(
        `No datamap completions found. Completions received: ${labels.slice(0, 10).join(', ')}...`
      );
    }

    assert.ok(labels.includes('input-link'), 'Should suggest "input-link"');
    assert.ok(labels.includes('output-link'), 'Should suggest "output-link"');

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 2, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
    await document.save();
  });

  test('Should provide completions for nested path ^io.input-link.', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Create a test line
    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(testDocUri, new vscode.Position(testLine, 0), '   (<in> ^io.input-link.');
    await vscode.workspace.applyEdit(edit);

    await new Promise(resolve => setTimeout(resolve, 500));

    const position = new vscode.Position(testLine, 25); // After "^io.input-link."

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    // Should suggest children of input-link vertex
    assert.ok(labels.includes('data'), 'Should suggest "data"');
    assert.ok(labels.includes('value'), 'Should suggest "value"');

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 1, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
  });

  test('Should provide completions for output-link path ^io.output-link.', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      testDocUri,
      new vscode.Position(testLine, 0),
      '   (<s> ^io.output-link <out>)\n   (<out> ^'
    );
    await vscode.workspace.applyEdit(edit);

    await document.save();
    await new Promise(resolve => setTimeout(resolve, 1500));

    const position = new vscode.Position(testLine + 1, 13); // After "(<out> ^"

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    assert.ok(
      labels.length > 0,
      'No completions returned - LSP may not be ready or project not loaded'
    );

    assert.ok(labels.includes('command'), 'Should suggest "command"');
    assert.ok(labels.includes('status'), 'Should suggest "status"');

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 2, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
    await document.save();
  });

  test('Should use variable bindings for completions', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Test that after binding <il> to input-link, completions work from <il>
    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      testDocUri,
      new vscode.Position(testLine, 0),
      '   (<s> ^io.input-link <il>)\n   (<il> ^'
    );
    await vscode.workspace.applyEdit(edit);

    await document.save();
    await new Promise(resolve => setTimeout(resolve, 1500));

    const position = new vscode.Position(testLine + 1, 12); // After "(<il> ^"

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    assert.ok(
      labels.length > 0,
      'No completions returned - LSP may not be ready or project not loaded'
    );

    // <il> is bound to input-link vertex, so should suggest its attributes
    assert.ok(labels.includes('data'), 'Should suggest "data" from bound variable');
    assert.ok(labels.includes('value'), 'Should suggest "value" from bound variable');

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 2, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
    await document.save();
  });

  test('Should provide completions for operator.name path', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(testDocUri, new vscode.Position(testLine, 0), '   (<s> ^operator.');
    await vscode.workspace.applyEdit(edit);

    await new Promise(resolve => setTimeout(resolve, 500));

    const position = new vscode.Position(testLine, 19); // After "^operator."

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    assert.ok(labels.includes('name'), 'Should suggest "name" for operator');

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 1, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
  });

  test('Should provide enum completions after ^operator.name', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(testDocUri, new vscode.Position(testLine, 0), '   (<o> ^operator.name ');
    await vscode.workspace.applyEdit(edit);

    await new Promise(resolve => setTimeout(resolve, 500));

    const position = new vscode.Position(testLine, 24); // After space

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    // Should suggest enum values if operator.name points to an ENUMERATION
    // Based on test-project.vsa.json, operator.name should have enum values
    assert.ok(labels.length > 0, 'Should have some completions for enum values');
  });

  test('Should handle partial path completion ^io.inp', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 21; // Inside the first production where <s> is bound
    const edit = new vscode.WorkspaceEdit();
    edit.insert(testDocUri, new vscode.Position(testLine, 0), '   (<s> ^io.inp)\n');
    await vscode.workspace.applyEdit(edit);

    await new Promise(resolve => setTimeout(resolve, 500));

    const position = new vscode.Position(testLine, 16); // After "^io.inp"

    const completions = await getCompletionsAt(testDocUri, position);
    const datamapCompletions = getDatamapCompletions(completions);

    // Should suggest children of io (including input-link)
    assert.ok(
      datamapCompletions.includes('input-link') || datamapCompletions.includes('output-link'),
      `Should suggest io children for partial path, got: ${datamapCompletions.join(', ')}`
    );

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 1, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
  });

  test('Should not provide completions for non-existent paths', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(testDocUri, new vscode.Position(testLine, 0), '   (<s> ^nonexistent.');
    await vscode.workspace.applyEdit(edit);

    await document.save();
    await new Promise(resolve => setTimeout(resolve, 1500));

    const position = new vscode.Position(testLine, 22); // After "^nonexistent."

    const completions = await getCompletionsAt(testDocUri, position);
    const datamapCompletions = getDatamapCompletions(completions);

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
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 1, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
    await document.save();
  });

  test('Should provide completions respecting variable context', async function () {
    this.timeout(15000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Bind <out> to output-link and test completions
    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      testDocUri,
      new vscode.Position(testLine, 0),
      '   (<s> ^io.output-link <out>)\n   (<out> ^'
    );
    await vscode.workspace.applyEdit(edit);

    await document.save();
    await new Promise(resolve => setTimeout(resolve, 1500));

    const position = new vscode.Position(testLine + 1, 13); // After "(<out> ^"

    const completions = await getCompletionsAt(testDocUri, position);
    const datamapCompletions = getDatamapCompletions(completions);

    assert.ok(
      datamapCompletions.includes('command') || datamapCompletions.includes('status'),
      'No output-link datamap completions found - LSP may not be ready or variable binding failed'
    );

    // <out> is bound to output-link vertex - should suggest its attributes
    assert.ok(
      datamapCompletions.includes('command'),
      'Should suggest "command" for output-link context'
    );
    assert.ok(
      datamapCompletions.includes('status'),
      'Should suggest "status" for output-link context'
    );

    // The key test: input-link attributes should not be suggested for output-link context
    // This validates that variable binding context is working correctly
    assert.ok(
      !datamapCompletions.includes('data'),
      'Should not suggest input-link attribute "data"'
    );
    assert.ok(
      !datamapCompletions.includes('value'),
      'Should not suggest input-link attribute "value"'
    );

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 2, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
    await document.save();
  });

  test('Should handle superstate path completions', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const testLine = 25;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(testDocUri, new vscode.Position(testLine, 0), '   (<s> ^superstate.');
    await vscode.workspace.applyEdit(edit);

    await new Promise(resolve => setTimeout(resolve, 500));

    const position = new vscode.Position(testLine, 21); // After "^superstate."

    const completions = await getCompletionsAt(testDocUri, position);
    const labels = getCompletionLabels(completions);

    // ^superstate should navigate to root state attributes
    assert.ok(
      labels.includes('io') || labels.includes('operator'),
      'Should suggest root state attributes for superstate'
    );

    // Clean up
    const cleanEdit = new vscode.WorkspaceEdit();
    cleanEdit.delete(
      testDocUri,
      new vscode.Range(new vscode.Position(testLine, 0), new vscode.Position(testLine + 1, 0))
    );
    await vscode.workspace.applyEdit(cleanEdit);
  });
});
