import * as assert from 'assert';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { ProjectLoader } from '../../../../src/server/projectLoader.js';
import { SoarParser } from '../../../../src/server/soarParser.js';
import { DatamapValidator } from '../../../../src/datamap/datamapValidator.js';
import { DatamapMetadataCache } from '../../../../src/datamap/datamapMetadata.js';
import { SoarAttribute } from '../../../../src/server/soarTypes.js';

/**
 * Conjunctive attribute tests `^{ ... }`.
 *
 * Per the Soar syntax manual, "all of the tests that can be used for values can
 * also be used for attributes and identifiers", so a conjunctive attribute test
 * may contain a literal/disjunction that constrains the attribute name, a
 * relational/predicate test, and/or a variable capturing which name matched.
 * These used to be unparsed and the whole condition was silently dropped, which
 * produced spurious "unbound variable" errors on the surrounding rule. This
 * suite pins down the parse semantics and the no-silent-drop guarantee.
 */
suite('Conjunctive attribute tests', () => {
  const parser = new SoarParser();

  function attrsOf(content: string): SoarAttribute[] {
    return parser.parse('inline.soar', content, 0).productions[0]?.attributes ?? [];
  }

  function lhsNames(content: string): string[] {
    return attrsOf(content)
      .filter(a => a.side === 'lhs')
      .map(a => a.name);
  }

  test('disjunction + capture variable expands to each literal (algebra idiom)', () => {
    // (<pc> ^ { << left-side right-side >> <side> } <cc>)
    const names = lhsNames(
      `sp {t (<pc> ^ { << left-side right-side >> <side> } <cc>) --> (<pc> ^done yes)}`
    );
    assert.ok(names.includes('left-side'), `expected left-side, got ${JSON.stringify(names)}`);
    assert.ok(names.includes('right-side'), `expected right-side, got ${JSON.stringify(names)}`);
  });

  test('bare constant + variable resolves to the constant', () => {
    assert.deepStrictEqual(lhsNames(`sp {t (<t> ^{ foo <x> } table) --> (<t> ^done yes)}`), [
      'foo',
    ]);
  });

  test('relational-only conjunction is a wildcard, not a literal (manual: ^{<ta> <> name})', () => {
    // The attribute may be anything except `name`, so there is no positive
    // literal constraint — represented as the wildcard '' (never dropped).
    assert.deepStrictEqual(lhsNames(`sp {t (<t> ^{<ta> <> name} table) --> (<t> ^done yes)}`), [
      '',
    ]);
  });

  test('lone-variable conjunction is a wildcard', () => {
    assert.deepStrictEqual(lhsNames(`sp {t (<t> ^{ <a> } val) --> (<t> ^done yes)}`), ['']);
  });

  test('conjunction inside a dotted path expands the trailing segment', () => {
    const names = lhsNames(`sp {t (<t> ^foo.{ << a b >> <x> } val) --> (<t> ^done yes)}`);
    assert.deepStrictEqual(names.sort(), ['foo.a', 'foo.b']);
  });

  test('a capture variable is recorded so the surrounding rule stays parsed (no silent drop)', () => {
    // The whole `(<pc> ...)` condition must survive: the value binding <cc> is
    // present, which is what previously vanished when the test was dropped.
    const attrs = attrsOf(
      `sp {t (<pc> ^ { << left-side right-side >> <side> } <cc>) --> (<pc> ^done yes)}`
    );
    const lhs = attrs.filter(a => a.side === 'lhs');
    assert.ok(lhs.length >= 2, `expected the condition to be parsed, got ${JSON.stringify(attrs)}`);
    assert.ok(
      lhs.every(a => a.value === '<cc>'),
      `expected each expansion to carry value <cc>, got ${JSON.stringify(lhs)}`
    );
  });

  test('malformed conjunction surfaces a diagnostic instead of silently dropping', () => {
    // Unbalanced brace: the parser must report, not swallow it.
    const doc = parser.parse('inline.soar', `sp {t (<t> ^{ << a b >> <x> val) --> (<t> ^d y)}`, 0);
    assert.ok(
      (doc.errors ?? []).length > 0,
      `expected at least one diagnostic for a malformed conjunctive attribute test`
    );
  });
});

/**
 * A variable used as an attribute name (`^<var>`) is itself bound in Soar and
 * may be dereferenced as an identifier — the "duplicates table" idiom from the
 * default rules: `(<d> ^<id> <new-id>) (<id> ^{ ... } <val>)`. Now that these
 * tests parse (rather than being dropped), the validator must treat the
 * attribute-name variable as bound so it isn't falsely flagged.
 */
suite('Attribute-name variable binding', () => {
  const projectFile = path.resolve(__dirname, '../fixtures/vars/vars.vsa.json');
  const projectLoader = new ProjectLoader();
  const parser = new SoarParser();
  const validator = new DatamapValidator();
  let projectContext: any;

  suiteSetup(async () => {
    projectContext = await projectLoader.loadProject(projectFile);
    (projectContext as any).datamapMetadata = DatamapMetadataCache.build(
      projectContext.project,
      projectContext.datamapIndex
    );
  });

  test('does not flag a variable bound as an attribute name and dereferenced as an identifier', () => {
    const content = `sp {t
   (state <s1> ^duplicates <d>)
   (<d> ^<id> <new-id>)
   (<id> ^{ <> tried-tied-operator <sub-att> } <sub-val>)
-->
   (<new-id> ^<sub-att> <sub-val>)
}`;
    const doc = parser.parse('inline.soar', content, 0);
    const errors = validator.validateDocument(doc, projectContext, content);
    const unboundId = errors.find(e => e.message.includes('<id> is not bound'));
    assert.ok(
      !unboundId,
      `Did not expect <id> to be reported unbound, got: ${JSON.stringify(errors, null, 2)}`
    );
  });
});
