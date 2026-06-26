/**
 * Inline high-level-operator substate expansion tests
 *
 * Verifies the `soar.datamap.expandHighLevelOperators` setting:
 * - off (default, VisualSoar-compatible): operator vertices do NOT expose their
 *   substate datamap inline
 * - on: the substate datamap of a high-level operator appears as a child of its
 *   operator vertex, making the full datamap reachable without switching root
 */

import * as assert from 'assert';
import * as path from 'path';
import { DatamapTreeProvider, DatamapTreeItem } from '../../../../src/datamap/datamapTreeProvider';

const FIXTURE = path.resolve(
  __dirname,
  '../../../Substate-operator-project/substate-operator-agent.vsa.json'
);

// The high-level operator in the fixture and its substate datamap root id.
const HL_OPERATOR_NAME = 'sub-operator-with-child';
const SUBSTATE_ROOT_ID = 'f0ba243b42944ffdb49b0d556c40b393';

function setSetting(value: boolean): void {
  (global as any).vscode.workspace.__config['datamap.expandHighLevelOperators'] = value;
}

async function children(
  provider: DatamapTreeProvider,
  element?: DatamapTreeItem
): Promise<DatamapTreeItem[]> {
  return (await provider.getChildren(element)) as DatamapTreeItem[];
}

/** Find the operator vertex item for the high-level operator under the root. */
async function findHighLevelOperatorItem(provider: DatamapTreeProvider): Promise<DatamapTreeItem> {
  const [root] = await children(provider);
  const topLevel = await children(provider, root);
  const opItem = topLevel.find(
    item =>
      item.edgeName === 'operator' &&
      typeof item.description === 'string' &&
      item.description.includes(HL_OPERATOR_NAME)
  );
  assert.ok(opItem, 'expected an operator child for the high-level operator');
  return opItem!;
}

suite('Datamap inline substate expansion', () => {
  teardown(() => setSetting(false));

  test('off by default: operator vertex does not expose substate datamap inline', async () => {
    setSetting(false);
    const provider = new DatamapTreeProvider();
    await provider.loadProjectFromFile(FIXTURE);

    const opItem = await findHighLevelOperatorItem(provider);
    const opChildren = await children(provider, opItem);

    assert.ok(
      !opChildren.some(c => c.vertexId === SUBSTATE_ROOT_ID),
      'substate root must not appear inline when the setting is off'
    );
  });

  test('on: substate datamap appears inline under the operator vertex', async () => {
    setSetting(true);
    const provider = new DatamapTreeProvider();
    await provider.loadProjectFromFile(FIXTURE);

    const opItem = await findHighLevelOperatorItem(provider);
    const opChildren = await children(provider, opItem);

    const substateItem = opChildren.find(c => c.vertexId === SUBSTATE_ROOT_ID);
    assert.ok(substateItem, 'substate root should appear inline when the setting is on');
    assert.strictEqual(substateItem!.label, `${HL_OPERATOR_NAME} (substate)`);

    // The substate datamap should be navigable (its own attributes are reachable).
    const substateChildren = await children(provider, substateItem);
    assert.ok(
      substateChildren.some(c => c.edgeName === 'superstate'),
      'substate datamap should expose its own attributes (e.g. ^superstate)'
    );
  });

  test('on: back-references into ancestors are marked as cycles, not infinitely expanded', async () => {
    setSetting(true);
    const provider = new DatamapTreeProvider();
    await provider.loadProjectFromFile(FIXTURE);

    const opItem = await findHighLevelOperatorItem(provider);
    const [substateItem] = (await children(provider, opItem)).filter(
      c => c.vertexId === SUBSTATE_ROOT_ID
    );
    const substateChildren = await children(provider, substateItem);

    // ^top-state points back to the top-state root, which is an ancestor.
    const topStateEdge = substateChildren.find(c => c.edgeName === 'top-state');
    assert.ok(topStateEdge, 'expected a ^top-state edge in the substate');
    assert.ok(
      topStateEdge!.label.includes('(cycle)'),
      'ancestor back-reference should be flagged as a cycle'
    );
  });
});
