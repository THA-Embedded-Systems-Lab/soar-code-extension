/**
 * Stale / unused datamap item detection (DatamapUsageAnalyzer).
 *
 * A "stale" datamap item is an attribute edge in the project datamap whose name
 * is never tested (LHS) or created (RHS) by any production in any project Soar
 * file. Architectural attributes (superstate, io, operator, name, ...) are
 * exempt.
 */

import * as assert from 'assert';
import { DatamapUsageAnalyzer, DatamapUsageKind } from '../../../../src/datamap/datamapUsage.js';
import { SoarParser } from '../../../../src/server/soarParser.js';
import { DMVertex, VisualSoarProject } from '../../../../src/server/visualSoarProject.js';
import { SoarDocument } from '../../../../src/server/soarTypes.js';

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

suite('DatamapUsageAnalyzer – analyzeDatamapUsage (VisualSoar-style sweeps)', () => {
  // Datamap: root has four non-architectural attributes plus exempt ^name.
  //   both-attr     – tested AND created
  //   tested-attr   – only tested (LHS)
  //   created-attr  – only created (RHS)
  //   orphan-attr   – neither
  const vertices = (): any[] => [
    {
      id: '0',
      type: 'SOAR_ID',
      outEdges: [
        { name: 'name', toId: 'n' },
        { name: 'both-attr', toId: '1' },
        { name: 'tested-attr', toId: '2' },
        { name: 'created-attr', toId: '3' },
        { name: 'orphan-attr', toId: '4' },
      ],
    },
    { id: 'n', type: 'ENUMERATION', choices: ['top'] },
    { id: '1', type: 'STRING' },
    { id: '2', type: 'STRING' },
    { id: '3', type: 'STRING' },
    { id: '4', type: 'STRING' },
  ];

  const docs = (): ReturnType<typeof parse> =>
    parse(`sp {p
   (state <s> ^name top ^both-attr <b> ^tested-attr <t>)
-->
   (<s> ^both-attr done ^created-attr made)
}`);

  function analyze() {
    const v = vertices();
    return DatamapUsageAnalyzer.analyzeDatamapUsage(makeProject(v), buildIndex(v), docs());
  }

  const names = (items: { attributeName: string }[]) => items.map(i => i.attributeName).sort();

  test('never-tested-or-created bucket = orphan only', () => {
    assert.deepStrictEqual(names(analyze().neverTestedOrCreated), ['orphan-attr']);
  });

  test('tested-not-created bucket = tested-attr only', () => {
    assert.deepStrictEqual(names(analyze().testedNotCreated), ['tested-attr']);
  });

  test('created-not-tested bucket = created-attr only', () => {
    assert.deepStrictEqual(names(analyze().createdNotTested), ['created-attr']);
  });

  test('never-tested bucket = created-attr + orphan-attr', () => {
    assert.deepStrictEqual(names(analyze().neverTested), ['created-attr', 'orphan-attr']);
  });

  test('never-created bucket = orphan-attr + tested-attr', () => {
    assert.deepStrictEqual(names(analyze().neverCreated), ['orphan-attr', 'tested-attr']);
  });

  test('both-attr (tested and created) appears in no bucket', () => {
    const r = analyze();
    const all = [
      ...r.neverTestedOrCreated,
      ...r.testedNotCreated,
      ...r.createdNotTested,
      ...r.neverTested,
      ...r.neverCreated,
    ];
    assert.ok(!all.some(i => i.attributeName === 'both-attr'));
  });

  test('every item carries a matching kind and a message mentioning the attribute', () => {
    const r = analyze();
    const check = (
      items: { kind: DatamapUsageKind; attributeName: string; message: string }[],
      kind: DatamapUsageKind
    ) => {
      for (const item of items) {
        assert.strictEqual(item.kind, kind);
        assert.ok(item.message.includes(`^${item.attributeName}`));
      }
    };
    check(r.neverTestedOrCreated, 'never-tested-or-created');
    check(r.testedNotCreated, 'tested-not-created');
    check(r.createdNotTested, 'created-not-tested');
    check(r.neverTested, 'never-tested');
    check(r.neverCreated, 'never-created');
  });

  test('findStaleDatamapItems / findTestedNotCreatedDatamapItems wrappers match the buckets', () => {
    const v = vertices();
    const p = makeProject(v);
    const idx = buildIndex(v);
    const d = docs();
    assert.deepStrictEqual(names(DatamapUsageAnalyzer.findStaleDatamapItems(p, idx, d)), [
      'orphan-attr',
    ]);
    assert.deepStrictEqual(
      names(DatamapUsageAnalyzer.findTestedNotCreatedDatamapItems(p, idx, d)),
      ['tested-attr']
    );
  });

  test('collectAttributeUsage splits by production side; unknown side counts as both', () => {
    const usage = DatamapUsageAnalyzer.collectAttributeUsage(docs());
    assert.ok(usage.tested.has('tested-attr') && usage.tested.has('both-attr'));
    assert.ok(!usage.tested.has('created-attr'));
    assert.ok(usage.created.has('created-attr') && usage.created.has('both-attr'));
    assert.ok(!usage.created.has('tested-attr'));
  });

  test('architectural attributes are exempt from every bucket', () => {
    const v: any[] = [
      {
        id: '0',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'io', toId: 'io' },
          { name: 'operator', toId: 'op' },
          { name: 'superstate', toId: 'ss' },
        ],
      },
      { id: 'io', type: 'SOAR_ID', outEdges: [] },
      { id: 'op', type: 'SOAR_ID', outEdges: [] },
      { id: 'ss', type: 'ENUMERATION', choices: ['nil'] },
    ];
    const r = DatamapUsageAnalyzer.analyzeDatamapUsage(makeProject(v), buildIndex(v), parse());
    assert.deepStrictEqual(
      [
        ...r.neverTestedOrCreated,
        ...r.testedNotCreated,
        ...r.createdNotTested,
        ...r.neverTested,
        ...r.neverCreated,
      ],
      []
    );
  });

  test('input-link subtree exempt from never-created; output-link subtree exempt from never-tested', () => {
    // io.input-link.cmd  – no rule tests or creates it
    // io.output-link.act – no rule tests or creates it
    const v: any[] = [
      { id: '0', type: 'SOAR_ID', outEdges: [{ name: 'io', toId: 'io' }] },
      {
        id: 'io',
        type: 'SOAR_ID',
        outEdges: [
          { name: 'input-link', toId: 'il' },
          { name: 'output-link', toId: 'ol' },
        ],
      },
      { id: 'il', type: 'SOAR_ID', outEdges: [{ name: 'cmd', toId: 'c' }] },
      { id: 'ol', type: 'SOAR_ID', outEdges: [{ name: 'act', toId: 'a' }] },
      { id: 'c', type: 'STRING' },
      { id: 'a', type: 'STRING' },
    ];
    const r = DatamapUsageAnalyzer.analyzeDatamapUsage(makeProject(v), buildIndex(v), parse());

    // Both are still "never tested or created" (the stale bucket is unchanged).
    assert.deepStrictEqual(names(r.neverTestedOrCreated), ['act', 'cmd']);

    // input-link 'cmd' must NOT appear as never-created; output-link 'act' may.
    assert.deepStrictEqual(names(r.neverCreated), ['act']);
    // output-link 'act' must NOT appear as never-tested; input-link 'cmd' may.
    assert.deepStrictEqual(names(r.neverTested), ['cmd']);
  });
});
