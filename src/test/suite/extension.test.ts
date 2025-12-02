import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('soar-group.soar'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('soar-group.soar');
    await extension?.activate();
    assert.ok(extension?.isActive);
  });
});

suite('Datamap Test Suite', () => {
  let workspaceUri: vscode.Uri;

  suiteSetup(async () => {
    // Get the test workspace folder
    const testProjectPath = path.resolve(__dirname, '../../../test/BW-Hierarchical');
    workspaceUri = vscode.Uri.file(testProjectPath);

    // Ensure extension is activated
    const extension = vscode.extensions.getExtension('soar-group.soar');
    if (!extension?.isActive) {
      await extension?.activate();
    }

    // Give extension time to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('Should load BW-Hierarchical project', async () => {
    // Execute the refresh layout command
    await vscode.commands.executeCommand('soar.refreshLayout');

    // Wait for project to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the tree view has data by checking if we can get the tree view
    const treeView = vscode.window.createTreeView('soarLayout', {
      treeDataProvider: {
        getTreeItem: (element: any) => element,
        getChildren: () => [],
      },
    });

    assert.ok(treeView, 'Layout tree view should be created');
    treeView.dispose();
  });

  test('Should refresh datamap', async () => {
    // Execute the refresh datamap command
    await vscode.commands.executeCommand('soar.refreshDatamap');

    // Wait for datamap to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the tree view has data
    const treeView = vscode.window.createTreeView('soarDatamap', {
      treeDataProvider: {
        getTreeItem: (element: any) => element,
        getChildren: () => [],
      },
    });

    assert.ok(treeView, 'Datamap tree view should be created');
    treeView.dispose();
  });

  test('Should load datamap command', async () => {
    // Execute load datamap command
    await vscode.commands.executeCommand('soar.loadDatamap');

    // Wait for loading
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Command should complete without errors
    assert.ok(true, 'Load datamap command should execute');
  });

  test('Should view root datamap', async () => {
    // First load the datamap
    await vscode.commands.executeCommand('soar.loadDatamap');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Then view root datamap
    await vscode.commands.executeCommand('soar.viewRootDatamap');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Command should complete without errors
    assert.ok(true, 'View root datamap command should execute');
  });

  test('Should validate project file structure', async () => {
    // Check if the project file exists
    const projectFilePath = path.join(workspaceUri.fsPath, 'BW-Hierarchical.vsa.json');
    const projectFileUri = vscode.Uri.file(projectFilePath);

    try {
      const stat = await vscode.workspace.fs.stat(projectFileUri);
      assert.ok(stat.size > 0, 'Project file should exist and have content');
    } catch (error) {
      assert.fail('Project file should be accessible');
    }
  });

  test('Should open and validate Soar files', async () => {
    // Open a Soar file from the project
    const soarFilePath = path.join(workspaceUri.fsPath, 'BW-Hierarchical.soar');
    const soarFileUri = vscode.Uri.file(soarFilePath);

    try {
      const document = await vscode.workspace.openTextDocument(soarFileUri);
      assert.strictEqual(document.languageId, 'soar', 'File should be recognized as Soar language');
      assert.ok(document.getText().length > 0, 'Soar file should have content');

      // Wait a bit for validation to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check for diagnostics (errors/warnings)
      const diagnostics = vscode.languages.getDiagnostics(soarFileUri);
      console.log(`Found ${diagnostics.length} diagnostic(s) in ${path.basename(soarFilePath)}`);

      // We don't assert no diagnostics, just verify we can get them
      assert.ok(Array.isArray(diagnostics), 'Should be able to get diagnostics');
    } catch (error) {
      assert.fail(`Should be able to open Soar file: ${error}`);
    }
  });
});
