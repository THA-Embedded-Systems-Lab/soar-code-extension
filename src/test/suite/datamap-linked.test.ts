/**
 * Unit tests for linked attribute detection in datamap tree view
 * Tests the visual highlighting and navigation of cross-referenced vertices
 * Tests CRUD operations and file persistence
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ProjectLoader } from '../../server/projectLoader';
import { DatamapTreeProvider } from '../../datamap/datamapTreeProvider';
import { DatamapOperations } from '../../datamap/datamapOperations';
import { DatamapMetadataCache, DatamapProjectContext } from '../../datamap/datamapMetadata';
import { DMVertex, SoarIdVertex, VisualSoarProject } from '../../server/visualSoarProject';

suite('Datamap Linked Attribute Tests', () => {
  let projectLoader: ProjectLoader;
  let testProject: any;
  let treeProvider: DatamapTreeProvider;

  suiteSetup(async () => {
    projectLoader = new ProjectLoader();
    const projectPath = path.resolve(__dirname, '../../../test/fixtures/test-project.vsa.json');
    testProject = await projectLoader.loadProject(projectPath);

    treeProvider = new DatamapTreeProvider();
    await treeProvider.loadProjectFromFile(projectPath);
  });

  test('Project should have cross-referenced vertices', () => {
    // The test project has several cross-references:
    // - io-vertex is referenced by root-state, vertex 2, and vertex 3
    // - root-state is referenced by itself (superstate) and by vertices 2 and 3 (top-state, superstate)

    const ioVertex = testProject.datamapIndex.get('io-vertex');
    assert.ok(ioVertex, 'io-vertex should exist');

    const rootState = testProject.datamapIndex.get('root-state');
    assert.ok(rootState, 'root-state should exist');

    // Count references to io-vertex
    let ioReferences = 0;
    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === 'io-vertex') {
            ioReferences++;
          }
        }
      }
    }

    assert.ok(
      ioReferences > 1,
      `io-vertex should be referenced multiple times, found ${ioReferences}`
    );
  });

  test('Should detect linked references (excluding parent-child)', () => {
    // io-vertex is referenced by:
    // 1. root-state (parent: io attribute)
    // 2. vertex 2 (cross-reference: io attribute)
    // 3. vertex 3 (cross-reference: io attribute)

    // When viewed from vertex 2 or 3, the io attribute should be marked as linked
    // because it's referenced by other vertices (not just parent-child)

    const vertex2 = testProject.datamapIndex.get('2');
    assert.ok(vertex2, 'Vertex 2 should exist');

    const ioEdge = vertex2.outEdges.find((e: any) => e.name === 'io');
    assert.ok(ioEdge, 'Vertex 2 should have io edge');
    assert.strictEqual(ioEdge.toId, 'io-vertex', 'io edge should point to io-vertex');

    // Verify multiple references exist
    let ioReferences = 0;
    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === 'io-vertex') {
            ioReferences++;
          }
        }
      }
    }

    assert.ok(
      ioReferences >= 3,
      `io-vertex should have at least 3 references, found ${ioReferences}`
    );
  });

  test('Should NOT detect parent-child as linked references', () => {
    // root-state has a superstate edge pointing to itself
    // This should NOT be considered a linked reference because it's self-referential

    const rootState = testProject.datamapIndex.get('root-state');
    assert.ok(rootState, 'root-state should exist');

    const superstateEdge = rootState.outEdges.find((e: any) => e.name === 'superstate');
    assert.ok(superstateEdge, 'root-state should have superstate edge');
    assert.strictEqual(superstateEdge.toId, 'root-state', 'superstate should point to root-state');

    // The direct parent-child relationship should not be highlighted as linked
    // (This is verified by the isLinkedReference logic checking ancestorIds)
  });

  test('Should identify cross-references with shared vertex', () => {
    // root-state has multiple operator edges - one to 'operator-vertex' and one to vertex '4'
    // This tests that the same attribute name can point to different vertices

    const rootState = testProject.datamapIndex.get('root-state');
    assert.ok(rootState, 'root-state should exist');

    const operatorEdges = rootState.outEdges.filter((e: any) => e.name === 'operator');
    assert.ok(operatorEdges.length >= 2, 'root-state should have multiple operator edges');

    // Verify they point to different vertices
    const targetIds = new Set(operatorEdges.map((e: any) => e.toId));
    assert.ok(targetIds.size >= 2, 'Operator edges should point to different vertices');

    // Verify both target vertices exist
    for (const edge of operatorEdges) {
      const targetVertex = testProject.datamapIndex.get(edge.toId);
      assert.ok(targetVertex, `Target vertex ${edge.toId} should exist`);
    }
  });

  test('Should count all references to a vertex', () => {
    // Count references to root-state (should be referenced by itself and other vertices)
    let rootReferences = 0;
    const rootState = testProject.datamapIndex.get('root-state');

    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === 'root-state') {
            rootReferences++;
          }
        }
      }
    }

    // root-state is referenced by:
    // - itself (superstate)
    // - vertex 2 (superstate, top-state)
    // - vertex 3 (top-state)
    assert.ok(
      rootReferences >= 4,
      `root-state should have at least 4 references, found ${rootReferences}`
    );
  });

  test('Should differentiate between direct children and cross-references', () => {
    // Vertex 2 has edges to both io-vertex and root-state
    // - io-vertex is a cross-reference (also referenced by root-state and vertex 3)
    // - root-state edges (superstate, top-state) are structural references

    const vertex2 = testProject.datamapIndex.get('2');
    assert.ok(vertex2, 'Vertex 2 should exist');

    // Check io edge (should be cross-reference)
    const ioEdge = vertex2.outEdges.find((e: any) => e.name === 'io');
    assert.ok(ioEdge, 'Vertex 2 should have io edge');

    // Count io-vertex references
    let ioRefCount = 0;
    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === 'io-vertex') {
            ioRefCount++;
          }
        }
      }
    }

    assert.ok(ioRefCount >= 2, 'io-vertex should have multiple references (cross-reference)');

    // Check operator edge (should be unique reference)
    const operatorEdge = vertex2.outEdges.find((e: any) => e.name === 'operator');
    assert.ok(operatorEdge, 'Vertex 2 should have operator edge');
    assert.strictEqual(operatorEdge.toId, '3', 'operator should point to vertex 3');

    // Count vertex 3 references
    let vertex3RefCount = 0;
    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === '3') {
            vertex3RefCount++;
          }
        }
      }
    }

    // Vertex 3 should only be referenced once by vertex 2
    assert.strictEqual(
      vertex3RefCount,
      1,
      'Vertex 3 should have only one reference (not a cross-reference)'
    );
  });

  test('Should handle self-referential vertices correctly', () => {
    // root-state has superstate pointing to itself
    const rootState = testProject.datamapIndex.get('root-state');
    assert.ok(rootState, 'root-state should exist');

    const superstateEdge = rootState.outEdges.find((e: any) => e.name === 'superstate');
    assert.ok(superstateEdge, 'root-state should have superstate edge');
    assert.strictEqual(superstateEdge.toId, 'root-state', 'superstate should be self-referential');

    // Self-referential edges are legitimate but should be handled carefully
    // They contribute to reference count but shouldn't cause infinite loops
  });

  test('Should verify vertices referenced by multiple edges', () => {
    // Find vertices that are referenced multiple times
    const referenceCounts = new Map<string, Array<{ vertexId: string; edgeName: string }>>();

    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (!referenceCounts.has(edge.toId)) {
            referenceCounts.set(edge.toId, []);
          }
          referenceCounts.get(edge.toId)!.push({ vertexId: vertex.id, edgeName: edge.name });
        }
      }
    }

    // Find vertices with multiple references
    const multipleRefs = Array.from(referenceCounts.entries()).filter(
      ([_, refs]) => refs.length > 1
    );

    assert.ok(multipleRefs.length > 0, 'Should have at least one vertex with multiple references');

    // Verify io-vertex and root-state have multiple references
    const ioRefs = referenceCounts.get('io-vertex');
    assert.ok(ioRefs && ioRefs.length >= 3, 'io-vertex should have at least 3 references');

    const rootRefs = referenceCounts.get('root-state');
    assert.ok(rootRefs && rootRefs.length >= 4, 'root-state should have at least 4 references');
  });

  test('Should handle vertices with no cross-references', () => {
    // Vertex 1 should only be referenced once (by root-state's "state" attribute)
    let vertex1RefCount = 0;

    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === '1') {
            vertex1RefCount++;
          }
        }
      }
    }

    assert.strictEqual(
      vertex1RefCount,
      1,
      'Vertex 1 should have only one reference (no cross-reference)'
    );
  });

  test('Should verify operator-vertex is only referenced by root-state', () => {
    // The operator-vertex should only be referenced by root-state
    // It's not a linked reference because it's a simple parent-child relationship

    let operatorVertexRefCount = 0;

    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === 'operator-vertex') {
            operatorVertexRefCount++;
          }
        }
      }
    }

    // Note: root-state has TWO operator edges, but one points to 'operator-vertex' and one to '4'
    // Only one should reference 'operator-vertex'
    assert.strictEqual(operatorVertexRefCount, 1, 'operator-vertex should have only one reference');
  });

  test('Should identify complex cross-reference patterns', () => {
    // Test the complex pattern where:
    // - root-state -> io -> io-vertex
    // - vertex 2 -> io -> io-vertex (cross-reference)
    // - vertex 3 -> io -> io-vertex (cross-reference)
    // All three references point to the SAME vertex, making it a shared resource

    const ioVertex = testProject.datamapIndex.get('io-vertex');
    assert.ok(ioVertex, 'io-vertex should exist');
    assert.strictEqual(ioVertex.type, 'SOAR_ID', 'io-vertex should be SOAR_ID');

    // Find all vertices that reference io-vertex
    const referencingVertices: string[] = [];
    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.toId === 'io-vertex') {
            referencingVertices.push(vertex.id);
          }
        }
      }
    }

    assert.ok(referencingVertices.includes('root-state'), 'root-state should reference io-vertex');
    assert.ok(referencingVertices.includes('2'), 'Vertex 2 should reference io-vertex');
    assert.ok(referencingVertices.includes('3'), 'Vertex 3 should reference io-vertex');
    assert.ok(
      referencingVertices.length >= 3,
      `Should have at least 3 references to io-vertex, found ${referencingVertices.length}`
    );
  });

  test('Metadata cache should flag cross references as linked edges', () => {
    const context = treeProvider.getProjectContext();
    assert.ok(context, 'Project context should be available');

    const metadata = context.datamapMetadata;
    const linkedEdge = metadata.getEdgeMetadata('2', 'io', 'io-vertex');
    assert.ok(linkedEdge, 'Linked edge metadata should exist');
    assert.strictEqual(linkedEdge.isLink, true, 'Cross-reference should be marked as linked');
    assert.strictEqual(linkedEdge.ownerParentId, 'root-state', 'Owner should remain root-state');
    assert.strictEqual(
      linkedEdge.inboundCount,
      3,
      'Linked vertex should report all inbound references'
    );
    assert.strictEqual(
      linkedEdge.hasLinkedSiblings,
      true,
      'Linked edge should report shared state'
    );

    const ownerEdge = metadata.getEdgeMetadata('root-state', 'io', 'io-vertex');
    assert.ok(ownerEdge, 'Owner edge metadata should exist');
    assert.strictEqual(ownerEdge.isLink, false, 'Owner edge should not be marked as linked');
    assert.strictEqual(
      ownerEdge.hasLinkedSiblings,
      true,
      'Owner edge should still be aware of linked siblings'
    );

    const inbound = metadata.getInboundReferences('io-vertex');
    assert.strictEqual(inbound.length, 3, 'Inbound reference list should include all parents');
  });

  test('Metadata ownership is stable regardless of vertex ordering', () => {
    const context = treeProvider.getProjectContext();
    assert.ok(context, 'Project context should be available');

    const clonedProject = JSON.parse(JSON.stringify(context.project)) as VisualSoarProject;
    clonedProject.datamap.vertices.sort((a, b) => {
      if (a.id === '2') {
        return -1;
      }
      if (b.id === '2') {
        return 1;
      }
      if (a.id === 'root-state') {
        return 1;
      }
      if (b.id === 'root-state') {
        return -1;
      }
      return 0;
    });

    const clonedIndex = new Map<string, DMVertex>();
    for (const vertex of clonedProject.datamap.vertices) {
      clonedIndex.set(vertex.id, vertex);
    }

    const metadata = DatamapMetadataCache.build(clonedProject, clonedIndex);
    const ownerEdge = metadata.getEdgeMetadata('root-state', 'io', 'io-vertex');
    assert.ok(ownerEdge, 'Owner edge should still be tracked');
    assert.strictEqual(ownerEdge.ownerParentId, 'root-state');
    assert.strictEqual(ownerEdge.isLink, false, 'Owner edge must remain editable');

    const linkedEdge = metadata.getEdgeMetadata('2', 'io', 'io-vertex');
    assert.ok(linkedEdge, 'Linked edge should exist even after reordering');
    assert.strictEqual(linkedEdge.ownerParentId, 'root-state');
    assert.strictEqual(linkedEdge.isLink, true, 'Linked edge should remain read-only');
  });

  test('Tree view items mark linked attributes as immutable', async () => {
    const context = treeProvider.getProjectContext();
    assert.ok(context, 'Project context should be available');

    treeProvider.setDatamapRoot('2');
    const [vertex2Item] = await treeProvider.getChildren();
    assert.ok(vertex2Item, 'Vertex 2 tree item should exist');

    const children = await treeProvider.getChildren(vertex2Item);
    const ioChild = children.find(child => child.edgeName === 'io');
    assert.ok(ioChild, 'Vertex 2 should expose an io attribute');
    assert.strictEqual(
      ioChild.edgeMetadata?.isLink,
      true,
      'io attribute should be flagged as linked'
    );
    assert.ok(
      ioChild.contextValue?.includes('-linked'),
      'Linked attribute context should include suffix'
    );
    assert.strictEqual(
      ioChild.isImmutableView,
      true,
      'Linked attribute should be immutable in the UI'
    );

    const operatorChild = children.find(child => child.edgeName === 'operator');
    assert.ok(operatorChild, 'Operator attribute should be present');
    assert.ok(!operatorChild.edgeMetadata?.isLink, 'Operator edge should not be considered linked');
    assert.ok(
      !operatorChild.contextValue?.includes('-linked'),
      'Non-linked attribute should not carry linked suffix'
    );

    treeProvider.setDatamapRoot(null);
  });
});

suite('Datamap CRUD Operations and Persistence Tests', () => {
  let tempProjectPath: string;
  let projectLoader: ProjectLoader;
  let testProject: any;

  suiteSetup(async () => {
    // Create a temporary copy of the test project
    const originalPath = path.resolve(__dirname, '../../../test/fixtures/test-project.vsa.json');
    const originalContent = await fs.promises.readFile(originalPath, 'utf-8');

    tempProjectPath = path.join(os.tmpdir(), `test-project-${Date.now()}.vsa.json`);
    await fs.promises.writeFile(tempProjectPath, originalContent, 'utf-8');

    projectLoader = new ProjectLoader();
    testProject = await projectLoader.loadProject(tempProjectPath);
    (testProject as DatamapProjectContext).datamapMetadata = DatamapMetadataCache.build(
      testProject.project,
      testProject.datamapIndex
    );
  });

  suiteTeardown(async () => {
    // Clean up temporary file
    if (tempProjectPath && fs.existsSync(tempProjectPath)) {
      await fs.promises.unlink(tempProjectPath);
    }
  });

  test('Should generate unique vertex IDs', () => {
    // The project has both string IDs ("root-state", "io-vertex") and numeric IDs ("1", "4", "8")
    const existingIds = new Set(testProject.project.datamap.vertices.map((v: any) => v.id));

    // Generate new IDs
    const newId1 = (DatamapOperations as any).generateVertexId(testProject.project);
    const newId2 = (DatamapOperations as any).generateVertexId(testProject.project);
    const newId3 = (DatamapOperations as any).generateVertexId(testProject.project);

    // Verify uniqueness
    assert.ok(!existingIds.has(newId1), `Generated ID ${newId1} should be unique`);
    assert.ok(!existingIds.has(newId2), `Generated ID ${newId2} should be unique`);
    assert.ok(!existingIds.has(newId3), `Generated ID ${newId3} should be unique`);

    // IDs should be numeric
    assert.ok(!isNaN(parseInt(newId1, 10)), 'Generated ID should be numeric');
    assert.ok(!isNaN(parseInt(newId2, 10)), 'Generated ID should be numeric');
    assert.ok(!isNaN(parseInt(newId3, 10)), 'Generated ID should be numeric');
  });

  test('Should add vertex and persist to file', async () => {
    const initialVertexCount = testProject.project.datamap.vertices.length;

    // Manually add a new attribute to root-state
    const rootState = testProject.datamapIndex.get('root-state');
    assert.ok(rootState, 'root-state should exist');

    const newVertexId = (DatamapOperations as any).generateVertexId(testProject.project);
    const newVertex: DMVertex = {
      id: newVertexId,
      type: 'STRING',
    };

    testProject.project.datamap.vertices.push(newVertex);
    testProject.datamapIndex.set(newVertexId, newVertex);

    rootState.outEdges.push({
      name: 'test-attribute',
      toId: newVertexId,
      comment: 'Test attribute',
    });

    // Save project
    await (DatamapOperations as any).saveProject(testProject);

    // Reload project from file
    const reloadedProject = await projectLoader.loadProject(tempProjectPath);

    // Verify the new vertex exists in the reloaded project
    assert.strictEqual(
      reloadedProject.project.datamap.vertices.length,
      initialVertexCount + 1,
      'Vertex count should increase by 1'
    );

    const reloadedVertex = reloadedProject.datamapIndex.get(newVertexId);
    assert.ok(reloadedVertex, 'New vertex should exist in reloaded project');
    assert.strictEqual(reloadedVertex.type, 'STRING', 'Vertex type should be STRING');

    const reloadedRootState = reloadedProject.datamapIndex.get('root-state');
    assert.ok(reloadedRootState, 'Reloaded root-state should exist');
    assert.strictEqual(reloadedRootState.type, 'SOAR_ID', 'Root state should be SOAR_ID');

    const testEdge = (reloadedRootState as any).outEdges?.find(
      (e: any) => e.name === 'test-attribute'
    );
    assert.ok(testEdge, 'New edge should exist in reloaded project');
    assert.strictEqual(testEdge.toId, newVertexId, 'Edge should point to new vertex');
  });

  test('Should not reuse deleted vertex IDs', async () => {
    // Get highest existing ID
    let maxId = 0;
    for (const vertex of testProject.project.datamap.vertices) {
      const numId = parseInt(vertex.id, 10);
      if (!isNaN(numId) && numId > maxId) {
        maxId = numId;
      }
    }

    // Add a vertex
    const newId1 = (DatamapOperations as any).generateVertexId(testProject.project);
    assert.strictEqual(parseInt(newId1, 10), maxId + 1, 'First new ID should be max + 1');

    const newVertex1: DMVertex = {
      id: newId1,
      type: 'INTEGER',
    };
    testProject.project.datamap.vertices.push(newVertex1);
    testProject.datamapIndex.set(newId1, newVertex1);

    // Generate another ID (should be sequential)
    const newId2 = (DatamapOperations as any).generateVertexId(testProject.project);
    assert.strictEqual(
      parseInt(newId2, 10),
      parseInt(newId1, 10) + 1,
      'Sequential IDs should increment by 1'
    );

    // Add the second vertex to the project
    const newVertex2: DMVertex = {
      id: newId2,
      type: 'STRING',
    };
    testProject.project.datamap.vertices.push(newVertex2);
    testProject.datamapIndex.set(newId2, newVertex2);

    // Remove first vertex (but keep second one)
    const index = testProject.project.datamap.vertices.findIndex((v: any) => v.id === newId1);
    testProject.project.datamap.vertices.splice(index, 1);
    testProject.datamapIndex.delete(newId1);

    // Generate another ID - should continue from highest remaining ID (newId2), not reuse deleted newId1
    const newId3 = (DatamapOperations as any).generateVertexId(testProject.project);
    assert.strictEqual(
      parseInt(newId3, 10),
      parseInt(newId2, 10) + 1,
      'Should continue from highest existing ID'
    );
    assert.notStrictEqual(newId3, newId1, 'Should not reuse deleted ID');
  });

  test('Should handle mixed numeric and string IDs', async () => {
    // Verify the project has both types of IDs
    const stringIds = testProject.project.datamap.vertices
      .filter((v: any) => isNaN(parseInt(v.id, 10)))
      .map((v: any) => v.id);

    const numericIds = testProject.project.datamap.vertices
      .filter((v: any) => !isNaN(parseInt(v.id, 10)))
      .map((v: any) => v.id);

    assert.ok(stringIds.length > 0, 'Project should have string IDs');
    assert.ok(numericIds.length > 0, 'Project should have numeric IDs');

    // Generate new ID should be numeric and not conflict with any existing ID
    const newId = (DatamapOperations as any).generateVertexId(testProject.project);
    assert.ok(!isNaN(parseInt(newId, 10)), 'Generated ID should be numeric');
    assert.ok(!stringIds.includes(newId), 'Generated ID should not match string IDs');
    assert.ok(!numericIds.includes(newId), 'Generated ID should not match existing numeric IDs');
  });

  test('Should preserve all vertices when saving', async () => {
    // Record all vertex IDs before save
    const vertexIdsBefore = testProject.project.datamap.vertices.map((v: any) => v.id).sort();

    // Save project
    await (DatamapOperations as any).saveProject(testProject);

    // Reload project
    const reloadedProject = await projectLoader.loadProject(tempProjectPath);
    const vertexIdsAfter = reloadedProject.project.datamap.vertices.map((v: any) => v.id).sort();

    // Verify all vertices are preserved
    assert.strictEqual(
      vertexIdsAfter.length,
      vertexIdsBefore.length,
      'Vertex count should remain the same'
    );

    for (let i = 0; i < vertexIdsBefore.length; i++) {
      assert.strictEqual(
        vertexIdsAfter[i],
        vertexIdsBefore[i],
        `Vertex ID at index ${i} should be preserved`
      );
    }
  });

  test('Should maintain edge references after save', async () => {
    // Record all edges before save
    const edgesBefore: Array<{ fromId: string; edgeName: string; toId: string }> = [];

    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          edgesBefore.push({
            fromId: vertex.id,
            edgeName: edge.name,
            toId: edge.toId,
          });
        }
      }
    }

    // Save project
    await (DatamapOperations as any).saveProject(testProject);

    // Reload project
    const reloadedProject = await projectLoader.loadProject(tempProjectPath);

    // Record all edges after reload
    const edgesAfter: Array<{ fromId: string; edgeName: string; toId: string }> = [];

    for (const vertex of reloadedProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          edgesAfter.push({
            fromId: vertex.id,
            edgeName: edge.name,
            toId: edge.toId,
          });
        }
      }
    }

    // Verify edge count matches
    assert.strictEqual(edgesAfter.length, edgesBefore.length, 'Edge count should remain the same');

    // Verify all edges are preserved
    for (const edgeBefore of edgesBefore) {
      const found = edgesAfter.find(
        e =>
          e.fromId === edgeBefore.fromId &&
          e.edgeName === edgeBefore.edgeName &&
          e.toId === edgeBefore.toId
      );
      assert.ok(
        found,
        `Edge ${edgeBefore.fromId} -> ${edgeBefore.edgeName} -> ${edgeBefore.toId} should be preserved`
      );
    }
  });

  test('Should remove linked attributes without deleting shared vertices', async () => {
    const projectContext = testProject as DatamapProjectContext;
    const vertex2 = projectContext.datamapIndex.get('2') as SoarIdVertex | undefined;
    assert.ok(vertex2, 'Vertex 2 should exist');
    assert.strictEqual(vertex2.type, 'SOAR_ID', 'Vertex 2 should be a SOAR_ID');

    const edgeMetadata = projectContext.datamapMetadata.getEdgeMetadata('2', 'io', 'io-vertex');
    assert.ok(edgeMetadata, 'Linked edge metadata should exist');

    const hasLinkBefore = vertex2.outEdges?.some(
      edge => edge.name === 'io' && edge.toId === 'io-vertex'
    );
    assert.ok(hasLinkBefore, 'Vertex 2 should initially contain the io link');

    try {
      const removed = await DatamapOperations.removeLinkedAttribute(projectContext, edgeMetadata);
      assert.strictEqual(removed, true, 'removeLinkedAttribute should succeed');

      const stillHasLink = vertex2.outEdges?.some(
        edge => edge.name === 'io' && edge.toId === 'io-vertex'
      );
      assert.ok(!stillHasLink, 'Linked edge should be removed from parent vertex');

      assert.ok(
        projectContext.datamapIndex.has('io-vertex'),
        'Shared vertex should remain in the datamap'
      );

      const inboundAfter = projectContext.datamapMetadata.getInboundReferences('io-vertex').length;
      assert.strictEqual(
        inboundAfter,
        2,
        'Shared vertex should still have remaining inbound references'
      );
    } finally {
      vertex2.outEdges = vertex2.outEdges || [];
      const linkExists = vertex2.outEdges.some(
        edge => edge.name === 'io' && edge.toId === 'io-vertex'
      );

      if (!linkExists) {
        vertex2.outEdges.push({
          name: 'io',
          toId: 'io-vertex',
        });
        await (DatamapOperations as any).saveProject(projectContext);
      }
    }
  });

  test('Should detect duplicate vertex IDs', () => {
    // Verify no duplicate IDs exist
    const vertexIds = testProject.project.datamap.vertices.map((v: any) => v.id);
    const uniqueIds = new Set(vertexIds);

    assert.strictEqual(
      uniqueIds.size,
      vertexIds.length,
      'All vertex IDs should be unique (no duplicates)'
    );
  });

  test('Should verify all edge targets exist', () => {
    // Collect all vertex IDs
    const vertexIds = new Set(testProject.project.datamap.vertices.map((v: any) => v.id));

    // Verify all edge targets exist
    for (const vertex of testProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          assert.ok(
            vertexIds.has(edge.toId),
            `Edge ${vertex.id} -> ${edge.name} points to non-existent vertex ${edge.toId}`
          );
        }
      }
    }
  });
});
