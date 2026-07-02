import * as assert from 'assert';
import * as path from 'path';
import { ProjectLoader } from '../../../../src/server/projectLoader';
import { SoarParser } from '../../../../src/server/soarParser';
import { DatamapValidator } from '../../../../src/datamap/datamapValidator';
import { DatamapMetadataCache } from '../../../../src/datamap/datamapMetadata';

/**
 * The validator must not hardcode `<s>` as the only valid state variable
 * name. Soar allows any variable name in `(state <var> ...)`; whatever name
 * is used there must be treated as bound to the state, and subsequent
 * conditions/actions referencing it must resolve correctly.
 */
suite('State variable naming', () => {
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

  function validate(content: string) {
    const doc = parser.parse('inline.soar', content, 0);
    return validator.validateDocument(doc, projectContext, content);
  }

  test('does not report an unbound-variable error when the state variable is not named <s>', () => {
    const content = `sp {apply*renamed-state
   (state <s1> ^operator <o1>)
   (<o1> ^name output-link-remove-completed)
-->
   (<s1> ^last-moved-block <mb>)
}`;
    const errors = validate(content);
    const unbound = errors.find(e => e.message.includes('is not bound'));
    assert.ok(
      !unbound,
      `Did not expect an unbound-variable error for <s1>, got: ${JSON.stringify(errors, null, 2)}`
    );
  });

  test('still reports an unbound-variable error for a genuinely disconnected variable', () => {
    const content = `sp {apply*disconnected
   (state <s1> ^operator <o1>)
   (<o1> ^name output-link-remove-completed)
-->
   (<zz> ^foo <bar>)
}`;
    const errors = validate(content);
    const unbound = errors.find(e => e.message.includes('<zz> is not bound'));
    assert.ok(
      unbound,
      `Expected an unbound-variable error for <zz>, got: ${JSON.stringify(errors, null, 2)}`
    );
  });
});
