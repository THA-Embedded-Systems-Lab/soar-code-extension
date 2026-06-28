import * as assert from 'assert';
import * as path from 'path';
import { ProjectLoader } from '../../../../src/server/projectLoader';
import { SoarParser } from '../../../../src/server/soarParser';
import { DatamapValidator } from '../../../../src/datamap/datamapValidator';
import { DatamapMetadataCache } from '../../../../src/datamap/datamapMetadata';

/**
 * Context-aware operator augmentation validation.
 *
 * The `vars` fixture has multiple operators under `^operator`:
 *   - anchor-object-class  (has ^desireds)
 *   - output-link-remove-completed  (has ^id, but NOT ^desireds)
 *   - initialize-vars
 *
 * Augmenting `output-link-remove-completed` with `^desireds` must be flagged
 * even though `^desireds` exists elsewhere in the datamap (on
 * anchor-object-class). The reverse — augmenting anchor-object-class with
 * `^desireds` — must NOT be flagged.
 */
suite('Operator context-aware augmentation', () => {
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

  test('flags an attribute that exists on a different operator but not the named one', () => {
    const content = `sp {apply*wrong
   (state <s> ^name vars ^operator <o>)
   (<o> ^name output-link-remove-completed)
-->
   (<o> ^desireds <d>)
}`;
    const errors = validate(content);
    const desireds = errors.find(e => e.attribute === 'desireds');
    assert.ok(
      desireds,
      `Expected a validation error for ^desireds on output-link-remove-completed, got: ${JSON.stringify(
        errors,
        null,
        2
      )}`
    );
  });

  test('does not flag an attribute that exists on the named operator', () => {
    const content = `sp {apply*right
   (state <s> ^name vars ^operator <o>)
   (<o> ^name anchor-object-class)
-->
   (<o> ^desireds <d>)
}`;
    const errors = validate(content);
    const desireds = errors.find(e => e.attribute === 'desireds');
    assert.ok(
      !desireds,
      `Did not expect a validation error for ^desireds on anchor-object-class, got: ${JSON.stringify(
        errors,
        null,
        2
      )}`
    );
  });
});
