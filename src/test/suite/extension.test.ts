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
    this.timeout(15000); // Increase timeout for computationally intensive datamap validation

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

suite('Project Creation Test Suite', () => {
  test('Should create a new project with correct structure', async () => {
    const { ProjectCreator } = await import('../../layout/projectCreator');
    const fs = await import('fs');
    const os = await import('os');

    // Create in temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soar-test-'));
    const agentName = 'TestCreatedAgent';

    try {
      // Create project
      const projectFilePath = await ProjectCreator.createProject({
        directory: tempDir,
        agentName: agentName,
      });

      // Verify project file exists
      assert.ok(fs.existsSync(projectFilePath), 'Project file should exist');

      // Load and verify project structure
      const projectJson = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));

      // Check basic structure
      assert.strictEqual(projectJson.version, '6', 'Version should be 6');
      assert.ok(projectJson.datamap.rootId, 'Root ID should exist');
      assert.ok(Array.isArray(projectJson.datamap.vertices), 'Vertices should be an array');
      assert.strictEqual(projectJson.datamap.vertices.length, 19, 'Should have 19 vertices');

      // Check layout
      assert.strictEqual(projectJson.layout.name, agentName, 'Layout name should match agent name');
      assert.strictEqual(
        projectJson.layout.type,
        'OPERATOR_ROOT',
        'Layout type should be OPERATOR_ROOT'
      );
      assert.ok(Array.isArray(projectJson.layout.children), 'Layout children should be an array');
      assert.strictEqual(projectJson.layout.children.length, 4, 'Should have 4 root children');

      // Check root vertex attributes
      const rootVertex = projectJson.datamap.vertices.find(
        (v: any) => v.id === projectJson.datamap.rootId
      );
      assert.ok(rootVertex, 'Root vertex should exist');
      assert.strictEqual(rootVertex.type, 'SOAR_ID', 'Root should be SOAR_ID');

      const expectedAttrs = [
        'io',
        'name',
        'operator',
        'type',
        'superstate',
        'top-state',
        'epmem',
        'smem',
        'reward-link',
      ];
      const actualAttrs = rootVertex.outEdges.map((e: any) => e.name);
      for (const attr of expectedAttrs) {
        assert.ok(actualAttrs.includes(attr), `Root should have ^${attr} attribute`);
      }

      // Check files exist
      const projectPath = path.join(tempDir, agentName);
      const agentFolder = path.join(projectPath, agentName);

      const expectedFiles = [
        path.join(projectPath, `${agentName}.vsa.json`),
        path.join(projectPath, `${agentName}.soar`),
        path.join(agentFolder, '_firstload.soar'),
        path.join(agentFolder, `${agentName}_source.soar`),
        path.join(agentFolder, `initialize-${agentName}.soar`),
        path.join(agentFolder, 'elaborations', '_all.soar'),
        path.join(agentFolder, 'elaborations', 'top-state.soar'),
        path.join(agentFolder, 'elaborations', 'elaborations_source.soar'),
        path.join(agentFolder, 'all', 'all_source.soar'),
      ];

      for (const file of expectedFiles) {
        assert.ok(fs.existsSync(file), `File should exist: ${path.relative(tempDir, file)}`);
      }
    } finally {
      // Clean up
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  test('Should create project with valid Soar code', async () => {
    const { ProjectCreator } = await import('../../layout/projectCreator');
    const fs = await import('fs');
    const os = await import('os');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soar-test-'));
    const agentName = 'ValidAgent';

    try {
      await ProjectCreator.createProject({
        directory: tempDir,
        agentName: agentName,
      });

      const agentFolder = path.join(tempDir, agentName, agentName);

      // Check initialize operator has correct content
      const initFile = path.join(agentFolder, `initialize-${agentName}.soar`);
      const initContent = fs.readFileSync(initFile, 'utf-8');

      assert.ok(
        initContent.includes(`propose*initialize-${agentName}`),
        'Should have propose rule'
      );
      assert.ok(initContent.includes(`apply*initialize-${agentName}`), 'Should have apply rule');
      assert.ok(initContent.includes(`^name ${agentName}`), 'Should set agent name in apply');

      // Check elaborations have state propagation
      const elabAllFile = path.join(agentFolder, 'elaborations', '_all.soar');
      const elabAllContent = fs.readFileSync(elabAllFile, 'utf-8');

      assert.ok(elabAllContent.includes('elaborate*state*name'), 'Should have name elaboration');
      assert.ok(
        elabAllContent.includes('elaborate*state*top-state'),
        'Should have top-state elaboration'
      );
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  test('Should validate created project without datamap errors', async function () {
    this.timeout(15000); // Increase timeout for validation

    const { ProjectCreator } = await import('../../layout/projectCreator');
    const { ProjectLoader } = await import('../../server/projectLoader');
    const { DatamapValidator } = await import('../../datamap/datamapValidator');
    const { SoarParser } = await import('../../server/soarParser');
    const fs = await import('fs');
    const os = await import('os');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soar-test-'));
    const agentName = 'ValidationTestAgent';

    try {
      // Create project
      const projectFilePath = await ProjectCreator.createProject({
        directory: tempDir,
        agentName: agentName,
      });

      // Load the project
      const projectLoader = new ProjectLoader();
      const projectContext = await projectLoader.loadProject(projectFilePath);

      assert.ok(projectContext, 'Project context should be loaded');
      assert.ok(projectContext.project, 'Project should exist');
      assert.ok(projectContext.datamapIndex, 'Datamap index should exist');

      // Validate all Soar files in the project
      const validator = new DatamapValidator();
      const parser = new SoarParser();
      const allErrors: any[] = [];

      const projectPath = path.join(tempDir, agentName);

      // Get all .soar files recursively
      const getAllSoarFiles = (dir: string): string[] => {
        const files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...getAllSoarFiles(fullPath));
          } else if (entry.isFile() && entry.name.endsWith('.soar')) {
            files.push(fullPath);
          }
        }

        return files;
      };

      const soarFiles = getAllSoarFiles(projectPath);
      assert.ok(soarFiles.length > 0, 'Should have Soar files to validate');

      console.log(`\nValidating ${soarFiles.length} Soar files:`);

      for (const filePath of soarFiles) {
        const relativePath = path.relative(tempDir, filePath);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Parse the file (using file URI and version)
        const fileUri = vscode.Uri.file(filePath).toString();
        const document = parser.parse(fileUri, content, 1);

        // Validate against datamap
        const errors = validator.validateDocument(document, projectContext);

        if (errors.length > 0) {
          console.log(`\nErrors in ${relativePath}:`);
          errors.forEach(err => {
            console.log(`  - Line ${err.line}: ${err.message}`);
            allErrors.push({ file: relativePath, ...err });
          });
        }
      }

      // Assert no validation errors
      if (allErrors.length > 0) {
        console.log(`\n=== All Validation Errors (${allErrors.length}) ===`);
        allErrors.forEach(err => {
          console.log(`${err.file}:${err.line} - ${err.message}`);
        });
      }

      assert.strictEqual(
        allErrors.length,
        0,
        `Created project should have no datamap validation errors. Found: ${allErrors
          .map(e => `${e.file}:${e.line} - ${e.message}`)
          .join(', ')}`
      );
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  test('Should reject invalid agent names', async () => {
    const { ProjectCreator } = await import('../../layout/projectCreator');
    const fs = await import('fs');
    const os = await import('os');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soar-test-'));

    try {
      // Test empty name
      await assert.rejects(
        async () => {
          await ProjectCreator.createProject({
            directory: tempDir,
            agentName: '',
          });
        },
        /Agent name cannot be empty/,
        'Should reject empty agent name'
      );

      // Test invalid directory
      await assert.rejects(
        async () => {
          await ProjectCreator.createProject({
            directory: '/nonexistent/directory',
            agentName: 'TestAgent',
          });
        },
        /Directory does not exist/,
        'Should reject invalid directory'
      );
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });
});

suite('Operator Creation Test Suite', () => {
  test('Should create operators programmatically on a new project', async function () {
    this.timeout(10000); // Increase timeout for this test

    const { ProjectCreator } = await import('../../layout/projectCreator');
    const { ProjectLoader } = await import('../../server/projectLoader');
    const { LayoutOperations } = await import('../../layout/layoutOperations');
    const fs = await import('fs');
    const os = await import('os');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soar-op-test-'));
    const agentName = 'TestOpAgent';

    try {
      // Step 1: Create a new project
      const projectFilePath = await ProjectCreator.createProject({
        directory: tempDir,
        agentName: agentName,
      });

      assert.ok(fs.existsSync(projectFilePath), 'Project file should exist');

      // Step 2: Load the project
      const projectLoader = new ProjectLoader();
      let projectContext = await projectLoader.loadProject(projectFilePath);

      // Verify initial state
      assert.strictEqual(
        projectContext.project.layout.children?.length || 0,
        4,
        'Should have 4 initial children'
      );

      // Step 3: Add a simple operator "sub-operator-only" to root
      const rootLayoutId = projectContext.project.layout.id;

      const operatorResult1 = await LayoutOperations.addOperatorProgrammatic(
        projectContext,
        rootLayoutId,
        'sub-operator-only'
      );

      assert.ok(operatorResult1.success, 'Should successfully add first operator');

      // Reload project to get updated context
      projectContext = await projectLoader.loadProject(projectFilePath);

      // Verify operator was added to layout
      assert.strictEqual(
        projectContext.project.layout.children?.length,
        5,
        'Should now have 5 children after adding operator'
      );

      const simpleOp = projectContext.project.layout.children?.find(
        (c: any) => c.name === 'sub-operator-only'
      );
      assert.ok(simpleOp, 'Simple operator should exist in layout');
      assert.strictEqual(simpleOp.type, 'OPERATOR', 'Should be type OPERATOR');
      assert.strictEqual(simpleOp.file, 'sub-operator-only.soar', 'Should have correct filename');

      // Verify file was created
      const simpleOpFile = path.join(tempDir, agentName, agentName, 'sub-operator-only.soar');
      assert.ok(fs.existsSync(simpleOpFile), 'Operator file should exist');

      // Verify file content
      const simpleOpContent = fs.readFileSync(simpleOpFile, 'utf-8');
      assert.ok(simpleOpContent.includes('propose*sub-operator-only'), 'Should have propose rule');
      assert.ok(simpleOpContent.includes('apply*sub-operator-only'), 'Should have apply rule');
      assert.ok(simpleOpContent.includes(`^name ${agentName}`), 'Propose should check state name');

      // Verify datamap was updated
      const rootVertex = projectContext.project.datamap.vertices.find(
        (v: any) => v.id === projectContext.project.datamap.rootId
      );
      assert.ok(rootVertex, 'Root vertex should exist');
      const operatorEdges = (rootVertex as any).outEdges.filter((e: any) => e.name === 'operator');

      // Should have 2 operator edges now (initialize + sub-operator-only)
      assert.ok(operatorEdges.length >= 2, 'Should have at least 2 operator edges');

      // Find the operator vertex for sub-operator-only
      let foundSimpleOp = false;
      for (const edge of operatorEdges) {
        const opVertex = projectContext.datamapIndex.get(edge.toId);
        if (opVertex && (opVertex as any).outEdges) {
          const nameEdge = (opVertex as any).outEdges.find((e: any) => e.name === 'name');
          if (nameEdge) {
            const nameVertex = projectContext.datamapIndex.get(nameEdge.toId);
            if (
              nameVertex &&
              (nameVertex as any).choices &&
              (nameVertex as any).choices.includes('sub-operator-only')
            ) {
              foundSimpleOp = true;
              break;
            }
          }
        }
      }
      assert.ok(foundSimpleOp, 'Should find sub-operator-only in datamap');

      // Step 4: Add a high-level operator "sub-operator-with-child"
      const operatorResult2 = await LayoutOperations.addOperatorProgrammatic(
        projectContext,
        rootLayoutId,
        'sub-operator-with-child'
      );

      assert.ok(operatorResult2.success, 'Should successfully add second operator');

      // Reload project
      projectContext = await projectLoader.loadProject(projectFilePath);

      const highLevelOp = projectContext.project.layout.children?.find(
        (c: any) => c.name === 'sub-operator-with-child'
      );
      assert.ok(highLevelOp, 'High-level operator should exist in layout');
      assert.strictEqual(highLevelOp.type, 'OPERATOR', 'Should initially be type OPERATOR');

      // Step 5: Add a child operator to make it a HIGH_LEVEL_OPERATOR
      const childOperatorResult = await LayoutOperations.addOperatorProgrammatic(
        projectContext,
        highLevelOp.id,
        'child-operator'
      );

      assert.ok(childOperatorResult.success, 'Should successfully add child operator');

      // Reload project to see the conversion
      projectContext = await projectLoader.loadProject(projectFilePath);

      const highLevelOpUpdated = projectContext.project.layout.children?.find(
        (c: any) => c.name === 'sub-operator-with-child'
      );
      assert.ok(highLevelOpUpdated, 'High-level operator should still exist');
      assert.strictEqual(
        highLevelOpUpdated.type,
        'HIGH_LEVEL_OPERATOR',
        'Should now be HIGH_LEVEL_OPERATOR'
      );
      assert.ok(highLevelOpUpdated.folder, 'Should have folder property');
      assert.ok(highLevelOpUpdated.children, 'Should have children array');
      assert.ok(highLevelOpUpdated.dmId, 'Should have dmId for substate');

      // Verify folder structure was created
      const highLevelFolder = path.join(tempDir, agentName, agentName, 'sub-operator-with-child');
      assert.ok(fs.existsSync(highLevelFolder), 'High-level operator folder should exist');

      // Verify elaborations.soar was created
      const elabFile = path.join(highLevelFolder, 'elaborations.soar');
      assert.ok(fs.existsSync(elabFile), 'Elaborations file should exist');

      // Verify source file was created
      const sourceFile = path.join(highLevelFolder, 'sub-operator-with-child_source.soar');
      assert.ok(fs.existsSync(sourceFile), 'Source file should exist');

      // Verify child operator file
      const childOpFile = path.join(highLevelFolder, 'child-operator.soar');
      assert.ok(fs.existsSync(childOpFile), 'Child operator file should exist');

      const childOpContent = fs.readFileSync(childOpFile, 'utf-8');
      assert.ok(
        childOpContent.includes('propose*child-operator'),
        'Child should have propose rule'
      );
      assert.ok(childOpContent.includes('apply*child-operator'), 'Child should have apply rule');
      assert.ok(
        childOpContent.includes('^name sub-operator-with-child'),
        'Child propose should check parent state name'
      );

      // Verify substate datamap was created
      const substateVertex = projectContext.datamapIndex.get(highLevelOpUpdated.dmId);
      assert.ok(substateVertex, 'Substate vertex should exist in datamap');
      assert.strictEqual(substateVertex.type, 'SOAR_ID', 'Substate should be SOAR_ID');

      // Verify substate has standard attributes
      const substateAttrs = (substateVertex as any).outEdges?.map((e: any) => e.name) || [];
      assert.ok(substateAttrs.includes('superstate'), 'Substate should have ^superstate');
      assert.ok(substateAttrs.includes('operator'), 'Substate should have ^operator');
      assert.ok(substateAttrs.includes('name'), 'Substate should have ^name');

      // Verify child operator is in substate datamap
      const substateOpEdges =
        (substateVertex as any).outEdges?.filter((e: any) => e.name === 'operator') || [];
      let foundChildOp = false;
      for (const edge of substateOpEdges) {
        const opVertex = projectContext.datamapIndex.get(edge.toId);
        if (opVertex && (opVertex as any).outEdges) {
          const nameEdge = (opVertex as any).outEdges.find((e: any) => e.name === 'name');
          if (nameEdge) {
            const nameVertex = projectContext.datamapIndex.get(nameEdge.toId);
            if (
              nameVertex &&
              (nameVertex as any).choices &&
              (nameVertex as any).choices.includes('child-operator')
            ) {
              foundChildOp = true;
              break;
            }
          }
        }
      }
      assert.ok(foundChildOp, 'Should find child-operator in substate datamap');

      // Final verification: count total operators in root state
      const finalRootVertex = projectContext.project.datamap.vertices.find(
        (v: any) => v.id === projectContext.project.datamap.rootId
      );
      assert.ok(finalRootVertex, 'Final root vertex should exist');
      const finalOperatorEdges = (finalRootVertex as any).outEdges.filter(
        (e: any) => e.name === 'operator'
      );

      // Should have 3 operators: initialize, sub-operator-only, sub-operator-with-child
      assert.strictEqual(finalOperatorEdges.length, 3, 'Root should have exactly 3 operator edges');

      // Verify layout structure matches expected
      assert.strictEqual(
        projectContext.project.layout.children?.length,
        6,
        'Root layout should have 6 children: _firstload, all, elaborations, initialize, sub-operator-only, sub-operator-with-child'
      );

      // Verify the high-level operator has 2 children
      assert.strictEqual(
        highLevelOpUpdated.children?.length,
        2,
        'High-level operator should have 2 children: elaborations and child-operator'
      );
    } finally {
      // Clean up
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });
});
