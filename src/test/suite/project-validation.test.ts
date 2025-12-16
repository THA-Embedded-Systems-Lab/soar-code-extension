import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectLoader } from '../../server/projectLoader';
import { ProjectValidationError } from '../../server/visualSoarProject';

suite('Project Validation Test Suite', () => {
  let projectLoader: ProjectLoader;

  suiteSetup(() => {
    projectLoader = new ProjectLoader();
  });

  test('Valid project should pass validation', async () => {
    const projectPath = path.resolve(
      __dirname,
      '../../../test/water-jug-simple/water-jug.vsa.json'
    );

    const projectContext = await projectLoader.loadProject(projectPath);

    assert.ok(projectContext, 'Project should load successfully');
    assert.strictEqual(
      projectContext.validationErrors?.length || 0,
      0,
      'Valid project should have no validation errors'
    );
  });

  test('Project with invalid enumeration should fail validation', async () => {
    // Create a temporary invalid project
    const tempDir = path.resolve(__dirname, '../../../test/fixtures');
    const tempProjectPath = path.join(tempDir, 'test-invalid-enum.vsa.json');

    const invalidProject = {
      version: '6',
      datamap: {
        rootId: 'root-vertex',
        vertices: [
          {
            id: 'root-vertex',
            type: 'SOAR_ID',
            outEdges: [
              {
                name: 'operator',
                toId: 'operator-vertex',
              },
            ],
          },
          {
            id: 'operator-vertex',
            type: 'ENUMERATION',
            choices: 'should-be-array-not-string', // Invalid: should be array
          },
        ],
      },
      layout: {
        type: 'OPERATOR_ROOT',
        id: 'root-layout',
        name: 'Test Agent',
        folder: 'Test-Agent',
        children: [],
      },
    };

    await fs.promises.writeFile(tempProjectPath, JSON.stringify(invalidProject, null, 2));

    try {
      const projectContext = await projectLoader.loadProject(tempProjectPath);

      assert.ok(projectContext.validationErrors, 'Should have validation errors');
      assert.ok(
        projectContext.validationErrors!.length > 0,
        'Invalid project should have validation errors'
      );

      // Check that the error mentions the choices field
      const hasChoicesError = projectContext.validationErrors!.some(
        (err: ProjectValidationError) =>
          err.path.includes('choices') || err.message.includes('array')
      );
      assert.ok(hasChoicesError, 'Should have error related to choices field');
    } finally {
      // Clean up
      await fs.promises.unlink(tempProjectPath).catch(() => {});
    }
  });

  test('Project with missing required field should fail validation', async () => {
    const tempDir = path.resolve(__dirname, '../../../test/fixtures');
    const tempProjectPath = path.join(tempDir, 'test-missing-field.vsa.json');

    const invalidProject = {
      version: '6',
      datamap: {
        rootId: 'root-vertex',
        vertices: [
          {
            id: 'root-vertex',
            type: 'SOAR_ID',
            // outEdges is optional, so let's test with missing 'id' in a vertex
          },
          {
            // Missing 'id' field - required
            type: 'ENUMERATION',
            choices: ['value1', 'value2'],
          },
        ],
      },
      layout: {
        type: 'OPERATOR_ROOT',
        id: 'root-layout',
        name: 'Test Agent',
        folder: 'Test-Agent',
        children: [],
      },
    };

    await fs.promises.writeFile(tempProjectPath, JSON.stringify(invalidProject, null, 2));

    try {
      const projectContext = await projectLoader.loadProject(tempProjectPath);

      assert.ok(projectContext.validationErrors, 'Should have validation errors');
      assert.ok(
        projectContext.validationErrors!.length > 0,
        'Project with missing required field should have validation errors'
      );

      // Check that there's an error about missing 'id'
      const hasMissingIdError = projectContext.validationErrors!.some(
        (err: ProjectValidationError) =>
          err.message.includes('id') || err.message.includes('required')
      );
      assert.ok(hasMissingIdError, 'Should have error about missing required field');
    } finally {
      // Clean up
      await fs.promises.unlink(tempProjectPath).catch(() => {});
    }
  });

  test('Project with invalid vertex type should fail validation', async () => {
    const tempDir = path.resolve(__dirname, '../../../test/fixtures');
    const tempProjectPath = path.join(tempDir, 'test-invalid-type.vsa.json');

    const invalidProject = {
      version: '6',
      datamap: {
        rootId: 'root-vertex',
        vertices: [
          {
            id: 'root-vertex',
            type: 'INVALID_TYPE', // Invalid type
          },
        ],
      },
      layout: {
        type: 'OPERATOR_ROOT',
        id: 'root-layout',
        name: 'Test Agent',
        folder: 'Test-Agent',
        children: [],
      },
    };

    await fs.promises.writeFile(tempProjectPath, JSON.stringify(invalidProject, null, 2));

    try {
      const projectContext = await projectLoader.loadProject(tempProjectPath);

      assert.ok(projectContext.validationErrors, 'Should have validation errors');
      assert.ok(
        projectContext.validationErrors!.length > 0,
        'Project with invalid type should have validation errors'
      );
    } finally {
      // Clean up
      await fs.promises.unlink(tempProjectPath).catch(() => {});
    }
  });

  test('All existing test projects should pass validation', async () => {
    const testProjects = [
      'test/water-jug-simple/water-jug.vsa.json',
      'test/fixtures/test-project.vsa.json',
      'test/VisualSoar-Project-Scaffold/New-Agent.vsa.json',
      'test/Substate-operator-project/substate-operator-agent.vsa.json',
      'test/BW-Hierarchical/BW-Hierarchical.vsa.json',
    ];

    for (const projectRelPath of testProjects) {
      const projectPath = path.resolve(__dirname, '../../../', projectRelPath);

      const projectContext = await projectLoader.loadProject(projectPath);

      assert.strictEqual(
        projectContext.validationErrors?.length || 0,
        0,
        `${path.basename(projectRelPath)} should have no validation errors`
      );
    }
  });
});
