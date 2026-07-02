/**
 * DatamapMetadataCache.getCanonicalName
 *
 * A shared/linked vertex has no name of its own in the schema — only the
 * inbound edges pointing at it have names. `getCanonicalName` must pick the
 * name of the vertex's owning edge (BFS-from-root, per `buildOwnershipMap`)
 * deterministically, not whichever inbound edge happens to be encountered
 * first by array order — renaming or reordering an unrelated linking
 * attribute must not change another attribute's displayed name.
 */

import * as assert from 'assert';
import { DatamapMetadataCache } from '../../../../src/datamap/datamapMetadata';
import { DMVertex, VisualSoarProject } from '../../../../src/server/visualSoarProject';

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

suite('DatamapMetadataCache – getCanonicalName', () => {
  test('returns the owning edge name for a vertex with a single inbound edge', () => {
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'state', toId: '1' }] },
      { id: '1', type: 'SOAR_ID', outEdges: [] },
    ];
    const project = makeProject(vertices);
    const index = buildIndex(vertices);
    const metadata = DatamapMetadataCache.build(project, index);

    assert.strictEqual(metadata.getCanonicalName('1'), 'state');
  });

  test('follows the true BFS-reachable owner, not raw vertices[] array order', () => {
    // Graph: root(0) -[a-edge]-> a -[rightname]-> t
    // Vertex 'b' also has an edge to t named 'wrongname', but b is not on
    // root's path to t at all. A naive scan over `vertices` in array order
    // would report whichever of 'wrongname'/'rightname' it hits first,
    // regardless of actual reachability — 'b' is listed before 'a' here to
    // provoke exactly that bug.
    const vertices: DMVertex[] = [
      { id: 'b', type: 'SOAR_ID', outEdges: [{ name: 'wrongname', toId: 't' }] },
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'a-edge', toId: 'a' }] },
      { id: 'a', type: 'SOAR_ID', outEdges: [{ name: 'rightname', toId: 't' }] },
      { id: 't', type: 'SOAR_ID', outEdges: [] },
    ];
    const project = makeProject(vertices, '0');
    const index = buildIndex(vertices);
    const metadata = DatamapMetadataCache.build(project, index);

    assert.strictEqual(metadata.getCanonicalName('t'), 'rightname');
  });

  test('returns undefined for the root vertex', () => {
    const vertices: DMVertex[] = [{ id: '0', type: 'SOAR_ID', outEdges: [] }];
    const project = makeProject(vertices);
    const index = buildIndex(vertices);
    const metadata = DatamapMetadataCache.build(project, index);

    assert.strictEqual(metadata.getCanonicalName('0'), undefined);
  });
});
