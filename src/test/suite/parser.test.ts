import * as assert from 'assert';
import { SoarParser } from '../../server/soarParser';
import { SoarAttribute } from '../../server/soarTypes';

suite('Soar Parser Test Suite', () => {
  let parser: SoarParser;

  setup(() => {
    parser = new SoarParser();
  });

  suite('Attribute Parsing', () => {
    test('Single attribute on one line', () => {
      const code = `sp {test
                (state <s> ^name blocks-world)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      assert.strictEqual(prod.attributes.length, 2);

      // Check LHS attribute
      const nameAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'name' && a.value === 'blocks-world'
      );
      assert.ok(nameAttr, 'Should find ^name blocks-world');
      assert.strictEqual(nameAttr?.parentId, 's');
      assert.strictEqual(nameAttr?.isNegated, false);

      // Check RHS attribute
      const doneAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'done' && a.value === 'true'
      );
      assert.ok(doneAttr, 'Should find ^done true');
      assert.strictEqual(doneAttr?.parentId, 's');
    });

    test('Multiple attributes on one line', () => {
      const code = `sp {test
                (state <s> ^name blocks-world ^type state)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      assert.strictEqual(prod.attributes.length, 3);

      const nameAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'name' && a.value === 'blocks-world'
      );
      assert.ok(nameAttr);
      assert.strictEqual(nameAttr?.parentId, 's');

      const typeAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'type' && a.value === 'state'
      );
      assert.ok(typeAttr);
      assert.strictEqual(typeAttr?.parentId, 's');
    });

    test('Multiple attributes on multiple lines', () => {
      const code = `sp {test
                (state <s> ^name blocks-world
                          ^type state
                          ^superstate nil)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      assert.strictEqual(prod.attributes.length, 4);

      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) =>
            a.name === 'name' && a.value === 'blocks-world' && a.parentId === 's'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'type' && a.value === 'state' && a.parentId === 's'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'superstate' && a.value === 'nil' && a.parentId === 's'
        )
      );
    });

    test('Attribute with single variable value', () => {
      const code = `sp {test
                (state <s> ^operator <o>)
            -->
                (<o> ^name test-op)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      const opAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'operator' && a.value === '<o>'
      );
      assert.ok(opAttr, 'Should find ^operator <o>');
      assert.strictEqual(opAttr?.parentId, 's');
    });

    test('Attribute with multiple variable values on one line', () => {
      const code = `sp {test
                (state <s> ^object <blockA> <blockB> <blockC>)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      // Should create 3 separate attribute entries, one for each variable
      const objectAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'object' && a.parentId === 's'
      );
      assert.strictEqual(objectAttrs.length, 3, 'Should have 3 object attributes');

      assert.ok(
        objectAttrs.find((a: SoarAttribute) => a.value === '<blockA>'),
        'Should have <blockA>'
      );
      assert.ok(
        objectAttrs.find((a: SoarAttribute) => a.value === '<blockB>'),
        'Should have <blockB>'
      );
      assert.ok(
        objectAttrs.find((a: SoarAttribute) => a.value === '<blockC>'),
        'Should have <blockC>'
      );
    });

    test('Attribute with multiple variable values - 4 objects', () => {
      const code = `sp {test
                (state <s> ^object <blockA> <blockB> <blockC> <table>)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      // Should create 4 separate attribute entries
      const objectAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'object' && a.parentId === 's'
      );
      assert.strictEqual(objectAttrs.length, 4, 'Should have 4 object attributes');

      assert.ok(
        objectAttrs.find((a: SoarAttribute) => a.value === '<blockA>'),
        'Should have <blockA>'
      );
      assert.ok(
        objectAttrs.find((a: SoarAttribute) => a.value === '<blockB>'),
        'Should have <blockB>'
      );
      assert.ok(
        objectAttrs.find((a: SoarAttribute) => a.value === '<blockC>'),
        'Should have <blockC>'
      );
      assert.ok(
        objectAttrs.find((a: SoarAttribute) => a.value === '<table>'),
        'Should have <table>'
      );
    });

    test('Complex multi-line with multiple variables per attribute', () => {
      const code = `sp {test
                (state <s> ^name blocks-world
                          ^ontop <ontop1> <ontop2> <ontop3>
                          ^object <blockA> <blockB> <blockC> <table>
                          ^desired <ds>
                          ^gripper <g>)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      // Check name attribute
      const nameAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'name' && a.parentId === 's'
      );
      assert.strictEqual(nameAttrs.length, 1);
      assert.strictEqual(nameAttrs[0].value, 'blocks-world');

      // Check ontop attributes (3 values)
      const ontopAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'ontop' && a.parentId === 's'
      );
      assert.strictEqual(ontopAttrs.length, 3, 'Should have 3 ontop attributes');
      assert.ok(ontopAttrs.find((a: SoarAttribute) => a.value === '<ontop1>'));
      assert.ok(ontopAttrs.find((a: SoarAttribute) => a.value === '<ontop2>'));
      assert.ok(ontopAttrs.find((a: SoarAttribute) => a.value === '<ontop3>'));

      // Check object attributes (4 values)
      const objectAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'object' && a.parentId === 's'
      );
      assert.strictEqual(objectAttrs.length, 4, 'Should have 4 object attributes');
      assert.ok(objectAttrs.find((a: SoarAttribute) => a.value === '<blockA>'));
      assert.ok(objectAttrs.find((a: SoarAttribute) => a.value === '<blockB>'));
      assert.ok(objectAttrs.find((a: SoarAttribute) => a.value === '<blockC>'));
      assert.ok(objectAttrs.find((a: SoarAttribute) => a.value === '<table>'));

      // Check desired attribute (1 value)
      const desiredAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'desired' && a.parentId === 's'
      );
      assert.strictEqual(desiredAttrs.length, 1);
      assert.strictEqual(desiredAttrs[0].value, '<ds>');

      // Check gripper attribute (1 value)
      const gripperAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'gripper' && a.parentId === 's'
      );
      assert.strictEqual(gripperAttrs.length, 1);
      assert.strictEqual(gripperAttrs[0].value, '<g>');
    });

    test('Multiple identifiers with attributes', () => {
      const code = `sp {test
                (state <s> ^operator <o>
                          ^io <io>)
                (<o> ^name test-op)
                (<io> ^input-link <il>)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      // Check state attributes
      assert.ok(
        prod.attributes.find((a: SoarAttribute) => a.name === 'operator' && a.parentId === 's')
      );
      assert.ok(prod.attributes.find((a: SoarAttribute) => a.name === 'io' && a.parentId === 's'));

      // Check operator attributes
      assert.ok(
        prod.attributes.find((a: SoarAttribute) => a.name === 'name' && a.parentId === 'o')
      );

      // Check io attributes
      assert.ok(
        prod.attributes.find((a: SoarAttribute) => a.name === 'input-link' && a.parentId === 'io')
      );
    });

    test('Dotted path attributes', () => {
      const code = `sp {test
                (state <s> ^io.output-link <out>)
            -->
                (<out> ^status complete)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      const ioAttr = prod.attributes.find((a: SoarAttribute) => a.name === 'io.output-link');
      assert.ok(ioAttr, 'Should find dotted path');
      assert.strictEqual(ioAttr?.value, '<out>');
      assert.strictEqual(ioAttr?.parentId, 's');
    });

    test('Negated attributes', () => {
      const code = `sp {test
                (state <s> -^done
                          ^name blocks-world)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      const doneAttr = prod.attributes.find((a: SoarAttribute) => a.name === 'done' && a.isNegated);
      assert.ok(doneAttr, 'Should find negated attribute');
      assert.strictEqual(doneAttr?.parentId, 's');

      const nameAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'name' && !a.isNegated
      );
      assert.ok(nameAttr, 'Should find non-negated attribute');
    });

    test('Attributes with constant values', () => {
      const code = `sp {test
                (state <s> ^name blocks-world
                          ^count 5
                          ^status complete)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      assert.ok(
        prod.attributes.find((a: SoarAttribute) => a.name === 'name' && a.value === 'blocks-world')
      );
      assert.ok(prod.attributes.find((a: SoarAttribute) => a.name === 'count' && a.value === '5'));
      assert.ok(
        prod.attributes.find((a: SoarAttribute) => a.name === 'status' && a.value === 'complete')
      );
    });

    test('Attributes without values', () => {
      const code = `sp {test
                (state <s> ^operator)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      const opAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'operator' && a.parentId === 's'
      );
      assert.ok(opAttr, 'Should find attribute without value');
      assert.strictEqual(opAttr?.value, undefined);
    });

    test('Real world example - initialize-blocks-world', () => {
      const code = `sp {blocks-world*apply*initialize
                (state <s> ^operator.name initialize-blocks-world
                          ^io.output-link <out>)
            -->
                (<out> ^gripper <gripper>)
                (<s> ^name blocks-world
                    ^ontop <ontop1> <ontop2> <ontop3>
                    ^object <blockA> <blockB> <blockC> <table>
                    ^desired <ds>
                    ^gripper <g>)
                (<g> ^holding nothing
                    ^position up
                    ^above <table>
                    ^open yes)
                (<ontop1> ^top-block <blockC>
                         ^bottom-block <blockA>)
                (<ontop2> ^top-block <blockA>
                         ^bottom-block <table>)
                (<ontop3> ^top-block <blockB>
                         ^bottom-block <table>)
                (<blockA> ^name A ^type block)
                (<blockB> ^name B ^type block)
                (<blockC> ^name C ^type block)
                (<table> ^name table ^type table)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      // Verify all variables are parsed with correct parent IDs

      // State attributes
      assert.ok(
        prod.attributes.find((a: SoarAttribute) => a.name === 'operator.name' && a.parentId === 's')
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'io.output-link' && a.parentId === 's'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) =>
            a.name === 'name' && a.value === 'blocks-world' && a.parentId === 's'
        )
      );

      // Object attributes - should have 4 entries
      const objectAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'object' && a.parentId === 's'
      );
      assert.strictEqual(objectAttrs.length, 4, 'Should have 4 object variable bindings');

      // Ontop attributes - should have 3 entries
      const ontopAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'ontop' && a.parentId === 's'
      );
      assert.strictEqual(ontopAttrs.length, 3, 'Should have 3 ontop variable bindings');

      // Gripper attributes
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'holding' && a.value === 'nothing' && a.parentId === 'g'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'position' && a.value === 'up' && a.parentId === 'g'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'above' && a.value === '<table>' && a.parentId === 'g'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'open' && a.value === 'yes' && a.parentId === 'g'
        )
      );

      // Block attributes
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'name' && a.value === 'A' && a.parentId === 'blockA'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'type' && a.value === 'block' && a.parentId === 'blockA'
        )
      );

      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'name' && a.value === 'B' && a.parentId === 'blockB'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'type' && a.value === 'block' && a.parentId === 'blockB'
        )
      );

      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'name' && a.value === 'C' && a.parentId === 'blockC'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'type' && a.value === 'block' && a.parentId === 'blockC'
        )
      );

      // Table attributes
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'name' && a.value === 'table' && a.parentId === 'table'
        )
      );
      assert.ok(
        prod.attributes.find(
          (a: SoarAttribute) => a.name === 'type' && a.value === 'table' && a.parentId === 'table'
        )
      );
    });
  });

  suite('Variable Parsing', () => {
    test('Parse variables correctly', () => {
      const code = `sp {test
                (state <s> ^operator <o>)
                (<o> ^name test)
            -->
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      assert.ok(prod.variables.has('s'), 'Should find <s> variable');
      assert.ok(prod.variables.has('o'), 'Should find <o> variable');
    });
  });

  suite('RHS WME Removal', () => {
    test('Should not treat "-" as a value in WME removal', () => {
      const code = `sp {test
                (state <s> ^io.output-link.gripper <grip>)
                (<grip> ^command close)
            -->
                (<grip> ^command close -)
                (<s> ^done true)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      // Should have 4 attributes total:
      // - ^io.output-link.gripper (LHS)
      // - ^command close (LHS)
      // - ^command close (RHS, before the -)
      // - ^done true (RHS)
      assert.strictEqual(prod.attributes.length, 4);

      // Check command attributes - should have two, both with value 'close'
      const commandAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'command' && a.parentId === 'grip'
      );
      assert.strictEqual(
        commandAttrs.length,
        2,
        'Should have two command attributes (LHS and RHS)'
      );

      // Both should have 'close' as the value, not '-'
      // The '-' indicates removal but is not stored as a value
      commandAttrs.forEach(attr => {
        assert.strictEqual(attr.value, 'close', 'Command value should be "close", not "-"');
      });

      // Verify no attribute has '-' as a value
      const dashValues = prod.attributes.filter((a: SoarAttribute) => a.value === '-');
      assert.strictEqual(dashValues.length, 0, 'Should not have any attributes with "-" as value');

      // Check the ^done attribute
      const doneAttr = prod.attributes.find(
        (a: SoarAttribute) => a.name === 'done' && a.value === 'true'
      );
      assert.ok(doneAttr, 'Should find ^done true');
    });

    test('Should handle multiple value removals', () => {
      const code = `sp {test
                (state <s> ^gripper <g>)
                (<g> ^open yes)
            -->
                (<g> ^open yes - no)
            }`;

      const doc = parser.parse('test://test.soar', code, 1);
      const prod = doc.productions[0];

      // Should have 3 attributes: ^open (LHS with 'yes'), ^open (RHS removal with 'yes'), ^open (RHS add with 'no')
      const openAttrs = prod.attributes.filter(
        (a: SoarAttribute) => a.name === 'open' && a.parentId === 'g'
      );
      assert.strictEqual(openAttrs.length, 3, 'Should have 3 open attributes');

      // Check we have both 'yes' and 'no' values, but no '-'
      const values = openAttrs.map(a => a.value).sort();
      assert.deepStrictEqual(
        values,
        ['no', 'yes', 'yes'],
        'Should have yes, yes, and no as values'
      );
    });
  });
});
