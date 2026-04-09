/**
 * Datamap Integrity Check Tests
 *
 * Covers the `checkLinkedAttributeIntegrity` feature:
 * - No issues on a clean datamap
 * - Dangling attribute: edge whose toId does not exist in the datamap
 * - Unreachable-root linked attribute: shared-target vertex that cannot be
 *   reached from the datamap root via the ownership tree
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DatamapMetadataCache,
  DatamapProjectContext,
} from '../../../../src/datamap/datamapMetadata';
import { DatamapOperations } from '../../../../src/datamap/datamapOperations';
import { ProjectLoader } from '../../../../src/server/projectLoader';
import { DMVertex, VisualSoarProject } from '../../../../src/server/visualSoarProject';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(vertices: DMVertex[], rootId: string = '0'): VisualSoarProject {
  return {
    version: '6',
    datamap: { rootId, vertices },
    layout: {
      id: 'root',
      type: 'OPERATOR_ROOT',
      name: 'root',
      folder: '.',
      children: [],
    },
  };
}

function buildIndex(vertices: DMVertex[]): Map<string, DMVertex> {
  const index = new Map<string, DMVertex>();
  for (const v of vertices) {
    index.set(v.id, v);
  }
  return index;
}

async function writeProjectFile(dir: string, project: VisualSoarProject): Promise<string> {
  const projectFile = path.join(dir, 'agent.vsa.json');
  await fs.promises.writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');
  return projectFile;
}

async function loadDatamapContext(projectFile: string): Promise<DatamapProjectContext> {
  const loader = new ProjectLoader();
  const base = await loader.loadProject(projectFile);
  const datamapMetadata = DatamapMetadataCache.build(base.project, base.datamapIndex);
  return { ...base, datamapMetadata };
}

// ---------------------------------------------------------------------------
// Unit-level tests (DatamapMetadataCache.checkLinkedAttributeIntegrity)
// ---------------------------------------------------------------------------

suite('DatamapMetadataCache – checkLinkedAttributeIntegrity', () => {
  test('returns no issues for a clean datamap without linked attributes', () => {
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'state', toId: '1' }] },
      { id: '1', type: 'SOAR_ID', outEdges: [{ name: 'value', toId: '2' }] },
      { id: '2', type: 'STRING' },
    ];
    const project = makeProject(vertices);
    const index = buildIndex(vertices);

    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(project, index);
    assert.strictEqual(issues.length, 0, 'Expected no issues on a clean datamap');
  });

  test('returns no issues for a clean datamap with a valid linked attribute', () => {
    // Root -> 'state' -> vertex 1 (owned)
    //      -> 'alias' -> vertex 1 (linked – shared target, but reachable from root)
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'state', toId: '1' },
          { name: 'alias', toId: '1' },
        ],
      },
      { id: '1', type: 'SOAR_ID', outEdges: [] },
    ];
    const project = makeProject(vertices);
    const index = buildIndex(vertices);

    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(project, index);
    assert.strictEqual(issues.length, 0, 'Valid linked attribute should produce no issues');
  });

  test('reports dangling issue when edge toId does not exist', () => {
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'broken', toId: 'nonexistent' }] },
    ];
    const project = makeProject(vertices);
    const index = buildIndex(vertices);

    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(project, index);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].kind, 'dangling');
    assert.strictEqual(issues[0].parentVertexId, '0');
    assert.strictEqual(issues[0].attributeName, 'broken');
    assert.strictEqual(issues[0].targetVertexId, 'nonexistent');
  });

  test('reports dangling issue when multiple edges reference missing vertices', () => {
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'gone1', toId: 'missing-a' },
          { name: 'gone2', toId: 'missing-b' },
        ],
      },
    ];
    const project = makeProject(vertices);
    const index = buildIndex(vertices);

    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(project, index);
    assert.strictEqual(issues.length, 2);
    assert.ok(issues.every(i => i.kind === 'dangling'));
    const names = issues.map(i => i.attributeName).sort();
    assert.deepStrictEqual(names, ['gone1', 'gone2']);
  });

  test('reports unreachable-root for a linked attribute pointing at an orphaned vertex', () => {
    // Root -> vertex 1 (reachable)
    // Vertex 2 exists but has NO path from root.
    // Vertex 3 links to vertex 2 from itself, and vertex 3 is also reachable (via root).
    // So: root -> 3 -> (link to) 2, but 2 has no owner reachable from root.
    //
    // Concretely:
    //   root (0) owns 1 and 3
    //   3 has a link edge to orphan 2
    //   2 also has a "phantom" inbound from 99 (not in graph), so inboundCount(2)=1 won't trigger.
    //
    // Simplest case: two parents point to same vertex, but neither is reachable from root.
    //   root (0) -> nothing
    //   vertex A (a) -> link -> target (t)
    //   vertex B (b) -> link -> target (t)
    //   Neither a, b, nor t are reachable from root.
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [] }, // root, reachable
      { id: 'a', type: 'SOAR_ID', outEdges: [{ name: 'link', toId: 't' }] },
      { id: 'b', type: 'SOAR_ID', outEdges: [{ name: 'link', toId: 't' }] },
      { id: 't', type: 'SOAR_ID', outEdges: [] }, // target – shared → linked, NOT reachable from root
    ];
    const project = makeProject(vertices, '0');
    const index = buildIndex(vertices);

    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(project, index);
    // Both a->t and b->t are linked (inboundCount=2) and t is not reachable from root (0)
    assert.ok(
      issues.length >= 1,
      `Expected at least 1 unreachable-root issue, got ${issues.length}`
    );
    assert.ok(
      issues.every(i => i.kind === 'unreachable-root'),
      'All issues should be unreachable-root'
    );
    assert.ok(issues.every(i => i.targetVertexId === 't'));
  });

  test('does not report unreachable-root for non-linked (owned) attributes', () => {
    // Orphaned vertex with a single inbound edge: it IS dangling structurally
    // but since inboundCount == 1 it is "owned" (not linked) and the unreachable check
    // is not applied.  The dangling check also won't fire because the target exists.
    // So: no issues expected.
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'child', toId: '1' }] },
      // vertex 1 exists but is only reachable via root; that's fine
      { id: '1', type: 'SOAR_ID', outEdges: [] },
    ];
    const project = makeProject(vertices, 'orphan-root');
    // Note: root is 'orphan-root' which is NOT in the vertices list – the DFS
    // starts there, adds nothing, but vertex 0 owns 1.
    // vertex 0 has inboundCount 0 (nobody points to it from root). Yet 1 is
    // owned by 0 (inboundCount 1) so the unreachable check is skipped.
    const index = buildIndex(vertices);

    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(project, index);
    // The only issue could be from vertex 0 itself being inaccessible, but we
    // only flag targets that are *linked* (inboundCount > 1), so nothing is flagged.
    assert.strictEqual(issues.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Integration-level tests (ProjectLoader + DatamapMetadataCache)
// ---------------------------------------------------------------------------

suite('DatamapIntegrityCheck – integration', () => {
  test('returns no issues for a clean project', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-integrity-clean-'));
    const project = makeProject([
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'state', toId: '1' }] },
      { id: '1', type: 'SOAR_ID', outEdges: [] },
    ]);
    const projectFile = await writeProjectFile(dir, project);

    const context = await loadDatamapContext(projectFile);
    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(
      context.project,
      context.datamapIndex
    );

    assert.strictEqual(issues.length, 0);
  });

  test('reports dangling attribute via ProjectLoader + DatamapMetadataCache', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-integrity-dangle-'));
    const project = makeProject([
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'ghost', toId: 'deleted-vertex' }] },
    ]);
    const projectFile = await writeProjectFile(dir, project);

    const context = await loadDatamapContext(projectFile);
    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(
      context.project,
      context.datamapIndex
    );

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].kind, 'dangling');
    assert.strictEqual(issues[0].attributeName, 'ghost');
  });

  test('reports unreachable-root linked attribute via ProjectLoader + DatamapMetadataCache', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-integrity-unreach-'));
    const project = makeProject([
      { id: '0', type: 'SOAR_ID', outEdges: [] }, // root – no children
      { id: 'p1', type: 'SOAR_ID', outEdges: [{ name: 'ref', toId: 'shared' }] },
      { id: 'p2', type: 'SOAR_ID', outEdges: [{ name: 'ref', toId: 'shared' }] },
      { id: 'shared', type: 'SOAR_ID', outEdges: [] },
    ]);
    const projectFile = await writeProjectFile(dir, project);

    const context = await loadDatamapContext(projectFile);
    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(
      context.project,
      context.datamapIndex
    );

    assert.ok(issues.length >= 1, 'Expected at least one issue');
    assert.ok(issues.every(i => i.kind === 'unreachable-root'));
    assert.ok(issues.every(i => i.targetVertexId === 'shared'));
  });

  test('datamap is clean after integrity check on a project with a dangling edge', async () => {
    // Verifies the check is read-only and does not mutate the project
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-integrity-readonly-'));
    const project = makeProject([
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'broken', toId: 'gone' }] },
    ]);
    const projectFile = await writeProjectFile(dir, project);

    const context = await loadDatamapContext(projectFile);
    DatamapMetadataCache.checkLinkedAttributeIntegrity(context.project, context.datamapIndex);

    // Re-read from disk – file should be unchanged
    const onDisk = JSON.parse(
      await fs.promises.readFile(projectFile, 'utf-8')
    ) as VisualSoarProject;
    assert.strictEqual(onDisk.datamap.vertices[0].id, '0');
    assert.ok(Array.isArray(onDisk.datamap.vertices), 'vertices should still be an array');
  });
});

// ---------------------------------------------------------------------------
// Delete-cleans-up-links tests (DatamapOperations.deleteAttributeCore)
// ---------------------------------------------------------------------------

suite('DatamapOperations – deleteAttributeCore cleans up dangling link edges', () => {
  /**
   * Topology:
   *   root (0) --[owned]--> state (1) --[owned]--> child (2)
   *                    \--[link]----> child (2)   ← second inbound on child
   *
   * Deleting the owned edge (0→1) should:
   *  - remove vertex 1 and 2 (the owned subtree)
   *  - remove the link edge on 0 that pointed to 2 (now dangling)
   * After deletion the datamap should contain only the root vertex.
   */
  test('deleting an owned vertex removes dangling link edges pointing into its subtree', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-del-link-'));
    const project = makeProject([
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'state', toId: '1' },
          { name: 'quick-ref', toId: '2' }, // link to child inside the subtree
        ],
      },
      {
        id: '1',
        type: 'SOAR_ID',
        outEdges: [{ name: 'child', toId: '2' }],
      },
      { id: '2', type: 'SOAR_ID', outEdges: [] },
    ]);
    const projectFile = await writeProjectFile(dir, project);

    const context = await loadDatamapContext(projectFile);
    // Delete the owned 'state' edge from vertex 0
    await DatamapOperations.deleteAttributeCore(context, '0', 'state');

    // Re-read the saved file
    const saved = JSON.parse(await fs.promises.readFile(projectFile, 'utf-8')) as {
      datamap: {
        vertices: Array<{ id: string; outEdges?: Array<{ name: string; toId: string }> }>;
      };
    };

    // Only the root should remain
    assert.deepStrictEqual(
      saved.datamap.vertices.map(v => v.id).sort(),
      ['0'],
      'Vertices 1 and 2 should have been removed'
    );

    // Root should have no outEdges at all (the dangling link was cleaned up)
    const root = saved.datamap.vertices.find(v => v.id === '0');
    assert.ok(root, 'Root vertex must still exist');
    const remaining = (root?.outEdges ?? []).map(e => e.name);
    assert.ok(
      !remaining.includes('quick-ref'),
      `Dangling link edge 'quick-ref' should have been removed, but found edges: ${remaining.join(', ')}`
    );
  });

  /**
   * Topology:
   *   root (0) --[owned]--> A (1)
   *             --[owned]--> B (2) --[link]--> A (1)
   *
   * Deleting the owned edge 0→A should remove vertex A and also remove B's
   * link edge that pointed to A.
   */
  test('link edges on sibling vertices are removed when their target is deleted', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-del-sibling-link-'));
    const project = makeProject([
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'A', toId: '1' },
          { name: 'B', toId: '2' },
        ],
      },
      { id: '1', type: 'SOAR_ID', outEdges: [] }, // vertex A
      {
        id: '2',
        type: 'SOAR_ID',
        outEdges: [{ name: 'link-to-A', toId: '1' }], // vertex B links to A
      },
    ]);
    const projectFile = await writeProjectFile(dir, project);

    const context = await loadDatamapContext(projectFile);
    await DatamapOperations.deleteAttributeCore(context, '0', 'A');

    const saved = JSON.parse(await fs.promises.readFile(projectFile, 'utf-8')) as {
      datamap: { vertices: Array<{ id: string; outEdges?: Array<{ toId: string }> }> };
    };

    // Vertex A should be gone
    assert.ok(
      !saved.datamap.vertices.some(v => v.id === '1'),
      'Vertex A (id=1) should have been deleted'
    );

    // Vertex B's link-to-A edge should be gone
    const vertexB = saved.datamap.vertices.find(v => v.id === '2');
    assert.ok(vertexB, 'Vertex B should still exist');
    assert.deepStrictEqual(
      vertexB?.outEdges ?? [],
      [],
      "Vertex B's link-to-A edge should have been removed"
    );

    // No integrity issues should remain
    const cleanContext = await loadDatamapContext(projectFile);
    const integrityIssues = DatamapMetadataCache.checkLinkedAttributeIntegrity(
      cleanContext.project,
      cleanContext.datamapIndex
    );
    assert.strictEqual(
      integrityIssues.length,
      0,
      `Expected no integrity issues after deletion, got: ${JSON.stringify(integrityIssues)}`
    );
  });

  /**
   * Deleting a *link* edge (removeLinkOnly=true) should not affect anything
   * other than the single edge being removed.
   */
  test('removing a link-only edge leaves the target and other edges intact', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-del-linkonly-'));
    const project = makeProject([
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'state', toId: '1' },
          { name: 'alias', toId: '1' }, // link
        ],
      },
      { id: '1', type: 'SOAR_ID', outEdges: [] },
    ]);
    const projectFile = await writeProjectFile(dir, project);

    const context = await loadDatamapContext(projectFile);
    const result = await DatamapOperations.deleteAttributeCore(context, '0', 'alias', true);

    assert.strictEqual(result.removedAsLinkOnly, true);

    const saved = JSON.parse(await fs.promises.readFile(projectFile, 'utf-8')) as {
      datamap: { vertices: Array<{ id: string; outEdges?: Array<{ name: string }> }> };
    };

    // Both vertices must still be present
    assert.ok(
      saved.datamap.vertices.some(v => v.id === '1'),
      'Target vertex should still exist'
    );

    // Root should still have the 'state' edge but not 'alias'
    const root = saved.datamap.vertices.find(v => v.id === '0');
    const edgeNames = (root?.outEdges ?? []).map(e => e.name);
    assert.ok(edgeNames.includes('state'), "'state' edge should still exist");
    assert.ok(!edgeNames.includes('alias'), "'alias' link edge should have been removed");
  });
});
