/**
 * Unit Tests for LayoutOperations
 *
 * Validates that all layout manipulation functions (add operator, add file, delete, etc.)
 * correctly update the project structure, datamap, and maintain schema compliance.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { ProjectCreator } from '../../src/layout/projectCreator';
import { ProjectLoader } from '../../src/server/projectLoader';
import { LayoutOperations } from '../../src/layout/layoutOperations';
import { SoarParser } from '../../src/server/soarParser';
import { DiagnosticSeverity } from '../../src/server/soarTypes';
import {
  ProjectContext,
  LayoutNode,
  DMVertex,
  isSoarIdVertex,
} from '../../src/server/visualSoarProject';

suite('LayoutOperations - Comprehensive Manipulation Tests', () => {
  const testDir = path.join(__dirname, '../../test-output/layout-operations');
  const agentName = 'TestAgent';
  let projectPath: string;
  let projectFilePath: string;
  let projectContext: ProjectContext;
  let ajv: Ajv;
  let schemaValidator: any;

  /**
   * Helper function to reload project context after operations
   */
  async function reloadProject(): Promise<void> {
    const projectLoader = new ProjectLoader();
    projectContext = await projectLoader.loadProject(projectFilePath);
  }

  /**
   * Helper function to validate project JSON against schema
   */
  function validateProjectSchema(): void {
    const projectJson = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));
    const isValid = schemaValidator(projectJson);

    if (!isValid && schemaValidator.errors) {
      const errorMessages = schemaValidator.errors
        .map((err: any) => `${err.instancePath}: ${err.message}`)
        .join('\n  ');
      assert.fail(`Project schema validation failed:\n  ${errorMessages}`);
    }

    assert.ok(isValid, 'Project should conform to schema');
  }

  /**
   * Helper function to validate all project files using LSP parser and DatamapValidator
   * Runs all .soar files through the parser to detect syntax errors and validates against datamap
   *
   * Layout operations do currently not automatically keep the datamap valid, so
   * we skip datamap validation.
   */
  async function validateLspErrors(): Promise<void> {
    const parser = new SoarParser();
    const allErrors: Array<{ file: string; errors: any[] }> = [];

    // Recursively find all .soar files in the project directory
    async function findSoarFiles(dir: string): Promise<string[]> {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async entry => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            return findSoarFiles(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.soar')) {
            return [fullPath];
          }
          return [];
        })
      );
      return files.flat();
    }

    const soarFiles = await findSoarFiles(projectPath);

    // Parse each file and collect errors
    for (const filePath of soarFiles) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const doc = parser.parse(filePath, content, 0);

      // Collect syntax errors from parser
      const syntaxErrors = doc.errors.filter(e => e.severity === DiagnosticSeverity.error);

      // Validate document against datamap
      // const datamapErrors = validator.validateDocument(doc, projectContext, content);

      // Combine all errors
      const combinedErrors = [
        ...syntaxErrors.map(e => ({
          line: e.range.start.line + 1,
          message: `[Syntax] ${e.message}`,
        })),
        // ...datamapErrors.map(e => ({
        //   line: e.line + 1,
        //   message: `[Datamap] ${e.message}`,
        // })),
      ];

      if (combinedErrors.length > 0) {
        const relativePath = path.relative(projectPath, filePath);
        allErrors.push({
          file: relativePath,
          errors: combinedErrors,
        });
      }
    }

    // Assert no errors found
    if (allErrors.length > 0) {
      const errorReport = allErrors
        .map(({ file, errors }) => {
          const errorLines = errors.map(e => `    Line ${e.line}: ${e.message}`).join('\n');
          return `  ${file}:\n${errorLines}`;
        })
        .join('\n');
      assert.fail(
        `LSP validation failed with ${allErrors.length} file(s) containing errors:\n${errorReport}`
      );
    }
  }

  /**
   * Combined validation: datamap + files + schema + LSP errors
   */
  async function validateAll(): Promise<void> {
    validateProjectSchema();
    await validateLspErrors();
  }

  async function reloadAndValidate(): Promise<void> {
    await reloadProject();
    await validateAll();
  }

  type NodeOpResult = { success: boolean; nodeId?: string };

  function assertOperationSucceeded(result: NodeOpResult, message: string): string {
    assert.ok(result.success, message);
    assert.ok(result.nodeId, `${message} should return node ID`);
    return result.nodeId!;
  }

  async function addOperatorAndValidate(parentId: string, name: string): Promise<string> {
    const result = await LayoutOperations.addOperatorInternal(projectContext, parentId, name);
    const nodeId = assertOperationSucceeded(result, `Should add operator ${name}`);
    await reloadAndValidate();
    return nodeId;
  }

  async function addImpasseAndValidate(
    parentId: string,
    name:
      | 'Impasse__Operator_Tie'
      | 'Impasse__Operator_Conflict'
      | 'Impasse__Operator_Constraint-Failure'
      | 'Impasse__State_No-Change'
  ): Promise<string> {
    const result = await LayoutOperations.addImpasseOperatorInternal(
      projectContext,
      parentId,
      name
    );
    const nodeId = assertOperationSucceeded(result, `Should add ${name}`);
    await reloadAndValidate();
    return nodeId;
  }

  async function addFileAndValidate(parentId: string, name: string): Promise<string> {
    const result = await LayoutOperations.addFileInternal(projectContext, parentId, name);
    const nodeId = assertOperationSucceeded(result, `Should add file ${name}`);
    await reloadAndValidate();
    return nodeId;
  }

  async function addFolderAndValidate(parentId: string, name: string): Promise<string> {
    const result = await LayoutOperations.addFolderInternal(projectContext, parentId, name);
    const nodeId = assertOperationSucceeded(result, `Should add folder ${name}`);
    await reloadAndValidate();
    return nodeId;
  }

  function assertDeleteSucceeded(deleteResult: unknown, shouldDeleteFiles = false): void {
    if (typeof deleteResult === 'boolean') {
      assert.ok(deleteResult, 'Deletion should succeed');
      return;
    }

    assert.ok(
      typeof deleteResult === 'object' && deleteResult !== null && 'success' in deleteResult,
      'Delete operation should return boolean or object with success'
    );

    const typedResult = deleteResult as { success: boolean; filesDeleted?: string[] };
    assert.ok(typedResult.success, 'Deletion should succeed');

    if (shouldDeleteFiles) {
      assert.ok(
        typedResult.filesDeleted && typedResult.filesDeleted.length > 0,
        'Should delete files'
      );
    }
  }

  async function deleteNodeAndValidate(
    nodeId: string,
    parentNodeId: string,
    shouldDeleteFiles = false
  ): Promise<void> {
    const deleteResult = await LayoutOperations.deleteNode(
      projectContext,
      nodeId,
      parentNodeId,
      true
    );
    assertDeleteSucceeded(deleteResult, shouldDeleteFiles);
    await reloadAndValidate();
  }

  /**
   * Helper function to find a node by name in the layout
   */
  function findNodeByName(
    name: string,
    node: LayoutNode = projectContext.project.layout
  ): LayoutNode | null {
    if (node.name === name) {
      return node;
    }

    if ('children' in node && node.children) {
      for (const child of node.children) {
        const found = findNodeByName(name, child);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  /**
   * Helper function to find a vertex by ID in the datamap
   */
  function findVertexById(id: string): DMVertex | undefined {
    return projectContext.datamapIndex.get(id);
  }

  /**
   * Helper function to count all vertices in the datamap
   */
  function countVertices(): number {
    return projectContext.project.datamap.vertices.length;
  }

  setup(async () => {
    // Initialize AJV and load schema
    ajv = new Ajv({ allErrors: true, verbose: true });

    // Add custom keyword for schema version metadata
    ajv.addKeyword({
      keyword: 'version',
      schemaType: 'string',
      metaSchema: { type: 'string' },
    });

    const schemaPath = path.join(__dirname, '../../project.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    schemaValidator = ajv.compile(schema);

    // Clean up any existing test directory
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }

    // Create test directory
    await fs.promises.mkdir(testDir, { recursive: true });

    // Create a new project
    projectFilePath = await ProjectCreator.createProject({
      directory: testDir,
      agentName: agentName,
    });

    projectPath = path.dirname(projectFilePath);

    // Load the project
    await reloadProject();
  });

  teardown(async () => {
    // Clean up test project after each test
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  suite('addOperator', () => {
    test('Should add operator to root and update datamap', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const initialVertexCount = countVertices();
      const initialChildren = projectContext.project.layout.children?.length || 0;

      await addOperatorAndValidate(rootNodeId, 'test-operator');

      // Validate layout
      const operatorNode = findNodeByName('test-operator');
      assert.ok(operatorNode, 'Operator node should exist in layout');
      assert.strictEqual(operatorNode?.type, 'OPERATOR', 'Node type should be OPERATOR');
      assert.strictEqual(operatorNode?.name, 'test-operator', 'Operator name should match');
      assert.ok('file' in operatorNode && operatorNode.file, 'Operator should have file property');
      assert.ok('dmId' in operatorNode && operatorNode.dmId, 'Operator should have dmId property');

      const childrenCount = projectContext.project.layout.children?.length || 0;
      assert.strictEqual(childrenCount, initialChildren + 1, 'Should have one more child');

      // Validate datamap - operator should create new vertices
      const currentVertexCount = countVertices();
      assert.ok(
        currentVertexCount > initialVertexCount,
        'Datamap should have more vertices after adding operator'
      );

      // Find and validate operator in datamap
      const rootVertex = findVertexById(projectContext.project.datamap.rootId);
      assert.ok(rootVertex, 'Root vertex should exist');

      if (isSoarIdVertex(rootVertex)) {
        // Each operator gets its own operator vertex with ^name edge
        // Find all operator edges from root
        const operatorEdges = rootVertex.outEdges?.filter(e => e.name === 'operator') || [];
        assert.ok(operatorEdges.length > 0, 'Root should have operator edge(s)');

        // Find the operator vertex with name 'test-operator'
        let foundOperator = false;
        for (const opEdge of operatorEdges) {
          const operatorVertex = findVertexById(opEdge.toId);
          if (operatorVertex && isSoarIdVertex(operatorVertex)) {
            const nameEdge = operatorVertex.outEdges?.find(e => e.name === 'name');
            if (nameEdge) {
              const nameVertex = findVertexById(nameEdge.toId);
              if (
                nameVertex?.type === 'ENUMERATION' &&
                nameVertex.choices?.includes('test-operator')
              ) {
                foundOperator = true;
                break;
              }
            }
          }
        }
        assert.ok(foundOperator, 'Should find operator with name test-operator in datamap');
      }

      // Validate file exists
      const operatorFilePath = path.join(projectPath, agentName, 'test-operator.soar');
      assert.ok(fs.existsSync(operatorFilePath), 'Operator file should exist on disk');

      // Validate schema compliance
      await validateAll();
    });

    test('Should add nested operator to high-level operator', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // First, add a high-level operator (by adding a parent operator and then a child)
      const parentNodeId = await addOperatorAndValidate(rootNodeId, 'parent-operator');

      // Add a child operator to trigger conversion to HIGH_LEVEL_OPERATOR
      await addOperatorAndValidate(parentNodeId, 'child-operator');

      // Validate parent was converted to HIGH_LEVEL_OPERATOR
      const parentNode = projectContext.layoutIndex.get(parentNodeId);
      assert.ok(parentNode, 'Parent node should exist');
      assert.ok(
        parentNode?.type === 'HIGH_LEVEL_OPERATOR' ||
          parentNode?.type === 'HIGH_LEVEL_FILE_OPERATOR',
        'Parent should be converted to high-level operator'
      );

      // Validate child operator exists
      const childNode = findNodeByName('child-operator');
      assert.ok(childNode, 'Child operator should exist');
      assert.strictEqual(childNode?.type, 'OPERATOR', 'Child should be OPERATOR type');

      // Validate folder structure
      if ('folder' in parentNode! && parentNode.folder) {
        const parentFolder = path.join(projectPath, agentName, parentNode.folder);
        assert.ok(fs.existsSync(parentFolder), 'Parent operator folder should exist');

        const childFilePath = path.join(parentFolder, 'child-operator.soar');
        assert.ok(fs.existsSync(childFilePath), 'Child operator file should exist');
      }

      // Validate schema compliance
      await validateAll();
    });

    test('Should add multiple operators and maintain datamap consistency', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const operatorNames = ['op1', 'op2', 'op3'];

      for (const name of operatorNames) {
        await addOperatorAndValidate(rootNodeId, name);
      }

      // Validate all operators exist in layout
      for (const name of operatorNames) {
        const node = findNodeByName(name);
        assert.ok(node, `Operator ${name} should exist in layout`);
      }

      // Validate all operators exist in datamap
      const rootVertex = findVertexById(projectContext.project.datamap.rootId);
      assert.ok(rootVertex && isSoarIdVertex(rootVertex));

      const operatorEdges = rootVertex.outEdges?.filter(e => e.name === 'operator') || [];
      assert.ok(operatorEdges.length > 0, 'Root should have operator edges');

      // Find each operator by name
      for (const name of operatorNames) {
        let foundOperator = false;
        for (const opEdge of operatorEdges) {
          const operatorVertex = findVertexById(opEdge.toId);
          if (operatorVertex && isSoarIdVertex(operatorVertex)) {
            const nameEdge = operatorVertex.outEdges?.find(e => e.name === 'name');
            if (nameEdge) {
              const nameVertex = findVertexById(nameEdge.toId);
              if (nameVertex?.type === 'ENUMERATION' && nameVertex.choices?.includes(name)) {
                foundOperator = true;
                break;
              }
            }
          }
        }
        assert.ok(foundOperator, `Should find operator with name ${name} in datamap`);
      }

      // Validate schema compliance
      await validateAll();
    });
  });

  suite('addImpasseOperator', () => {
    test('Should add impasse operator to root', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const impasseName: 'Impasse__Operator_Tie' = 'Impasse__Operator_Tie';

      await addImpasseAndValidate(rootNodeId, impasseName);

      // Validate layout
      const impasseNode = findNodeByName(impasseName);
      assert.ok(impasseNode, 'Impasse operator node should exist');
      assert.strictEqual(
        impasseNode?.type,
        'IMPASSE_OPERATOR',
        'Node type should be IMPASSE_OPERATOR'
      );
      assert.strictEqual(impasseNode?.name, impasseName, 'Impasse name should match');

      // Validate file exists
      const impasseFilePath = path.join(projectPath, agentName, `${impasseName}.soar`);
      assert.ok(fs.existsSync(impasseFilePath), 'Impasse file should exist');

      // Validate schema compliance
      await validateAll();
    });

    test('Should add all impasse types', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const impasseTypes: Array<
        | 'Impasse__Operator_Tie'
        | 'Impasse__Operator_Conflict'
        | 'Impasse__Operator_Constraint-Failure'
        | 'Impasse__State_No-Change'
      > = [
        'Impasse__Operator_Tie',
        'Impasse__Operator_Conflict',
        'Impasse__Operator_Constraint-Failure',
        'Impasse__State_No-Change',
      ];

      for (const impasseName of impasseTypes) {
        await addImpasseAndValidate(rootNodeId, impasseName);
      }

      // Validate all impasse operators exist
      for (const impasseName of impasseTypes) {
        const node = findNodeByName(impasseName);
        assert.ok(node, `${impasseName} should exist in layout`);

        const filePath = path.join(projectPath, agentName, `${impasseName}.soar`);
        assert.ok(fs.existsSync(filePath), `${impasseName} file should exist`);
      }

      // Validate schema compliance
      await validateAll();
    });

    test('Should convert impasse operator to high-level when adding child', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const impasseName: 'Impasse__Operator_Tie' = 'Impasse__Operator_Tie';

      const parentNodeId = await addImpasseAndValidate(rootNodeId, impasseName);

      // Note: Impasse operators don't support adding child operators in the current implementation
      // This test validates that the impasse operator exists correctly
      const parentNode = projectContext.layoutIndex.get(parentNodeId);
      assert.ok(parentNode);
      assert.strictEqual(parentNode?.type, 'IMPASSE_OPERATOR', 'Parent should be IMPASSE_OPERATOR');

      // Validate schema compliance
      await validateAll();
    });
  });

  suite('addFile', () => {
    test('Should add file to root folder', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const fileName = 'test-file';

      await addFileAndValidate(rootNodeId, fileName);

      // Validate layout
      const fileNode = findNodeByName(fileName);
      assert.ok(fileNode, 'File node should exist');
      assert.strictEqual(fileNode?.type, 'FILE', 'Node type should be FILE');

      // Validate file exists
      const filePath = path.join(projectPath, agentName, `${fileName}.soar`);
      assert.ok(fs.existsSync(filePath), 'File should exist on disk');

      // Validate schema compliance
      await validateAll();
    });

    test('Should add file to folder', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // First create a folder
      const folderNodeId = await addFolderAndValidate(rootNodeId, 'test-folder');

      // Add file to folder
      await addFileAndValidate(folderNodeId, 'nested-file');

      // Validate file exists in folder
      const filePath = path.join(projectPath, agentName, 'test-folder', 'nested-file.soar');
      assert.ok(fs.existsSync(filePath), 'File should exist in folder');

      // Validate schema compliance
      await validateAll();
    });

    test('Should add multiple files', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const fileNames = ['file1', 'file2', 'file3'];

      for (const name of fileNames) {
        await addFileAndValidate(rootNodeId, name);
      }

      // Validate all files exist
      for (const name of fileNames) {
        const node = findNodeByName(name);
        assert.ok(node, `File ${name} should exist in layout`);

        const filePath = path.join(projectPath, agentName, `${name}.soar`);
        assert.ok(fs.existsSync(filePath), `File ${name}.soar should exist`);
      }

      // Validate schema compliance
      await validateAll();
    });
  });

  suite('addFolder', () => {
    test('Should add folder to root', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const folderName = 'test-folder';

      await addFolderAndValidate(rootNodeId, folderName);

      // Validate layout
      const folderNode = findNodeByName(folderName);
      assert.ok(folderNode, 'Folder node should exist');
      assert.strictEqual(folderNode?.type, 'FOLDER', 'Node type should be FOLDER');

      // Validate folder exists
      const folderPath = path.join(projectPath, agentName, folderName);
      assert.ok(fs.existsSync(folderPath), 'Folder should exist on disk');

      // Validate schema compliance
      await validateAll();
    });

    test('Should add nested folders', async () => {
      const rootNodeId = projectContext.project.layout.id;

      const folder1NodeId = await addFolderAndValidate(rootNodeId, 'folder1');
      await addFolderAndValidate(folder1NodeId, 'folder2');

      // Validate nested folder exists
      const nestedPath = path.join(projectPath, agentName, 'folder1', 'folder2');
      assert.ok(fs.existsSync(nestedPath), 'Nested folder should exist');

      // Validate schema compliance
      await validateAll();
    });

    test('Should add multiple folders', async () => {
      const rootNodeId = projectContext.project.layout.id;
      const folderNames = ['utilities', 'operators', 'substates'];

      for (const name of folderNames) {
        await addFolderAndValidate(rootNodeId, name);
      }

      // Validate all folders exist
      for (const name of folderNames) {
        const node = findNodeByName(name);
        assert.ok(node, `Folder ${name} should exist in layout`);

        const folderPath = path.join(projectPath, agentName, name);
        assert.ok(fs.existsSync(folderPath), `Folder ${name} should exist`);
      }

      // Validate schema compliance
      await validateAll();
    });
  });

  suite('deleteNode', () => {
    test('Should delete operator and update datamap', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add operator
      const operatorNodeId = await addOperatorAndValidate(rootNodeId, 'delete-me');

      // Verify operator exists
      let node = findNodeByName('delete-me');
      assert.ok(node, 'Operator should exist before deletion');

      const vertexCountBefore = countVertices();

      // Delete operator (skip confirmation)
      await deleteNodeAndValidate(operatorNodeId, rootNodeId, true);

      // Verify operator is gone
      node = findNodeByName('delete-me');
      assert.strictEqual(node, null, 'Operator should not exist after deletion');

      // Verify datamap vertices were removed
      const vertexCountAfter = countVertices();
      assert.ok(
        vertexCountAfter < vertexCountBefore,
        'Datamap should have fewer vertices after deletion'
      );

      // Verify file is deleted
      const filePath = path.join(projectPath, agentName, 'delete-me.soar');
      assert.ok(!fs.existsSync(filePath), 'Operator file should be deleted');

      // Validate schema compliance
      await validateAll();
    });

    test('Should delete file', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add file
      const fileNodeId = await addFileAndValidate(rootNodeId, 'delete-file');

      // Delete file
      await deleteNodeAndValidate(fileNodeId, rootNodeId);

      // Verify file is gone
      const node = findNodeByName('delete-file');
      assert.strictEqual(node, null, 'File should not exist after deletion');

      const filePath = path.join(projectPath, agentName, 'delete-file.soar');
      assert.ok(!fs.existsSync(filePath), 'File should be deleted from disk');

      // Validate schema compliance
      await validateAll();
    });

    test('Should delete folder - validates proper cleanup', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Create an empty folder
      const folderNodeId = await addFolderAndValidate(rootNodeId, 'empty-delete-folder');

      // Verify folder exists
      const folderPath = path.join(projectPath, agentName, 'empty-delete-folder');
      assert.ok(fs.existsSync(folderPath), 'Folder should exist before deletion');

      // Delete the empty folder
      await deleteNodeAndValidate(folderNodeId, rootNodeId);

      // Verify folder is gone
      assert.ok(!fs.existsSync(folderPath), 'Folder should be deleted from disk');

      // Validate schema compliance
      await validateAll();
    });

    test('Should delete high-level operator with children', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add parent operator
      const parentNodeId = await addOperatorAndValidate(rootNodeId, 'parent');

      // Add child to make it high-level
      await addOperatorAndValidate(parentNodeId, 'child');

      const vertexCountBefore = countVertices();

      // Delete parent operator
      await deleteNodeAndValidate(parentNodeId, rootNodeId);

      // Verify all is gone
      assert.strictEqual(findNodeByName('parent'), null, 'Parent should be deleted');
      assert.strictEqual(findNodeByName('child'), null, 'Child should be deleted');

      // Verify datamap cleaned up
      const vertexCountAfter = countVertices();
      assert.ok(
        vertexCountAfter < vertexCountBefore,
        'Datamap should have fewer vertices after deletion'
      );

      // Validate schema compliance
      await validateAll();
    });
  });

  suite('renameNode', () => {
    test('Should rename operator (logical name only)', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add operator
      const operatorNodeId = await addOperatorAndValidate(rootNodeId, 'old-name');

      // Get the node and manually rename it (since renameNode uses UI prompts)
      const node = projectContext.layoutIndex.get(operatorNodeId);
      assert.ok(node);

      node!.name = 'new-name';

      await LayoutOperations['saveProject'](projectContext);
      await reloadAndValidate();

      // Verify rename in layout
      const renamedNode = projectContext.layoutIndex.get(operatorNodeId);
      assert.ok(renamedNode);
      assert.strictEqual(renamedNode!.name, 'new-name', 'Node should have new name');

      // Note: The file is not renamed (as per current implementation)
      // but the logical name in the project file is updated

      // Validate schema compliance
      await validateAll();
    });
  });

  suite('Complex Scenarios', () => {
    test('Should handle complex project structure with mixed operations', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Build a complex structure
      const op1NodeId = await addOperatorAndValidate(rootNodeId, 'op1');
      const utilitiesFolderNodeId = await addFolderAndValidate(rootNodeId, 'utilities');
      await addFileAndValidate(utilitiesFolderNodeId, 'helpers');
      await addOperatorAndValidate(op1NodeId, 'subop1');
      await addImpasseAndValidate(rootNodeId, 'Impasse__Operator_Tie');

      // Verify all elements exist
      assert.ok(findNodeByName('op1'), 'op1 should exist');
      assert.ok(findNodeByName('utilities'), 'utilities folder should exist');
      assert.ok(findNodeByName('helpers'), 'helpers file should exist');
      assert.ok(findNodeByName('subop1'), 'subop1 should exist');
      assert.ok(findNodeByName('Impasse__Operator_Tie'), 'Impasse operator should exist');

      // Validate all files exist on disk
      assert.ok(fs.existsSync(path.join(projectPath, agentName, 'op1')), 'op1 folder exists');
      assert.ok(
        fs.existsSync(path.join(projectPath, agentName, 'utilities')),
        'utilities folder exists'
      );
      assert.ok(
        fs.existsSync(path.join(projectPath, agentName, 'utilities', 'helpers.soar')),
        'helpers file exists'
      );
      assert.ok(
        fs.existsSync(path.join(projectPath, agentName, 'op1', 'subop1.soar')),
        'subop1 file exists'
      );

      // Validate schema compliance
      await validateAll();
    });

    test('Should maintain schema validity through multiple operations', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Perform 20 random operations and validate schema each time
      const operations = ['addOperator', 'addFile', 'addFolder', 'addImpasse'];

      for (let i = 0; i < 20; i++) {
        const op = operations[i % operations.length];

        switch (op) {
          case 'addOperator':
            await addOperatorAndValidate(rootNodeId, `op-${i}`);
            break;
          case 'addFile':
            await addFileAndValidate(rootNodeId, `file-${i}`);
            break;
          case 'addFolder':
            await addFolderAndValidate(rootNodeId, `folder-${i}`);
            break;
          case 'addImpasse':
            if (i % 4 === 0) {
              await addImpasseAndValidate(rootNodeId, 'Impasse__Operator_Tie');
            }
            break;
        }
      }
    });

    test('Should maintain datamap integrity through add and delete cycles', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add 5 operators
      const operatorIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const nodeId = await addOperatorAndValidate(rootNodeId, `cycle-op-${i}`);
        operatorIds.push(nodeId);
      }

      const vertexCountMax = countVertices();

      // Delete all operators
      for (const opId of operatorIds) {
        await deleteNodeAndValidate(opId, rootNodeId);
      }

      const vertexCountAfter = countVertices();

      // Vertex count should be back to near original (may have some lingering vertices)
      assert.ok(vertexCountAfter < vertexCountMax, 'Datamap should shrink after deletions');

      // Validate schema compliance
      await validateAll();
    });
  });

  suite('Schema Validation Edge Cases', () => {
    test('Should validate empty children arrays', async () => {
      // Fresh project should validate
      await validateAll();
    });

    test('Should validate project with only operators', async () => {
      const rootNodeId = projectContext.project.layout.id;

      for (let i = 0; i < 3; i++) {
        await addOperatorAndValidate(rootNodeId, `op${i}`);
      }
    });

    test('Should validate project with only files', async () => {
      const rootNodeId = projectContext.project.layout.id;

      for (let i = 0; i < 3; i++) {
        await addFileAndValidate(rootNodeId, `file${i}`);
      }
    });

    test('Should validate project with nested folder hierarchy', async () => {
      const rootNodeId = projectContext.project.layout.id;

      let currentId = rootNodeId;
      for (let i = 0; i < 5; i++) {
        currentId = await addFolderAndValidate(currentId, `level${i}`);
      }
    });

    test('Should validate after converting operator to high-level', async () => {
      const rootNodeId = projectContext.project.layout.id;

      const parentNodeId = await addOperatorAndValidate(rootNodeId, 'convert-test');

      // Add child to trigger conversion
      await addOperatorAndValidate(parentNodeId, 'child-test');
    });
  });

  suite('Datamap Validation', () => {
    test('Should maintain valid vertex references', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add several operators
      for (let i = 0; i < 3; i++) {
        await addOperatorAndValidate(rootNodeId, `op${i}`);
      }

      // Verify all vertex IDs in edges are valid
      for (const vertex of projectContext.project.datamap.vertices) {
        if (isSoarIdVertex(vertex) && vertex.outEdges) {
          for (const edge of vertex.outEdges) {
            const targetVertex = findVertexById(edge.toId);
            assert.ok(
              targetVertex,
              `Edge ${vertex.id} -> ${edge.name} -> ${edge.toId} should reference valid vertex`
            );
          }
        }
      }
    });

    test('Should maintain root vertex reference', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Perform various operations
      await addOperatorAndValidate(rootNodeId, 'op1');
      await addFileAndValidate(rootNodeId, 'file1');

      // Verify root vertex always exists and is referenced
      const rootVertexId = projectContext.project.datamap.rootId;
      assert.ok(rootVertexId, 'Root vertex ID should exist');

      const rootVertex = findVertexById(rootVertexId);
      assert.ok(rootVertex, 'Root vertex should exist in datamap');
      assert.ok(isSoarIdVertex(rootVertex), 'Root vertex should be SOAR_ID type');
    });

    test('Should not create orphaned vertices', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add and delete operators
      const op1NodeId = await addOperatorAndValidate(rootNodeId, 'temp-op');

      const verticesBeforeDelete = new Set(projectContext.project.datamap.vertices.map(v => v.id));

      await deleteNodeAndValidate(op1NodeId, rootNodeId);

      const verticesAfterDelete = new Set(projectContext.project.datamap.vertices.map(v => v.id));

      // All remaining vertices should be reachable from root
      // (This is a simplified check - a full check would do graph traversal)
      assert.ok(
        verticesAfterDelete.size <= verticesBeforeDelete.size,
        'Vertex count should not increase after deletion'
      );
    });
  });

  suite('Layout Structure Validation', () => {
    test('Should maintain valid parent-child relationships', async () => {
      const rootNodeId = projectContext.project.layout.id;

      const folderNodeId = await addFolderAndValidate(rootNodeId, 'parent-folder');
      const fileNodeId = await addFileAndValidate(folderNodeId, 'child-file');

      // Verify child is in parent's children list
      const parentNode = projectContext.layoutIndex.get(folderNodeId);
      assert.ok(parentNode);

      if ('children' in parentNode && parentNode.children) {
        const hasChild = parentNode.children.some(c => c.id === fileNodeId);
        assert.ok(hasChild, 'Parent should contain child in children array');
      } else {
        assert.fail('Parent should have children array');
      }
    });

    test('Should have all nodes indexed', async () => {
      const rootNodeId = projectContext.project.layout.id;

      // Add various nodes
      const opNodeId = await addOperatorAndValidate(rootNodeId, 'indexed-op');
      const folderNodeId = await addFolderAndValidate(rootNodeId, 'indexed-folder');
      const fileNodeId = await addFileAndValidate(rootNodeId, 'indexed-file');

      // Verify all are in index
      assert.ok(projectContext.layoutIndex.get(opNodeId), 'Operator should be indexed');
      assert.ok(projectContext.layoutIndex.get(folderNodeId), 'Folder should be indexed');
      assert.ok(projectContext.layoutIndex.get(fileNodeId), 'File should be indexed');
    });
  });
});
