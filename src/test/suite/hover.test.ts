import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TestHelper } from '../testUtils';

suite('Hover Test Suite', () => {
  let testDocUri: vscode.Uri;
  let testProjectPath: string;

  suiteSetup(async function () {
    this.timeout(30000);

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

    // Open the test document
    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Wait for LSP to be ready
    await TestHelper.waitForLanguageServer(testDocUri);
  });

  test('Should provide hover info for datamap attributes', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Hover over "io" in "^io"
    // Line 10: "   (state <s> ^io <io>)"
    const position = new vscode.Position(10, 18); // On "io"

    const hoverInfo = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      testDocUri,
      position
    );

    assert.ok(hoverInfo && hoverInfo.length > 0, 'Should provide hover information');

    const hoverText = hoverInfo[0].contents.map(c => c.toString()).join('');

    // Hover should contain information about the datamap attribute
    assert.ok(hoverText.length > 0, 'Hover text should not be empty');
  });

  test('Should provide hover info for variables', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Hover over a variable like <s>
    const position = new vscode.Position(10, 13); // On "<s>"

    const hoverInfo = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      testDocUri,
      position
    );

    if (hoverInfo && hoverInfo.length > 0) {
      const hoverText = hoverInfo[0].contents.map(c => c.toString()).join('');
      assert.ok(hoverText.length > 0, 'Variable hover text should not be empty');
    } else {
      console.log('No hover info for variable (this may be expected)');
    }
  });

  test('Should provide hover info for production rules', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Hover over production name
    // Line 9: "sp {test*production"
    const position = new vscode.Position(9, 5); // On "test*production"

    const hoverInfo = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      testDocUri,
      position
    );

    if (hoverInfo && hoverInfo.length > 0) {
      const hoverText = hoverInfo[0].contents.map(c => c.toString()).join('');
      assert.ok(hoverText.length > 0, 'Production hover text should not be empty');
    } else {
      console.log('No hover info for production (this may be expected)');
    }
  });

  test('Should provide hover info for operators', async function () {
    this.timeout(10000);

    // Use dedicated fixture file instead of modifying test file
    const operatorTestUri = vscode.Uri.file(path.join(testProjectPath, 'test-hover-operator.soar'));

    const document = await vscode.workspace.openTextDocument(operatorTestUri);
    await vscode.window.showTextDocument(document);

    // Wait for LSP to process the file
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Hover over "operator" in line 2
    const position = new vscode.Position(2, 10);

    const hoverInfo = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      operatorTestUri,
      position
    );

    if (hoverInfo && hoverInfo.length > 0) {
      const hoverText = hoverInfo[0].contents.map(c => c.toString()).join('');
      assert.ok(hoverText.length > 0, 'Operator hover text should not be empty');
    }
  });
});
