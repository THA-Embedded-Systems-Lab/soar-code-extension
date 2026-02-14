/**
 * Unit Tests for UndoManager
 *
 * Validates undo/redo functionality for project structure operations,
 * including operator creation, file creation, deletion, and datamap graph manipulation.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectCreator } from '../../src/layout/projectCreator';
import { ProjectLoader } from '../../src/server/projectLoader';
import { LayoutOperations } from '../../src/layout/layoutOperations';
import { UndoManager, getUndoManager, resetUndoManager } from '../../src/layout/undoManager';
import { ProjectContext } from '../../src/server/visualSoarProject';

suite('UndoManager', () => {
  const testDir = path.join(__dirname, '../../test-output/undo-test');
  const agentName = 'UndoTestAgent';
  let projectPath: string;
  let projectFilePath: string;
  let projectContext: ProjectContext;
  let undoManager: UndoManager;

  setup(async () => {
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
    const projectLoader = new ProjectLoader();
    projectContext = await projectLoader.loadProject(projectFilePath);

    // Reset undo manager for each test
    resetUndoManager();
    undoManager = getUndoManager();
  });

  teardown(async () => {
    // Clean up test project after each test
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to reload project context after operations
   */
  async function reloadProject(): Promise<void> {
    const projectLoader = new ProjectLoader();
    projectContext = await projectLoader.loadProject(projectFilePath);
  }

  test('Should initialize with empty undo/redo stacks', () => {
    assert.strictEqual(undoManager.canUndo(), false, 'Should not be able to undo initially');
    assert.strictEqual(undoManager.canRedo(), false, 'Should not be able to redo initially');
    assert.strictEqual(undoManager.getUndoDescription(), null, 'Undo description should be null');
    assert.strictEqual(undoManager.getRedoDescription(), null, 'Redo description should be null');
  });

  test('Should undo operator addition and restore datamap state', async () => {
    // Get root node ID
    const rootNodeId = projectContext.project.layout.id;

    // Count initial vertices and operators
    const initialVertexCount = projectContext.project.datamap.vertices.length;
    const initialOperators = projectContext.project.layout.children?.length || 0;

    // Add an operator using the undoable programmatic version
    const result = await LayoutOperations.addOperatorProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-operator',
      reloadProject
    );

    assert.ok(result.success, 'Operator should be added successfully');

    // Reload and verify operator was added
    await reloadProject();
    const afterAddVertexCount = projectContext.project.datamap.vertices.length;
    const afterAddOperators = projectContext.project.layout.children?.length || 0;

    assert.ok(
      afterAddVertexCount > initialVertexCount,
      'Datamap should have more vertices after adding operator'
    );
    assert.strictEqual(
      afterAddOperators,
      initialOperators + 1,
      'Layout should have one more operator'
    );

    // Verify undo is available
    assert.ok(undoManager.canUndo(), 'Should be able to undo');
    assert.strictEqual(
      undoManager.getUndoDescription(),
      'Add Operator',
      'Description should match'
    );

    // Perform undo
    await undoManager.undo();

    // Reload and verify operator was removed
    await reloadProject();
    const afterUndoVertexCount = projectContext.project.datamap.vertices.length;
    const afterUndoOperators = projectContext.project.layout.children?.length || 0;

    assert.strictEqual(
      afterUndoVertexCount,
      initialVertexCount,
      'Datamap should be restored to initial state'
    );
    assert.strictEqual(
      afterUndoOperators,
      initialOperators,
      'Layout should have original operator count'
    );

    // Verify redo is available
    assert.ok(undoManager.canRedo(), 'Should be able to redo');
    assert.strictEqual(
      undoManager.getRedoDescription(),
      'Add Operator',
      'Redo description should match'
    );
  });

  test('Should redo operator addition after undo', async () => {
    const rootNodeId = projectContext.project.layout.id;

    // Add operator
    await LayoutOperations.addOperatorProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-operator',
      reloadProject
    );

    await reloadProject();
    const afterAddVertexCount = projectContext.project.datamap.vertices.length;

    // Undo
    await undoManager.undo();
    await reloadProject();

    // Redo
    await undoManager.redo();
    await reloadProject();

    const afterRedoVertexCount = projectContext.project.datamap.vertices.length;

    assert.strictEqual(
      afterRedoVertexCount,
      afterAddVertexCount,
      'Datamap should be restored to post-add state after redo'
    );
  });

  test('Should undo file addition', async () => {
    const rootNodeId = projectContext.project.layout.id;
    const initialChildren = projectContext.project.layout.children?.length || 0;

    // Add a file using the undoable programmatic version
    const result = await LayoutOperations.addFileProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-file',
      reloadProject
    );

    assert.ok(result.success, 'File should be added successfully');

    // Reload and verify
    await reloadProject();
    const afterAddChildren = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(afterAddChildren, initialChildren + 1, 'Should have one more child');

    // Undo
    await undoManager.undo();
    await reloadProject();

    const afterUndoChildren = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(afterUndoChildren, initialChildren, 'Should be back to initial state');
  });

  test('Should undo folder addition', async () => {
    const rootNodeId = projectContext.project.layout.id;
    const initialChildren = projectContext.project.layout.children?.length || 0;

    // Add a folder using the undoable programmatic version
    const result = await LayoutOperations.addFolderProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-folder',
      reloadProject
    );

    assert.ok(result.success, 'Folder should be added successfully');

    // Reload and verify
    await reloadProject();
    const afterAddChildren = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(afterAddChildren, initialChildren + 1, 'Should have one more child');

    // Undo
    await undoManager.undo();
    await reloadProject();

    const afterUndoChildren = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(afterUndoChildren, initialChildren, 'Should be back to initial state');
  });

  test('Should undo node deletion and restore files', async () => {
    const rootNodeId = projectContext.project.layout.id;

    // First add an operator to have something to delete
    await LayoutOperations.addOperatorProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-operator',
      reloadProject
    );
    await reloadProject();

    // Get the newly added operator node
    const operatorNode =
      projectContext.project.layout.children?.[projectContext.project.layout.children.length - 1];
    assert.ok(operatorNode, 'Operator node should exist');

    const operatorNodeId = operatorNode!.id;
    const operatorFile = 'file' in operatorNode && operatorNode.file;
    const operatorFilePath = operatorFile ? path.join(projectPath, agentName, operatorFile) : null;

    // Verify file exists
    if (operatorFilePath) {
      assert.ok(fs.existsSync(operatorFilePath), 'Operator file should exist before deletion');
    }

    const childCountBeforeDelete = projectContext.project.layout.children?.length || 0;

    // Delete the operator (with undo)
    await LayoutOperations.deleteNodeWithUndo(
      projectContext,
      operatorNodeId,
      rootNodeId,
      reloadProject,
      true // skip confirmation
    );
    await reloadProject();

    const childCountAfterDelete = projectContext.project.layout.children?.length || 0;

    assert.strictEqual(
      childCountAfterDelete,
      childCountBeforeDelete - 1,
      'Operator should be deleted'
    );

    if (operatorFilePath) {
      assert.ok(!fs.existsSync(operatorFilePath), 'Operator file should be deleted');
    }

    // Undo deletion
    await undoManager.undo();
    await reloadProject();

    const childCountAfterUndo = projectContext.project.layout.children?.length || 0;

    assert.strictEqual(childCountAfterUndo, childCountBeforeDelete, 'Operator should be restored');

    if (operatorFilePath) {
      assert.ok(fs.existsSync(operatorFilePath), 'Operator file should be restored');
    }
  });

  test('Should handle multiple operations in sequence', async () => {
    const rootNodeId = projectContext.project.layout.id;
    const initialChildren = projectContext.project.layout.children?.length || 0;

    // Add operator
    await LayoutOperations.addOperatorProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-operator',
      reloadProject
    );
    await reloadProject();

    // Add file
    await LayoutOperations.addFileProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-file',
      reloadProject
    );
    await reloadProject();

    // Add folder
    await LayoutOperations.addFolderProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-folder',
      reloadProject
    );
    await reloadProject();

    const afterAllAdds = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(afterAllAdds, initialChildren + 3, 'Should have 3 more children');

    // Undo last operation (folder)
    await undoManager.undo();
    await reloadProject();

    let currentChildren = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(currentChildren, initialChildren + 2, 'Should have 2 more children');

    // Undo second to last operation (file)
    await undoManager.undo();
    await reloadProject();

    currentChildren = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(currentChildren, initialChildren + 1, 'Should have 1 more child');

    // Undo first operation (operator)
    await undoManager.undo();
    await reloadProject();

    currentChildren = projectContext.project.layout.children?.length || 0;
    assert.strictEqual(currentChildren, initialChildren, 'Should be back to initial state');

    // Verify we can't undo anymore
    assert.strictEqual(undoManager.canUndo(), false, 'Should not be able to undo anymore');
  });

  test('Should clear redo stack when new operation is performed', async () => {
    const rootNodeId = projectContext.project.layout.id;

    // Add operator
    await LayoutOperations.addOperatorProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-operator',
      reloadProject
    );
    await reloadProject();

    // Undo it
    await undoManager.undo();
    await reloadProject();

    // Verify redo is available
    assert.ok(undoManager.canRedo(), 'Should be able to redo');

    // Perform a new operation
    await LayoutOperations.addFileProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-file',
      reloadProject
    );
    await reloadProject();

    // Redo should no longer be available
    assert.strictEqual(undoManager.canRedo(), false, 'Redo stack should be cleared');
  });

  test('Should restore datamap graph structure correctly after undo', async () => {
    const rootNodeId = projectContext.project.layout.id;

    // Get initial root vertex
    const initialRootVertex = projectContext.project.datamap.vertices.find(
      v => v.id === projectContext.project.datamap.rootId
    );
    assert.ok(initialRootVertex, 'Root vertex should exist');

    const initialOperatorEdge =
      initialRootVertex.type === 'SOAR_ID' && initialRootVertex.outEdges
        ? initialRootVertex.outEdges.find(e => e.name === 'operator')
        : undefined;

    const initialOperatorVertexId =
      initialOperatorEdge && 'vertexId' in initialOperatorEdge
        ? initialOperatorEdge.vertexId
        : null;

    let initialOperatorEnumValues: string[] = [];
    if (initialOperatorVertexId) {
      const opVertex = projectContext.project.datamap.vertices.find(
        v => v.id === initialOperatorVertexId
      );
      if (opVertex && opVertex.type === 'ENUMERATION') {
        initialOperatorEnumValues = [...opVertex.choices];
      }
    }

    // Add an operator
    await LayoutOperations.addOperatorProgrammaticWithUndo(
      projectContext,
      rootNodeId,
      'test-operator',
      reloadProject
    );
    await reloadProject();

    // Get the operator vertex after adding
    const afterAddRootVertex = projectContext.project.datamap.vertices.find(
      v => v.id === projectContext.project.datamap.rootId
    );
    const afterAddOperatorEdge =
      afterAddRootVertex && afterAddRootVertex.type === 'SOAR_ID' && afterAddRootVertex.outEdges
        ? afterAddRootVertex.outEdges.find(e => e.name === 'operator')
        : undefined;

    const afterAddOperatorVertexId =
      afterAddOperatorEdge && 'vertexId' in afterAddOperatorEdge
        ? afterAddOperatorEdge.vertexId
        : null;

    const afterAddOpVertex = projectContext.project.datamap.vertices.find(
      v => v.id === afterAddOperatorVertexId
    );

    // Verify operator enumeration was updated
    if (afterAddOpVertex && afterAddOpVertex.type === 'ENUMERATION') {
      assert.ok(
        afterAddOpVertex.choices.length > initialOperatorEnumValues.length,
        'Operator enumeration should have additional value'
      );
    }

    // Undo the operation
    await undoManager.undo();
    await reloadProject();

    // Verify datamap is restored
    const afterUndoRootVertex = projectContext.project.datamap.vertices.find(
      v => v.id === projectContext.project.datamap.rootId
    );
    const afterUndoOperatorEdge =
      afterUndoRootVertex && afterUndoRootVertex.type === 'SOAR_ID' && afterUndoRootVertex.outEdges
        ? afterUndoRootVertex.outEdges.find(e => e.name === 'operator')
        : undefined;

    const afterUndoOperatorVertexId =
      afterUndoOperatorEdge && 'vertexId' in afterUndoOperatorEdge
        ? afterUndoOperatorEdge.vertexId
        : null;

    const afterUndoOpVertex = projectContext.project.datamap.vertices.find(
      v => v.id === afterUndoOperatorVertexId
    );

    // Verify operator enumeration is restored to original
    if (afterUndoOpVertex && afterUndoOpVertex.type === 'ENUMERATION') {
      assert.deepStrictEqual(
        afterUndoOpVertex.choices.sort(),
        initialOperatorEnumValues.sort(),
        'Operator enumeration should be restored to initial state'
      );
    }
  });

  test('Should limit undo stack to 50 operations', async () => {
    const rootNodeId = projectContext.project.layout.id;

    // Perform 60 operations
    for (let i = 0; i < 60; i++) {
      await LayoutOperations.addFileProgrammaticWithUndo(
        projectContext,
        rootNodeId,
        `test-file-${i}`,
        reloadProject
      );
      await reloadProject();
    }

    // Try to undo 51 times
    let undoCount = 0;
    while (undoManager.canUndo()) {
      await undoManager.undo();
      await reloadProject();
      undoCount++;
    }

    // Should only be able to undo 50 times (max stack size)
    assert.ok(undoCount <= 50, 'Should only undo up to 50 operations');
  });
});
