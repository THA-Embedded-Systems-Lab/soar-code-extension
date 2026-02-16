/**
 * Sub-Operator Generation Test
 *
 * Tests datamap manipulation by creating a project and adding nested operators,
 * then comparing to a reference project from VisualSoar.
 *
 * Test Procedure:
 * 1. Create a new project named "sub-operator-generation"
 * 2. Add an operator "sub-operator" to the root state
 * 3. Add an operator "sub-sub-operator" to the "sub-operator" (creating a substate)
 * 4. Compare the resulting datamap structure to the expected reference
 * 5. Compare the resulting file structure to the expected reference
 */

import { TestScenario, runTestScenario } from '../helpers/datamap-manipulation.test';

// Define the test scenario
const scenario: TestScenario = {
  name: 'Sub-Operator Generation',
  agentName: 'sub-operator-generation',
  expectedProjectName: 'sub-operator-generation',
  operations: [
    { type: 'addOperator', operatorName: 'sub-operator' },
    { type: 'addOperator', parentName: 'sub-operator', operatorName: 'sub-sub-operator' },
  ],
};

suite('Datamap Manipulation - Sub-Operator Generation', () => {
  test('Should create project with nested operators matching VisualSoar structure', async function () {
    this.timeout(10000);
    await runTestScenario(scenario);
  });
});
