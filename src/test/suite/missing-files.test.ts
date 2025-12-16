import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TestHelper } from '../testUtils';

suite('Missing Files Validation Test Suite', () => {
  let testProjectPath: string;
  let testDocUri: vscode.Uri;

  suiteSetup(async function () {
    this.timeout(30000);

    // Get the test project path
    testProjectPath = path.resolve(__dirname, '../../../test/fixtures');
    testDocUri = vscode.Uri.file(path.join(testProjectPath, 'elaborations.soar'));

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

  test('Should find missing files referenced in project', async function () {
    this.timeout(10000);

    // Create a temporary project file that references a non-existent file
    const tempProjectPath = path.join(testProjectPath, 'temp-missing-test.vsa.json');
    const testProject = {
      name: 'Test Missing Files',
      topState: 'test-missing-agent',
      layout: {
        id: 'root',
        type: 'OPERATOR_ROOT',
        name: 'test-missing-agent',
        folder: 'test-missing-agent',
        children: [
          {
            id: 'elab-folder',
            type: 'FOLDER',
            name: 'elaborations',
            folder: 'elaborations',
            children: [
              {
                id: 'missing-file-node',
                type: 'FILE',
                name: 'missing-file',
                file: 'missing-file.soar',
              },
            ],
          },
        ],
      },
      datamap: { topState: 'test', vertices: [], edges: [] },
    };

    // Write temporary project file
    await fs.promises.writeFile(tempProjectPath, JSON.stringify(testProject, null, 2));

    try {
      // Get the project manager API
      const api = await TestHelper.activateExtension();
      const projectManager = api?.getProjectManager();

      // Create a minimal project context
      const ProjectSync = require('../../layout/projectSync').ProjectSync;

      // Build the layout index for the project context
      const layoutIndex = new Map();
      const buildIndex = (node: any) => {
        if (node.id) {
          layoutIndex.set(node.id, node);
        }
        if (node.children) {
          for (const child of node.children) {
            buildIndex(child);
          }
        }
      };
      const layout: any = testProject.layout;
      if (!layout.id) {
        layout.id = 'root';
      }
      buildIndex(layout);

      const projectContext = {
        projectFile: tempProjectPath,
        project: testProject,
        layoutIndex,
        datamapIndex: new Map(),
      };

      const missingFiles = await ProjectSync.findMissingFiles(projectContext);

      console.log(`Found ${missingFiles.length} missing file(s):`);
      missingFiles.forEach((f: any) => {
        console.log(`  - ${f.relativePath} (referenced in ${f.referencedIn})`);
      });

      // Should find at least the missing-file.soar
      assert.ok(missingFiles.length > 0, 'Should find missing files');

      const hasMissingFile = missingFiles.some((f: any) =>
        f.relativePath.includes('missing-file.soar')
      );
      assert.ok(hasMissingFile, 'Should detect missing-file.soar');
    } finally {
      // Clean up temporary project file
      try {
        await fs.promises.unlink(tempProjectPath);
      } catch (error) {
        console.log('Could not delete temp project file:', error);
      }
    }
  });

  test('Should not report missing files when all exist', async function () {
    this.timeout(10000);

    // Create a minimal project where all files actually exist
    const tempProjectPath = path.join(testProjectPath, 'temp-valid-test.vsa.json');

    // Create a temporary test file that actually exists
    const tempSoarFile = path.join(testProjectPath, 'temp-test-agent.soar');
    await fs.promises.writeFile(
      tempSoarFile,
      'sp {test*rule (state <s> ^type state) --> (<s> ^test true)}'
    );

    const testProject = {
      name: 'Test Valid Files',
      topState: 'temp-test-agent',
      layout: {
        type: 'FILE',
        file: 'temp-test-agent.soar',
      },
      datamap: { topState: 'test' },
    };

    // Write temporary project file
    await fs.promises.writeFile(tempProjectPath, JSON.stringify(testProject, null, 2));

    try {
      const ProjectSync = require('../../layout/projectSync').ProjectSync;

      const projectContext = {
        projectFile: tempProjectPath,
        project: testProject,
      };

      const missingFiles = await ProjectSync.findMissingFiles(projectContext);

      console.log(`Found ${missingFiles.length} missing file(s) in temp-valid-test project`);

      if (missingFiles.length > 0) {
        console.log('Missing files:');
        missingFiles.forEach((f: any) => {
          console.log(`  - ${f.relativePath} (referenced in ${f.referencedIn})`);
        });
      }

      // This project should have all its files present
      assert.strictEqual(missingFiles.length, 0, 'Valid project should not have missing files');
    } finally {
      // Clean up temporary files
      try {
        await fs.promises.unlink(tempProjectPath);
        await fs.promises.unlink(tempSoarFile);
      } catch (error) {
        console.log('Could not delete temp files:', error);
      }
    }
  });

  test('Should provide context about where files are referenced', async function () {
    this.timeout(10000);

    // Create a project with multiple missing files in different locations
    const tempProjectPath = path.join(testProjectPath, 'temp-context-test.vsa.json');
    const testProject = {
      name: 'Test Context',
      topState: 'test-context',
      layout: {
        id: 'root',
        type: 'OPERATOR_ROOT',
        name: 'test-context',
        folder: 'test-context',
        children: [
          {
            id: 'operators-folder',
            type: 'FOLDER',
            name: 'operators',
            folder: 'operators',
            children: [
              {
                id: 'missing-op-node',
                type: 'FILE',
                name: 'missing-operator',
                file: 'missing-operator.soar',
              },
            ],
          },
          {
            id: 'missing-elab-node',
            type: 'FILE',
            name: 'missing-elaboration',
            file: 'missing-elaboration.soar',
          },
        ],
      },
      datamap: { topState: 'test', vertices: [], edges: [] },
    };

    await fs.promises.writeFile(tempProjectPath, JSON.stringify(testProject, null, 2));

    try {
      const ProjectSync = require('../../layout/projectSync').ProjectSync;

      // Build the layout index
      const layoutIndex = new Map();
      const buildIndex = (node: any) => {
        if (node.id) {
          layoutIndex.set(node.id, node);
        }
        if (node.children) {
          for (const child of node.children) {
            buildIndex(child);
          }
        }
      };
      const layout: any = testProject.layout;
      if (!layout.id) {
        layout.id = 'root';
      }
      buildIndex(layout);

      const projectContext = {
        projectFile: tempProjectPath,
        project: testProject,
        layoutIndex,
        datamapIndex: new Map(),
      };

      const missingFiles = await ProjectSync.findMissingFiles(projectContext);

      console.log(`Found ${missingFiles.length} missing file(s) with context`);

      // Should find both missing files
      assert.ok(missingFiles.length >= 2, 'Should find multiple missing files');

      // Each file should have context information
      for (const file of missingFiles) {
        assert.ok(file.referencedIn, 'Should have referencedIn context');
        assert.ok(file.relativePath, 'Should have relativePath');
        console.log(`  ${file.relativePath} -> ${file.referencedIn}`);
      }
    } finally {
      try {
        await fs.promises.unlink(tempProjectPath);
      } catch (error) {
        console.log('Could not delete temp project file:', error);
      }
    }
  });
});
