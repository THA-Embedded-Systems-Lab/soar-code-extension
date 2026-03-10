import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Integration Test Suite
 *
 * These tests verify VS Code-specific functionality that requires the full extension host environment.
 * Unit tests (LSP, datamap validation, project operations) are in test/helpers/
 */

suite('Extension Integration Tests', () => {
  let workspaceUri: vscode.Uri;
  let extension: vscode.Extension<any> | undefined;
  let workspaceSoarFileUri: vscode.Uri;

  function findTopLevelSoarFile(workspacePath: string): string {
    const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
    const soarFile = entries.find(entry => entry.isFile() && entry.name.endsWith('.soar'));

    if (!soarFile) {
      throw new Error(`No top-level .soar file found in test workspace: ${workspacePath}`);
    }

    return path.join(workspacePath, soarFile.name);
  }

  suiteSetup(async () => {
    // Get the test workspace folder
    const testProjectPath = path.resolve(
      __dirname,
      '../../../test/legacy-agents/fixtures/BW-Hierarchical'
    );
    workspaceUri = vscode.Uri.file(testProjectPath);
    workspaceSoarFileUri = vscode.Uri.file(findTopLevelSoarFile(testProjectPath));

    // Ensure extension is activated
    extension = vscode.extensions.getExtension('tha-embedded-systems-lab.soar');
    if (!extension?.isActive) {
      await extension?.activate();
    }

    // Give extension time to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('Extension should be present and active', () => {
    assert.ok(extension, 'Extension should be found');
    assert.ok(extension?.isActive, 'Extension should be active');
  });

  test('Should execute soar.refreshLayout command', async () => {
    await vscode.commands.executeCommand('soar.refreshLayout');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(true, 'Command should execute without error');
  });

  test('Should execute soar.refreshDatamap command', async () => {
    await vscode.commands.executeCommand('soar.refreshDatamap');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(true, 'Command should execute without error');
  });

  test('Should execute soar.loadDatamap command', async () => {
    await vscode.commands.executeCommand('soar.loadDatamap');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(true, 'Command should execute without error');
  });

  test('Should recognize .soar files with correct language ID', async () => {
    const document = await vscode.workspace.openTextDocument(workspaceSoarFileUri);
    assert.strictEqual(document.languageId, 'soar', 'File should be recognized as Soar language');
  });

  test('Should provide LSP diagnostics for opened Soar files', async () => {
    await vscode.workspace.openTextDocument(workspaceSoarFileUri);

    // Wait for LSP to process the file
    await new Promise(resolve => setTimeout(resolve, 1500));

    const diagnostics = vscode.languages.getDiagnostics(workspaceSoarFileUri);
    assert.ok(Array.isArray(diagnostics), 'Should be able to get diagnostics from LSP');
  });

  test('Should execute project validation command', async function () {
    this.timeout(10000);

    await vscode.commands.executeCommand('soar.loadDatamap');
    await new Promise(resolve => setTimeout(resolve, 500));

    await vscode.commands.executeCommand('soar.validateSelectedProjectAgainstDatamap');
    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.ok(true, 'Validation command should execute without error');
  });
});
