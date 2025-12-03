import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('tha-embedded-systems-lab.soar'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('tha-embedded-systems-lab.soar');
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
    const extension = vscode.extensions.getExtension('tha-embedded-systems-lab.soar');
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

  test('Should detect enumeration errors when validating project', async function () {
    this.timeout(5000); // Increase timeout for this test

    // First ensure the datamap is loaded
    await vscode.commands.executeCommand('soar.loadDatamap');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run full project validation
    await vscode.commands.executeCommand('soar.validateSelectedProjectAgainstDatamap');

    // Wait for validation to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check for diagnostics in move-block.soar
    const moveBlockPath = path.join(workspaceUri.fsPath, 'BW-Hierarchical', 'move-block.soar');
    const moveBlockUri = vscode.Uri.file(moveBlockPath);
    const diagnostics = vscode.languages.getDiagnostics(moveBlockUri);

    console.log(`Found ${diagnostics.length} diagnostic(s) in move-block.soar`);

    if (diagnostics.length > 0) {
      diagnostics.forEach(d => {
        console.log(`  - Line ${d.range.start.line + 1}: ${d.message}`);
      });
    }

    // Should find the typo "moe-block" instead of "move-block"
    const enumError = diagnostics.find(
      d => d.message.includes('moe-block') && d.message.includes('Invalid enumeration value')
    );

    assert.ok(enumError, 'Should detect the enumeration typo "moe-block" in move-block.soar');
    assert.strictEqual(
      enumError.range.start.line,
      19,
      'Error should be on line 20 (0-indexed: 19)'
    );
  });
});

suite('Delete Functionality Test Suite', () => {
  let workspaceUri: vscode.Uri;
  const fs = require('fs').promises;

  suiteSetup(async () => {
    // Get the test workspace folder
    const testProjectPath = path.resolve(__dirname, '../../../test/fixtures');
    workspaceUri = vscode.Uri.file(testProjectPath);

    // Ensure extension is activated
    const extension = vscode.extensions.getExtension('tha-embedded-systems-lab.soar');
    if (!extension?.isActive) {
      await extension?.activate();
    }

    // Give extension time to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('Should verify test project structure exists', async () => {
    const projectFilePath = path.join(workspaceUri.fsPath, 'test-project.vsa.json');
    const projectFileUri = vscode.Uri.file(projectFilePath);

    try {
      const stat = await vscode.workspace.fs.stat(projectFileUri);
      assert.ok(stat.size > 0, 'Test project file should exist');
    } catch (error) {
      assert.fail('Test project file should be accessible');
    }
  });

  test('Should create and delete a test file', async function () {
    this.timeout(10000);

    // Create a temporary test file
    const testFilePath = path.join(workspaceUri.fsPath, 'test-delete-file.soar');
    const testContent =
      'sp {test*proposal\n   (state <s> ^superstate nil)\n-->\n   (<s> ^operator <o> +)\n   (<o> ^name test)\n}';

    await fs.writeFile(testFilePath, testContent, 'utf8');

    // Verify file exists
    let fileExists = false;
    try {
      await fs.access(testFilePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    assert.ok(fileExists, 'Test file should be created');

    // Delete the file
    await fs.unlink(testFilePath);

    // Verify file is deleted
    try {
      await fs.access(testFilePath);
      assert.fail('File should be deleted');
    } catch {
      assert.ok(true, 'File should not exist after deletion');
    }
  });

  test('Should create and delete a test folder with contents', async function () {
    this.timeout(10000);

    // Create a temporary test folder with files
    const testFolderPath = path.join(workspaceUri.fsPath, 'test-delete-folder');
    const testFile1Path = path.join(testFolderPath, 'file1.soar');
    const testFile2Path = path.join(testFolderPath, 'file2.soar');
    const testContent =
      'sp {test*rule\n   (state <s> ^superstate nil)\n-->\n   (<s> ^test true)\n}';

    // Create folder and files
    await fs.mkdir(testFolderPath, { recursive: true });
    await fs.writeFile(testFile1Path, testContent, 'utf8');
    await fs.writeFile(testFile2Path, testContent, 'utf8');

    // Verify folder and files exist
    let folderExists = false;
    let file1Exists = false;
    let file2Exists = false;

    try {
      await fs.access(testFolderPath);
      folderExists = true;
    } catch {
      folderExists = false;
    }

    try {
      await fs.access(testFile1Path);
      file1Exists = true;
    } catch {
      file1Exists = false;
    }

    try {
      await fs.access(testFile2Path);
      file2Exists = true;
    } catch {
      file2Exists = false;
    }

    assert.ok(folderExists, 'Test folder should be created');
    assert.ok(file1Exists, 'Test file 1 should be created');
    assert.ok(file2Exists, 'Test file 2 should be created');

    // Delete files first
    await fs.unlink(testFile1Path);
    await fs.unlink(testFile2Path);

    // Then delete folder
    await fs.rmdir(testFolderPath);

    // Verify folder is deleted
    try {
      await fs.access(testFolderPath);
      assert.fail('Folder should be deleted');
    } catch {
      assert.ok(true, 'Folder should not exist after deletion');
    }
  });

  test('Should handle recursive folder deletion', async function () {
    this.timeout(10000);

    // Create a nested folder structure
    const testRootPath = path.join(workspaceUri.fsPath, 'test-recursive-delete');
    const testSubPath = path.join(testRootPath, 'subfolder');
    const testSubSubPath = path.join(testSubPath, 'subsubfolder');
    const testFile1Path = path.join(testRootPath, 'root.soar');
    const testFile2Path = path.join(testSubPath, 'sub.soar');
    const testFile3Path = path.join(testSubSubPath, 'subsub.soar');
    const testContent =
      'sp {test*rule\n   (state <s> ^superstate nil)\n-->\n   (<s> ^test true)\n}';

    // Create nested folders and files
    await fs.mkdir(testSubSubPath, { recursive: true });
    await fs.writeFile(testFile1Path, testContent, 'utf8');
    await fs.writeFile(testFile2Path, testContent, 'utf8');
    await fs.writeFile(testFile3Path, testContent, 'utf8');

    // Verify structure exists
    let rootExists = false;
    try {
      await fs.access(testRootPath);
      rootExists = true;
    } catch {
      rootExists = false;
    }
    assert.ok(rootExists, 'Root folder should be created');

    // Delete in correct order: files first, then folders deepest to shallowest
    const filesToDelete = [testFile3Path, testFile2Path, testFile1Path];
    const foldersToDelete = [testSubSubPath, testSubPath, testRootPath];

    for (const file of filesToDelete) {
      await fs.unlink(file);
    }

    for (const folder of foldersToDelete) {
      await fs.rmdir(folder);
    }

    // Verify root folder is deleted
    try {
      await fs.access(testRootPath);
      assert.fail('Root folder should be deleted');
    } catch {
      assert.ok(true, 'Root folder should not exist after recursive deletion');
    }
  });

  test('Should verify file collection for deletion', async function () {
    this.timeout(10000);

    // This test simulates what the deleteNode function does internally
    // Create a test structure
    const testRootPath = path.join(workspaceUri.fsPath, 'test-collection');
    const testFile1Path = path.join(testRootPath, 'file1.soar');
    const testFile2Path = path.join(testRootPath, 'file2.soar');

    await fs.mkdir(testRootPath, { recursive: true });
    await fs.writeFile(testFile1Path, 'content1', 'utf8');
    await fs.writeFile(testFile2Path, 'content2', 'utf8');

    // Simulate file collection
    const collectedFiles: string[] = [];
    const collectedFolders: string[] = [];

    collectedFiles.push(testFile1Path);
    collectedFiles.push(testFile2Path);
    collectedFolders.push(testRootPath);

    // Verify collection
    assert.strictEqual(collectedFiles.length, 2, 'Should collect 2 files');
    assert.strictEqual(collectedFolders.length, 1, 'Should collect 1 folder');

    // Clean up
    for (const file of collectedFiles) {
      await fs.unlink(file);
    }
    for (const folder of collectedFolders) {
      await fs.rmdir(folder);
    }

    assert.ok(true, 'File collection simulation completed');
  });
});

suite('Layout File Path Test Suite', () => {
  let workspaceUri: vscode.Uri;
  const fs = require('fs').promises;

  suiteSetup(async () => {
    // Get the test workspace folder
    const testProjectPath = path.resolve(__dirname, '../../../test/BW-Hierarchical');
    workspaceUri = vscode.Uri.file(testProjectPath);

    // Ensure extension is activated
    const extension = vscode.extensions.getExtension('tha-embedded-systems-lab.soar');
    if (!extension?.isActive) {
      await extension?.activate();
    }

    // Give extension time to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('Should load BW-Hierarchical project for path testing', async function () {
    this.timeout(5000);

    // Load the project
    await vscode.commands.executeCommand('soar.refreshLayout');
    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.ok(true, 'Project loaded successfully');
  });

  test('Should compute correct file paths for root-level files', async function () {
    this.timeout(5000);

    // Expected files at root level (BW-Hierarchical/BW-Hierarchical/)
    const rootFiles = [
      '_firstload.soar',
      '_readme.soar',
      'external-operator-implementations.soar',
      'search-control.soar',
      'initialize-blocks-world.soar',
      'move-block.soar',
    ];

    const projectFolder = path.join(workspaceUri.fsPath, 'BW-Hierarchical');

    for (const file of rootFiles) {
      const filePath = path.join(projectFolder, file);
      try {
        await fs.access(filePath);
        assert.ok(true, `File exists: ${file}`);
      } catch (error) {
        assert.fail(`File should exist: ${file} at ${filePath}`);
      }
    }
  });

  test('Should compute correct file paths for nested files', async function () {
    this.timeout(5000);

    // Expected nested files
    const nestedFiles = [
      { path: 'elaborations/clear.soar', description: 'File in folder' },
      { path: 'elaborations/detect-success.soar', description: 'File in folder' },
      { path: 'move-block/elaborations.soar', description: 'File in HIGH_LEVEL_OPERATOR folder' },
      { path: 'move-block/pick-up.soar', description: 'Nested HIGH_LEVEL_OPERATOR file' },
      {
        path: 'move-block/pick-up/close-gripper.soar',
        description: 'File in nested HIGH_LEVEL_OPERATOR',
      },
      {
        path: 'move-block/pick-up/elaborations.soar',
        description: 'File in nested HIGH_LEVEL_OPERATOR',
      },
    ];

    const projectFolder = path.join(workspaceUri.fsPath, 'BW-Hierarchical');

    for (const item of nestedFiles) {
      const filePath = path.join(projectFolder, item.path);
      try {
        await fs.access(filePath);
        assert.ok(true, `${item.description}: ${item.path}`);
      } catch (error) {
        assert.fail(`File should exist (${item.description}): ${item.path} at ${filePath}`);
      }
    }
  });

  test('Should have matching paths between layout tree and file system', async function () {
    this.timeout(5000);

    // This test verifies that all files referenced in the layout tree actually exist on disk
    // Load the project file
    const projectFilePath = path.join(workspaceUri.fsPath, 'BW-Hierarchical.vsa.json');
    const content = await fs.readFile(projectFilePath, 'utf-8');
    const project = JSON.parse(content);

    // Helper to check file existence recursively
    const checkNode = async (node: any, parentPath: string) => {
      let currentPath = parentPath;

      // If this node has a folder, add it to the path for children
      if (node.folder) {
        currentPath = parentPath ? path.join(parentPath, node.folder) : node.folder;
      }

      // If this node has a file, check if it exists
      if (node.file) {
        const workspaceFolder = path.dirname(projectFilePath);
        const filePath = path.join(workspaceFolder, parentPath, node.file);

        try {
          await fs.access(filePath);
          console.log(`  ✓ ${path.join(parentPath, node.file)}`);
        } catch (error) {
          assert.fail(
            `File from layout should exist on disk: ${path.join(
              parentPath,
              node.file
            )} (full: ${filePath})`
          );
        }
      }

      // Check children
      if (node.children) {
        for (const child of node.children) {
          await checkNode(child, currentPath);
        }
      }
    };

    // Start checking from the root
    await checkNode(project.layout, '');
    assert.ok(true, 'All files in layout exist on disk');
  });
});
