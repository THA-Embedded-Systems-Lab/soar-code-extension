/**
 * Unit Tests for ProjectCreator
 *
 * Validates that new Soar projects are created with correct structure,
 * datamap, and file scaffolding matching VisualSoar behavior.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectCreator } from '../../src/layout/projectCreator';

suite('ProjectCreator', () => {
  const testDir = path.join(__dirname, '../../test-output');
  const agentName = 'TestAgent';
  let projectPath: string;
  let projectFilePath: string;

  setup(async () => {
    // Ensure test directory exists
    await fs.promises.mkdir(testDir, { recursive: true });
    projectPath = path.join(testDir, agentName);
  });

  teardown(async () => {
    // Clean up test project after each test
    if (fs.existsSync(projectPath)) {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    }
  });

  test('Should create project with correct directory structure', async () => {
    projectFilePath = await ProjectCreator.createProject({
      directory: testDir,
      agentName: agentName,
    });

    // Verify main project files
    assert.ok(fs.existsSync(projectFilePath), 'Project JSON file should exist');
    assert.ok(
      fs.existsSync(path.join(projectPath, `${agentName}.soar`)),
      'Main .soar file should exist'
    );

    // Verify agent folder structure
    const agentFolder = path.join(projectPath, agentName);
    assert.ok(fs.existsSync(agentFolder), 'Agent folder should exist');
    assert.ok(
      fs.existsSync(path.join(agentFolder, '_firstload.soar')),
      '_firstload.soar should exist'
    );
    assert.ok(
      fs.existsSync(path.join(agentFolder, `${agentName}_source.soar`)),
      'Agent source file should exist'
    );
    assert.ok(
      fs.existsSync(path.join(agentFolder, `initialize-${agentName}.soar`)),
      'Initialize file should exist'
    );

    // Verify elaborations folder
    const elaborationsFolder = path.join(agentFolder, 'elaborations');
    assert.ok(fs.existsSync(elaborationsFolder), 'Elaborations folder should exist');
    assert.ok(
      fs.existsSync(path.join(elaborationsFolder, '_all.soar')),
      'Elaborations _all.soar should exist'
    );
    assert.ok(
      fs.existsSync(path.join(elaborationsFolder, 'top-state.soar')),
      'top-state.soar should exist'
    );
    assert.ok(
      fs.existsSync(path.join(elaborationsFolder, 'elaborations_source.soar')),
      'elaborations_source.soar should exist'
    );

    // Verify all folder
    const allFolder = path.join(agentFolder, 'all');
    assert.ok(fs.existsSync(allFolder), 'All folder should exist');
    assert.ok(
      fs.existsSync(path.join(allFolder, 'all_source.soar')),
      'all_source.soar should exist'
    );
  });

  test('Should create project JSON with correct structure', async () => {
    projectFilePath = await ProjectCreator.createProject({
      directory: testDir,
      agentName: agentName,
    });

    const projectJson = JSON.parse(await fs.promises.readFile(projectFilePath, 'utf-8'));

    // Verify version
    assert.strictEqual(projectJson.version, '6', 'Version should be 6');

    // Verify datamap structure
    assert.ok(projectJson.datamap, 'Datamap should exist');
    assert.ok(projectJson.datamap.rootId, 'Datamap rootId should exist');
    assert.ok(Array.isArray(projectJson.datamap.vertices), 'Datamap vertices should be an array');

    // Verify layout structure
    assert.ok(projectJson.layout, 'Layout should exist');
    assert.strictEqual(projectJson.layout.name, agentName, 'Layout name should match agent name');
    assert.strictEqual(
      projectJson.layout.type,
      'OPERATOR_ROOT',
      'Layout type should be OPERATOR_ROOT'
    );
    assert.strictEqual(
      projectJson.layout.folder,
      agentName,
      'Layout folder should match agent name'
    );
    assert.ok(Array.isArray(projectJson.layout.children), 'Layout children should be an array');
  });

  test('Should create datamap with correct root state structure', async () => {
    projectFilePath = await ProjectCreator.createProject({
      directory: testDir,
      agentName: agentName,
    });

    const projectJson = JSON.parse(await fs.promises.readFile(projectFilePath, 'utf-8'));
    const rootVertex = projectJson.datamap.vertices.find(
      (v: any) => v.id === projectJson.datamap.rootId
    );

    assert.ok(rootVertex, 'Root vertex should exist');

    // Verify standard Soar state attributes
    const expectedAttributes = [
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

    for (const attr of expectedAttributes) {
      const hasAttr = rootVertex.outEdges?.some((e: any) => e.name === attr);
      assert.ok(hasAttr, `Root state should have ^${attr} attribute`);
    }
  });

  test('Should reject empty agent name', async () => {
    await assert.rejects(
      async () => {
        await ProjectCreator.createProject({
          directory: testDir,
          agentName: '',
        });
      },
      { message: 'Agent name cannot be empty' },
      'Should throw error for empty agent name'
    );
  });

  test('Should reject non-existent directory', async () => {
    const nonExistentDir = path.join(testDir, 'non-existent-dir-xyz123');

    await assert.rejects(
      async () => {
        await ProjectCreator.createProject({
          directory: nonExistentDir,
          agentName: agentName,
        });
      },
      { message: 'Directory does not exist' },
      'Should throw error for non-existent directory'
    );
  });

  test('Should reject creating duplicate project', async () => {
    // Create project first time
    await ProjectCreator.createProject({
      directory: testDir,
      agentName: agentName,
    });

    // Attempt to create again should fail
    await assert.rejects(
      async () => {
        await ProjectCreator.createProject({
          directory: testDir,
          agentName: agentName,
        });
      },
      /Project already exists/,
      'Should throw error when project already exists'
    );
  });
});
