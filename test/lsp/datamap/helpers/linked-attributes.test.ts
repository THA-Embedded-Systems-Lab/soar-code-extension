/**
 * Linked Attribute Owner Stability Tests
 *
 * These tests document the EXPECTED (correct) behavior for linked attribute
 * ownership classification. Tests marked "WILL FAIL" expose a known bug in
 * DatamapMetadataCache.buildOwnershipMap():
 *
 * Root cause: the method uses a LIFO stack (stack.pop()). When stateB is a
 * sibling of stateA and a link from stateB → sharedVertex is added, stateB
 * is pushed after stateA and therefore popped first, making stateB the owner
 * of sharedVertex even though it was originally created under stateA. This
 * flips the isLink flag on both edges.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatamapMetadataCache } from '../../../../src/datamap/datamapMetadata';
import { SoarMcpCore } from '../../../../src/mcp/soarMcpCore';
import {
  DMVertex,
  SoarIdVertex,
  VisualSoarProject,
} from '../../../../src/server/visualSoarProject';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDatmapIndex(vertices: DMVertex[]): Map<string, DMVertex> {
  const index = new Map<string, DMVertex>();
  for (const v of vertices) {
    index.set(v.id, v);
  }
  return index;
}

/**
 * Minimal in-memory VisualSoarProject with the given vertices.
 * The first vertex is assumed to be root.
 */
function makeProject(
  rootId: string,
  vertices: DMVertex[]
): { project: VisualSoarProject; datamapIndex: Map<string, DMVertex> } {
  const project: VisualSoarProject = {
    version: '6',
    datamap: { rootId, vertices },
    layout: {
      id: 'root',
      type: 'OPERATOR_ROOT',
      name: 'agent',
      folder: 'agent',
      children: [],
    },
  };
  return { project, datamapIndex: buildDatmapIndex(vertices) };
}

/** Write a minimal project JSON to a temp directory and return the file path. */
async function writeTempProject(projectData: object): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-linked-attr-'));
  const projectFile = path.join(dir, 'agent.vsa.json');
  await fs.promises.writeFile(projectFile, JSON.stringify(projectData, null, 2), 'utf-8');
  return projectFile;
}

/** Build a reusable two-state project JSON: root → stateA → shared, root → stateB */
function twoStateProjectData(sharedId: string, stateAId: string, stateBId: string) {
  return {
    version: '6',
    datamap: {
      rootId: '0',
      vertices: [
        {
          id: '0',
          type: 'SOAR_ID',
          outEdges: [
            { name: 'state-a', toId: stateAId },
            { name: 'state-b', toId: stateBId },
          ],
        },
        { id: stateAId, type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: sharedId }] },
        { id: stateBId, type: 'SOAR_ID', outEdges: [] },
        { id: sharedId, type: 'SOAR_ID', outEdges: [] },
      ],
    },
    layout: {
      id: 'root',
      type: 'OPERATOR_ROOT',
      name: 'agent',
      folder: 'agent',
      children: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Suite 1: DatamapMetadataCache unit tests (no file I/O)
// ---------------------------------------------------------------------------

suite('DatamapMetadataCache – Linked Attribute Ownership', () => {
  test('single parent edge is not a link', () => {
    // root → A → V
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'a', toId: '1' }] },
      { id: '1', type: 'SOAR_ID', outEdges: [{ name: 'v', toId: '2' }] },
      { id: '2', type: 'SOAR_ID', outEdges: [] },
    ];
    const { project, datamapIndex } = makeProject('0', vertices);
    const cache = DatamapMetadataCache.build(project, datamapIndex);

    const meta = cache.getEdgeMetadata('1', 'v', '2');
    assert.ok(meta, 'edge metadata should exist');
    assert.strictEqual(meta!.isLink, false, 'single parent edge should not be a link');
    assert.strictEqual(meta!.inboundCount, 1, 'inboundCount should be 1');
  });

  test('original owner edge stays non-linked after sibling link is added', () => {
    // root → stateA → shared
    // root → stateB → shared  ← link (stateA created shared first)
    //
    // EXPECTED: stateA's edge has isLink=false, stateB's edge has isLink=true.
    // CURRENTLY FAILS because DFS visits stateB before stateA (LIFO stack),
    // assigning ownership of "shared" to stateB instead of stateA.
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'state-a', toId: '1' },
          { name: 'state-b', toId: '2' },
        ],
      },
      { id: '1', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '3' }] },
      { id: '2', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '3' }] },
      { id: '3', type: 'SOAR_ID', outEdges: [] },
    ];
    const { project, datamapIndex } = makeProject('0', vertices);
    const cache = DatamapMetadataCache.build(project, datamapIndex);

    const ownerMeta = cache.getEdgeMetadata('1', 'shared', '3');
    const linkMeta = cache.getEdgeMetadata('2', 'shared', '3');

    assert.ok(ownerMeta, 'stateA edge metadata should exist');
    assert.ok(linkMeta, 'stateB edge metadata should exist');

    assert.strictEqual(
      ownerMeta!.isLink,
      false,
      'stateA (original creator) edge should NOT be a link'
    );
    assert.strictEqual(linkMeta!.isLink, true, 'stateB (sibling linker) edge should be a link');
  });

  test('inboundCount is 2 when two parents share a vertex', () => {
    // root → stateA → shared
    // root → stateB → shared
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'state-a', toId: '1' },
          { name: 'state-b', toId: '2' },
        ],
      },
      { id: '1', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '3' }] },
      { id: '2', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '3' }] },
      { id: '3', type: 'SOAR_ID', outEdges: [] },
    ];
    const { project, datamapIndex } = makeProject('0', vertices);
    const cache = DatamapMetadataCache.build(project, datamapIndex);

    const ownerMeta = cache.getEdgeMetadata('1', 'shared', '3');
    const linkMeta = cache.getEdgeMetadata('2', 'shared', '3');

    assert.ok(ownerMeta, 'stateA edge metadata should exist');
    assert.ok(linkMeta, 'stateB edge metadata should exist');

    assert.strictEqual(ownerMeta!.inboundCount, 2, 'stateA edge inboundCount should be 2');
    assert.strictEqual(linkMeta!.inboundCount, 2, 'stateB edge inboundCount should be 2');
  });

  test('three-way sharing: first-declared parent stays the owner', () => {
    // root → stateA → shared  (stateA is first in root.outEdges → should own shared)
    // root → stateB → shared  (link)
    // root → stateC → shared  (link)
    //
    // CURRENTLY FAILS due to LIFO traversal order: stateC is pushed last,
    // popped first, and takes ownership of shared.
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'state-a', toId: '1' },
          { name: 'state-b', toId: '2' },
          { name: 'state-c', toId: '3' },
        ],
      },
      { id: '1', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '4' }] },
      { id: '2', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '4' }] },
      { id: '3', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '4' }] },
      { id: '4', type: 'SOAR_ID', outEdges: [] },
    ];
    const { project, datamapIndex } = makeProject('0', vertices);
    const cache = DatamapMetadataCache.build(project, datamapIndex);

    const metaA = cache.getEdgeMetadata('1', 'shared', '4');
    const metaB = cache.getEdgeMetadata('2', 'shared', '4');
    const metaC = cache.getEdgeMetadata('3', 'shared', '4');

    assert.ok(metaA && metaB && metaC, 'all three edge metadata should exist');

    assert.strictEqual(metaA!.isLink, false, 'stateA (first declared) edge should NOT be a link');
    assert.strictEqual(metaB!.isLink, true, 'stateB edge should be a link');
    assert.strictEqual(metaC!.isLink, true, 'stateC edge should be a link');
  });

  test('mutual link (cycle) uses isCycle not isLink', () => {
    // root → A → B and B → A  (mutual reference = cycle)
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'a', toId: '1' }] },
      { id: '1', type: 'SOAR_ID', outEdges: [{ name: 'b', toId: '2' }] },
      { id: '2', type: 'SOAR_ID', outEdges: [{ name: 'a', toId: '1' }] },
    ];
    const { project, datamapIndex } = makeProject('0', vertices);
    const cache = DatamapMetadataCache.build(project, datamapIndex);

    // A → B edge
    const metaAB = cache.getEdgeMetadata('1', 'b', '2');
    // B → A edge
    const metaBA = cache.getEdgeMetadata('2', 'a', '1');

    assert.ok(metaAB, 'A→B edge metadata should exist');
    assert.ok(metaBA, 'B→A edge metadata should exist');

    // Both edges are part of a mutual cycle; neither should appear as a "link"
    assert.strictEqual(metaAB!.isCycle, true, 'A→B should be flagged as a cycle');
    assert.strictEqual(metaBA!.isCycle, true, 'B→A should be flagged as a cycle');
    assert.strictEqual(metaAB!.isLink, false, 'cycle edges should not be isLink');
    assert.strictEqual(metaBA!.isLink, false, 'cycle edges should not be isLink');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: SoarMcpCore.getDatamap – linked flag integration tests
// ---------------------------------------------------------------------------

suite('SoarMcpCore – createLinkedAttribute / getDatamap linked flag', () => {
  const core = new SoarMcpCore();

  test('getDatamap reports linked: false for a normal (non-shared) attribute', async () => {
    const projectFile = await writeTempProject({
      version: '6',
      datamap: {
        rootId: '0',
        vertices: [
          { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'state-a', toId: '1' }] },
          { id: '1', type: 'SOAR_ID', outEdges: [{ name: 'shared', toId: '2' }] },
          { id: '2', type: 'SOAR_ID', outEdges: [] },
        ],
      },
      layout: { id: 'root', type: 'OPERATOR_ROOT', name: 'agent', folder: 'agent', children: [] },
    });

    const result = await core.getDatamap({ projectFile, rootVertexId: '1' });
    const sharedAttr = result.root.attributes?.find((a: any) => a.name === 'shared');

    assert.ok(sharedAttr, '"shared" attribute should exist in tree');
    assert.strictEqual(sharedAttr.linked, false, 'normal attribute should not be linked');
  });

  test('original owner edge is linked: false after createLinkedAttribute from sibling', async () => {
    // Setup: root → stateA → shared, root → stateB
    // Action: createLinkedAttribute(stateB → shared)
    // Expected: stateA's "shared" edge has linked: false
    //
    // CURRENTLY FAILS because createLinkedAttribute causes stateB to become
    // the owner (DFS traversal visits stateB first after the new edge is saved).
    const projectFile = await writeTempProject(twoStateProjectData('3', '1', '2'));

    await core.createLinkedAttribute({
      projectFile,
      parentVertexId: '2',
      attributeName: 'shared',
      targetVertexId: '3',
    });

    const result = await core.getDatamap({ projectFile, rootVertexId: '1' });
    const sharedAttr = result.root.attributes?.find((a: any) => a.name === 'shared');

    assert.ok(sharedAttr, '"shared" attribute should still exist under stateA');
    assert.strictEqual(
      sharedAttr.linked,
      false,
      'stateA (original creator) edge should NOT be linked after creating sibling link'
    );
  });

  test('new linked edge is linked: true after createLinkedAttribute from sibling', async () => {
    // Same setup as above but verifying stateB's view.
    //
    // CURRENTLY FAILS due to the same ownership inversion bug.
    const projectFile = await writeTempProject(twoStateProjectData('3', '1', '2'));

    await core.createLinkedAttribute({
      projectFile,
      parentVertexId: '2',
      attributeName: 'shared',
      targetVertexId: '3',
    });

    const result = await core.getDatamap({ projectFile, rootVertexId: '2' });
    const sharedAttr = result.root.attributes?.find((a: any) => a.name === 'shared');

    assert.ok(sharedAttr, '"shared" attribute should exist under stateB');
    assert.strictEqual(
      sharedAttr.linked,
      true,
      'stateB (sibling linker) edge should be marked as linked'
    );
  });

  test('deleteAttribute with removeLinkOnly keeps the shared target vertex', async () => {
    const projectFile = await writeTempProject(twoStateProjectData('3', '1', '2'));

    // Add the link
    await core.createLinkedAttribute({
      projectFile,
      parentVertexId: '2',
      attributeName: 'shared',
      targetVertexId: '3',
    });

    // Remove only the link edge from stateB
    await core.deleteAttribute({
      projectFile,
      parentVertexId: '2',
      attributeName: 'shared',
      removeLinkOnly: true,
    });

    // stateA's "shared" attribute and the target vertex should still be there
    const result = await core.getDatamap({ projectFile, rootVertexId: '1' });
    const sharedAttr = result.root.attributes?.find((a: any) => a.name === 'shared');

    assert.ok(sharedAttr, '"shared" attribute should still exist under stateA after link removal');
  });

  test('deleteAttribute without removeLinkOnly keeps target when multiple parents share it', async () => {
    const projectFile = await writeTempProject(twoStateProjectData('3', '1', '2'));

    // Add the link so vertex '3' has two parents (stateA and stateB)
    await core.createLinkedAttribute({
      projectFile,
      parentVertexId: '2',
      attributeName: 'shared',
      targetVertexId: '3',
    });

    // Now delete stateB's edge without specifying removeLinkOnly.
    // Because vertex '3' still has stateA as a parent, deleteAttribute should
    // NOT remove vertex '3'.
    await core.deleteAttribute({
      projectFile,
      parentVertexId: '2',
      attributeName: 'shared',
    });

    const result = await core.getDatamap({ projectFile, rootVertexId: '1' });
    const sharedAttr = result.root.attributes?.find((a: any) => a.name === 'shared');

    assert.ok(
      sharedAttr,
      '"shared" attribute on stateA should survive after deleting only the sibling link'
    );
  });
});
