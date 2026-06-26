/**
 * Tests for operator rename/datamap sync, duplicate-name detection,
 * drag-and-drop move, and the operator/datamap verification step.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectCreator } from '../../src/layout/projectCreator';
import { ProjectLoader } from '../../src/server/projectLoader';
import { LayoutOperations } from '../../src/layout/layoutOperations';
import { ProjectContext, LayoutNode } from '../../src/server/visualSoarProject';

suite('LayoutOperations - rename sync, duplicates, move, verification', () => {
  const testDir = path.join(__dirname, '../../test-output/layout-move-rename');
  const agentName = 'MoveRenameAgent';
  let projectFilePath: string;
  let projectPath: string;
  let projectContext: ProjectContext;

  async function reload(): Promise<void> {
    projectContext = await new ProjectLoader().loadProject(projectFilePath);
  }

  /** Recursively find the absolute path of a file by basename, or null. */
  function findFileAbs(basename: string, dir: string = projectPath): string | null {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFileAbs(basename, full);
        if (found) {
          return found;
        }
      } else if (entry.name === basename) {
        return full;
      }
    }
    return null;
  }

  function findNode(
    name: string,
    node: LayoutNode = projectContext.project.layout
  ): LayoutNode | null {
    if ('name' in node && node.name === name) {
      return node;
    }
    if ('children' in node && node.children) {
      for (const child of node.children) {
        const found = findNode(name, child);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /** Collect operator-name enumeration values reachable from a state vertex. */
  function operatorNamesInState(stateVertexId: string): string[] {
    const names: string[] = [];
    const state = projectContext.datamapIndex.get(stateVertexId);
    if (!state || state.type !== 'SOAR_ID' || !state.outEdges) {
      return names;
    }
    for (const edge of state.outEdges) {
      if (edge.name !== 'operator') {
        continue;
      }
      const op = projectContext.datamapIndex.get(edge.toId);
      if (op && op.type === 'SOAR_ID' && op.outEdges) {
        const nameEdge = op.outEdges.find(e => e.name === 'name');
        const nameVertex = nameEdge ? projectContext.datamapIndex.get(nameEdge.toId) : undefined;
        if (nameVertex && nameVertex.type === 'ENUMERATION') {
          names.push(...nameVertex.choices);
        }
      }
    }
    return names;
  }

  setup(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    await fs.promises.mkdir(testDir, { recursive: true });
    projectFilePath = await ProjectCreator.createProject({ directory: testDir, agentName });
    projectPath = path.dirname(projectFilePath);
    await reload();
  });

  teardown(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  test('renameNodeCore renames an operator, its file, and its datamap name', async () => {
    const rootId = projectContext.project.layout.id;
    const add = await LayoutOperations.addOperatorInternal(projectContext, rootId, 'foo');
    assert.ok(add.success);
    await reload();

    const rootDmId = projectContext.project.datamap.rootId;
    assert.ok(operatorNamesInState(rootDmId).includes('foo'), 'datamap should have operator foo');
    assert.ok(findFileAbs('foo.soar'), 'foo.soar should exist');

    const fooNode = findNode('foo')!;
    const result = await LayoutOperations.renameNodeCore(projectContext, fooNode.id, 'bar');
    assert.ok(result.success, `rename should succeed: ${result.error}`);
    await reload();

    // Layout
    assert.ok(findNode('bar'), 'renamed operator should exist as bar');
    assert.ok(!findNode('foo'), 'old name foo should be gone');
    // Files
    assert.ok(findFileAbs('bar.soar'), 'bar.soar should exist');
    assert.ok(!findFileAbs('foo.soar'), 'foo.soar should be gone');
    // Datamap
    const names = operatorNamesInState(projectContext.project.datamap.rootId);
    assert.ok(names.includes('bar'), 'datamap operator should be renamed to bar');
    assert.ok(!names.includes('foo'), 'datamap should no longer reference foo');
  });

  test('renameNodeCore rejects a collision with a sibling name', async () => {
    const rootId = projectContext.project.layout.id;
    await LayoutOperations.addOperatorInternal(projectContext, rootId, 'alpha');
    await LayoutOperations.addOperatorInternal(projectContext, rootId, 'beta');
    await reload();

    const alpha = findNode('alpha')!;
    const result = await LayoutOperations.renameNodeCore(projectContext, alpha.id, 'beta');
    assert.ok(!result.success, 'rename onto an existing sibling name should fail');
    assert.match(result.error || '', /already exists/i);
  });

  test('adding an operator with an existing name fails with a clear reason', async () => {
    const rootId = projectContext.project.layout.id;
    const first = await LayoutOperations.addOperatorInternal(projectContext, rootId, 'dup');
    assert.ok(first.success);
    await reload();

    const second = await LayoutOperations.addOperatorInternal(projectContext, rootId, 'dup');
    assert.ok(!second.success, 'duplicate operator add should fail');
    assert.match(second.error || '', /already exists/i);
  });

  test('adding a folder with an existing name fails with a clear reason', async () => {
    const rootId = projectContext.project.layout.id;
    const first = await LayoutOperations.addFolderInternal(projectContext, rootId, 'shared');
    assert.ok(first.success);
    await reload();

    const second = await LayoutOperations.addFolderInternal(projectContext, rootId, 'shared');
    assert.ok(!second.success, 'duplicate folder add should fail');
    assert.match(second.error || '', /already exists/i);
  });

  test('moveNode moves an operator into another operator (full move)', async () => {
    const rootId = projectContext.project.layout.id;
    await LayoutOperations.addOperatorInternal(projectContext, rootId, 'parentop');
    await LayoutOperations.addOperatorInternal(projectContext, rootId, 'childop');
    await reload();

    const parentop = findNode('parentop')!;
    const childop = findNode('childop')!;
    const childBefore = findFileAbs('childop.soar');
    assert.ok(
      childBefore && !childBefore.includes(`${path.sep}parentop${path.sep}`),
      'childop.soar not yet under parentop'
    );
    assert.ok(
      operatorNamesInState(projectContext.project.datamap.rootId).includes('childop'),
      'childop in root datamap before move'
    );

    const result = await LayoutOperations.moveNode(projectContext, childop.id, parentop.id);
    assert.ok(result.success, `move should succeed: ${result.error}`);
    await reload();

    // Target converted to high-level operator and now contains childop
    const newParent = findNode('parentop')!;
    assert.strictEqual(newParent.type, 'HIGH_LEVEL_OPERATOR', 'parentop should become high-level');
    assert.ok(
      'children' in newParent && newParent.children?.some(c => 'name' in c && c.name === 'childop'),
      'childop should now be a child of parentop'
    );

    // File moved on disk into the parentop folder
    const childAfter = findFileAbs('childop.soar');
    assert.ok(childAfter, 'childop.soar should still exist after move');
    assert.ok(
      childAfter!.includes(`${path.sep}parentop${path.sep}`),
      'childop.soar should move into parentop/'
    );

    // Datamap edge re-parented: out of root, into parentop substate
    assert.ok(
      !operatorNamesInState(projectContext.project.datamap.rootId).includes('childop'),
      'childop should be gone from root datamap'
    );
    const substateId = (newParent as any).dmId;
    assert.ok(
      operatorNamesInState(substateId).includes('childop'),
      'childop should be in parentop substate datamap'
    );
  });

  test('moveNode rejects moving a node into its own descendant', async () => {
    const rootId = projectContext.project.layout.id;
    await LayoutOperations.addOperatorInternal(projectContext, rootId, 'outer');
    await reload();
    const outer = findNode('outer')!;
    await LayoutOperations.addOperatorInternal(projectContext, outer.id, 'inner');
    await reload();

    const outerNode = findNode('outer')!;
    const innerNode = findNode('inner')!;
    const result = await LayoutOperations.moveNode(projectContext, outerNode.id, innerNode.id);
    assert.ok(!result.success, 'moving a node into its own descendant should fail');
  });

  test('checkOperatorDatamapSync passes when in sync and flags drift', async () => {
    const rootId = projectContext.project.layout.id;
    await LayoutOperations.addOperatorInternal(projectContext, rootId, 'sync-op');
    await reload();

    assert.deepStrictEqual(
      LayoutOperations.checkOperatorDatamapSync(projectContext),
      [],
      'freshly added operator should be in sync'
    );

    // Introduce drift: change the datamap name enum out from under the layout
    const rootDmId = projectContext.project.datamap.rootId;
    const state = projectContext.datamapIndex.get(rootDmId) as any;
    for (const edge of state.outEdges) {
      if (edge.name === 'operator') {
        const op = projectContext.datamapIndex.get(edge.toId) as any;
        const nameEdge = op.outEdges.find((e: any) => e.name === 'name');
        const nameVertex = projectContext.datamapIndex.get(nameEdge.toId) as any;
        if (nameVertex.choices.includes('sync-op')) {
          nameVertex.choices = ['renamed-in-datamap'];
        }
      }
    }

    const issues = LayoutOperations.checkOperatorDatamapSync(projectContext);
    assert.strictEqual(issues.length, 1, 'should detect one out-of-sync operator');
    assert.strictEqual(issues[0].nodeName, 'sync-op');
  });
});
