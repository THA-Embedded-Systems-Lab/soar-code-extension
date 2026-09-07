/**
 * Stale / unused datamap item detection (DatamapUsageAnalyzer).
 *
 * A "stale" datamap item is an attribute edge in the project datamap whose name
 * is never tested (LHS) or created (RHS) by any production in any project Soar
 * file. Architectural attributes (superstate, io, operator, name, ...) are
 * exempt.
 */

import * as assert from 'assert';
import { DatamapUsageAnalyzer } from '../../../../src/datamap/datamapUsage';
import { SoarParser } from '../../../../src/server/soarParser';
import { DMVertex, VisualSoarProject } from '../../../../src/server/visualSoarProject';
import { SoarDocument } from '../../../../src/server/soarTypes';

function makeProject(vertices: DMVertex[], rootId = '0'): VisualSoarProject {
  return {
    version: '6',
    datamap: { rootId, vertices },
    layout: { id: 'root', type: 'OPERATOR_ROOT', name: 'root', folder: '.', children: [] },
  };
}

function buildIndex(vertices: DMVertex[]): Map<string, DMVertex> {
  const index = new Map<string, DMVertex>();
  for (const v of vertices) {
    index.set(v.id, v);
  }
  return index;
}

const parser = new SoarParser();
function parse(...sources: string[]): SoarDocument[] {
  return sources.map((src, i) => parser.parse(`f${i}.soar`, src, 0));
}

suite('DatamapUsageAnalyzer – findStaleDatamapItems', () => {
  test('flags a datamap attribute referenced by no production', () => {
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'name', toId: 'n' },
          { name: 'used-attr', toId: '1' },
          { name: 'orphan-attr', toId: '2' },
        ],
      },
      { id: 'n', type: 'ENUMERATION', choices: ['top'] },
      { id: '1', type: 'STRING' },
      { id: '2', type: 'STRING' },
    ];
    const project = makeProject(vertices);
    const docs = parse(`sp {p
   (state <s> ^name top ^used-attr <x>)
-->
   (<s> ^used-attr done)
}`);

    const stale = DatamapUsageAnalyzer.findStaleDatamapItems(project, buildIndex(vertices), docs);
    assert.strictEqual(stale.length, 1);
    assert.strictEqual(stale[0].attributeName, 'orphan-attr');
    assert.strictEqual(stale[0].parentVertexId, '0');
    assert.strictEqual(stale[0].path, 'orphan-attr');
  });

  test('does not flag attributes reached through a dotted path', () => {
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [{ name: 'io', toId: 'io' }],
      },
      { id: 'io', type: 'SOAR_ID', outEdges: [{ name: 'input-link', toId: 'il' }] },
      { id: 'il', type: 'SOAR_ID', outEdges: [{ name: 'thing', toId: 't' }] },
      { id: 't', type: 'STRING' },
    ];
    const project = makeProject(vertices);
    const docs = parse(`sp {p
   (state <s> ^io.input-link.thing <v>)
-->
   (<s> ^io <i>)
}`);

    const stale = DatamapUsageAnalyzer.findStaleDatamapItems(project, buildIndex(vertices), docs);
    assert.strictEqual(stale.length, 0, JSON.stringify(stale));
  });

  test('exempts architectural attributes even when unreferenced', () => {
    const vertices: DMVertex[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'superstate', toId: 's' },
          { name: 'type', toId: 'ty' },
          { name: 'operator', toId: 'op' },
        ],
      },
      { id: 's', type: 'ENUMERATION', choices: ['nil'] },
      { id: 'ty', type: 'ENUMERATION', choices: ['state'] },
      { id: 'op', type: 'SOAR_ID', outEdges: [] },
    ];
    const project = makeProject(vertices);

    const stale = DatamapUsageAnalyzer.findStaleDatamapItems(
      project,
      buildIndex(vertices),
      parse()
    );
    assert.strictEqual(stale.length, 0);
  });

  test('reports a readable root path for a nested stale attribute', () => {
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'operator', toId: 'op' }] },
      { id: 'op', type: 'SOAR_ID', outEdges: [{ name: 'ghost', toId: 'g' }] },
      { id: 'g', type: 'STRING' },
    ];
    const project = makeProject(vertices);

    const stale = DatamapUsageAnalyzer.findStaleDatamapItems(
      project,
      buildIndex(vertices),
      parse()
    );
    assert.strictEqual(stale.length, 1);
    assert.strictEqual(stale[0].attributeName, 'ghost');
    assert.strictEqual(stale[0].path, 'operator.ghost');
  });

  test('does not mutate the project', () => {
    const vertices: DMVertex[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'x', toId: '1' }] },
      { id: '1', type: 'STRING' },
    ];
    const project = makeProject(vertices);
    const before = JSON.stringify(project);

    DatamapUsageAnalyzer.findStaleDatamapItems(project, buildIndex(vertices), parse());
    assert.strictEqual(JSON.stringify(project), before);
  });

  test('hasDynamicAttributeTests detects a ^<var> attribute test', () => {
    const docs = parse(`sp {p
   (state <s> ^operator <o>)
   (<o> ^<attr> <val>)
-->
   (<s> ^done +)
}`);
    assert.strictEqual(DatamapUsageAnalyzer.hasDynamicAttributeTests(docs), true);

    const plain = parse(`sp {p
   (state <s> ^operator <o>)
-->
   (<s> ^done +)
}`);
    assert.strictEqual(DatamapUsageAnalyzer.hasDynamicAttributeTests(plain), false);
  });
});
