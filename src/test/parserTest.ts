/**
 * Standalone parser test runner - can be run directly with Node.js
 */

import { SoarParser } from '../server/soarParser';
import { SoarAttribute } from '../server/soarTypes';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

function assertEquals(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    console.error(`❌ FAIL: ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

const parser = new SoarParser();

console.log('\n=== Testing Attribute with Multiple Variable Values ===\n');

{
  const code = `sp {test
        (state <s> ^object <blockA> <blockB> <blockC> <table>)
    -->
        (<s> ^done true)
    }`;

  const doc = parser.parse('test://test.soar', code, 1);
  const prod = doc.productions[0];

  console.log(`Total attributes parsed: ${prod.attributes.length}`);

  const objectAttrs = prod.attributes.filter(
    (a: SoarAttribute) => a.name === 'object' && a.parentId === 's'
  );
  console.log(`Object attributes found: ${objectAttrs.length}`);
  objectAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^object ${attr.value} (parent: <${attr.parentId}>)`);
  });

  assertEquals(objectAttrs.length, 4, 'Should have 4 object attributes');
  assert(
    objectAttrs.some((a: SoarAttribute) => a.value === '<blockA>'),
    'Should have <blockA>'
  );
  assert(
    objectAttrs.some((a: SoarAttribute) => a.value === '<blockB>'),
    'Should have <blockB>'
  );
  assert(
    objectAttrs.some((a: SoarAttribute) => a.value === '<blockC>'),
    'Should have <blockC>'
  );
  assert(
    objectAttrs.some((a: SoarAttribute) => a.value === '<table>'),
    'Should have <table>'
  );
}

console.log('\n=== Testing Complex Multi-Line ===\n');

{
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

  console.log(`Total attributes parsed: ${prod.attributes.length}`);

  const ontopAttrs = prod.attributes.filter(
    (a: SoarAttribute) => a.name === 'ontop' && a.parentId === 's'
  );
  console.log(`Ontop attributes found: ${ontopAttrs.length}`);
  ontopAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^ontop ${attr.value}`);
  });
  assertEquals(ontopAttrs.length, 3, 'Should have 3 ontop attributes');

  const objectAttrs = prod.attributes.filter(
    (a: SoarAttribute) => a.name === 'object' && a.parentId === 's'
  );
  console.log(`Object attributes found: ${objectAttrs.length}`);
  objectAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^object ${attr.value}`);
  });
  assertEquals(objectAttrs.length, 4, 'Should have 4 object attributes');
}

console.log('\n=== Testing Real World - initialize-blocks-world ===\n');

{
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
        (<blockA> ^name A ^type block)
        (<blockB> ^name B ^type block)
        (<blockC> ^name C ^type block)
        (<table> ^name table ^type table)
    }`;

  const doc = parser.parse('test://test.soar', code, 1);
  const prod = doc.productions[0];

  console.log(`Total attributes parsed: ${prod.attributes.length}`);

  // Check object attributes
  const objectAttrs = prod.attributes.filter(
    (a: SoarAttribute) => a.name === 'object' && a.parentId === 's'
  );
  console.log(`\nObject attributes (should be 4):`);
  objectAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^object ${attr.value}`);
  });
  assertEquals(objectAttrs.length, 4, 'Should have 4 object variable bindings');

  // Check ontop attributes
  const ontopAttrs = prod.attributes.filter(
    (a: SoarAttribute) => a.name === 'ontop' && a.parentId === 's'
  );
  console.log(`\nOntop attributes (should be 3):`);
  ontopAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^ontop ${attr.value}`);
  });
  assertEquals(ontopAttrs.length, 3, 'Should have 3 ontop variable bindings');

  // Check blockA attributes
  const blockAAttrs = prod.attributes.filter((a: SoarAttribute) => a.parentId === 'blockA');
  console.log(`\nBlockA attributes (should be 2):`);
  blockAAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^${attr.name} ${attr.value}`);
  });
  assert(
    blockAAttrs.some((a: SoarAttribute) => a.name === 'name' && a.value === 'A'),
    'BlockA should have ^name A'
  );
  assert(
    blockAAttrs.some((a: SoarAttribute) => a.name === 'type' && a.value === 'block'),
    'BlockA should have ^type block'
  );

  // Check blockB attributes
  const blockBAttrs = prod.attributes.filter((a: SoarAttribute) => a.parentId === 'blockB');
  console.log(`\nBlockB attributes (should be 2):`);
  blockBAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^${attr.name} ${attr.value}`);
  });
  assert(
    blockBAttrs.some((a: SoarAttribute) => a.name === 'name' && a.value === 'B'),
    'BlockB should have ^name B'
  );
  assert(
    blockBAttrs.some((a: SoarAttribute) => a.name === 'type' && a.value === 'block'),
    'BlockB should have ^type block'
  );

  // Check table attributes
  const tableAttrs = prod.attributes.filter((a: SoarAttribute) => a.parentId === 'table');
  console.log(`\nTable attributes (should be 2):`);
  tableAttrs.forEach((attr: SoarAttribute) => {
    console.log(`  - ^${attr.name} ${attr.value}`);
  });
  assert(
    tableAttrs.some((a: SoarAttribute) => a.name === 'name' && a.value === 'table'),
    'Table should have ^name table'
  );
  assert(
    tableAttrs.some((a: SoarAttribute) => a.name === 'type' && a.value === 'table'),
    'Table should have ^type table'
  );
}

console.log('\n✅ All tests passed!\n');
