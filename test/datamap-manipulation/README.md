# Datamap Manipulation Tests

This directory contains tests for datamap CRUD operations and project structure
validation. These tests ensure that programmatic datamap manipulations produce
results identical to those created by VisualSoar.

## Directory Structure

```
datamap-manipulation/
├── README.md                     # This file
├── fixtures/                     # Test files that execute datamap operations
│   └── sub-operator-generation.test.ts
├── expected/                     # Reference projects from VisualSoar
│   └── sub-operator-generation/
│       ├── sub-operator-generation.vsa.json
│       └── sub-operator-generation/
│           ├── sub-operator.soar
│           └── sub-operator/
│               ├── elaborations.soar
│               └── sub-sub-operator.soar
└── helpers/                      # Test utility functions
    └── datamap-manipulation.test.ts
```

## Test Philosophy

These tests validate that our datamap manipulation functions produce identical results to VisualSoar by:

1. **Creating** a new Soar project programmatically
2. **Manipulating** the datamap by adding operators, substates, attributes, etc.
3. **Comparing** the resulting project structure to reference projects from VisualSoar

This ensures compatibility with VisualSoar and validates the correctness of our implementations.

## Benefits of the Scenario-Based Approach

The test suite uses a **declarative, scenario-based API** that dramatically reduces boilerplate:

**Before (verbose manual approach):** ~260 lines of code per test file

```typescript
// Create project
const projectFile = await createTestProject(testDir, 'my-agent');
let context = await loadProjectContext(projectFile);

// Add operator
await addOperator(context, context.project.layout.id, 'op1');
await saveProjectContext(context);
context = await loadProjectContext(projectFile);

// Add nested operator
const op1Node = findNodeByName(context, 'op1');
await addOperator(context, op1Node.id, 'op2');
await saveProjectContext(context);
// ... 50+ more lines
```

**After (declarative scenario approach):** ~30 lines per test file

```typescript
const scenario: TestScenario = {
  name: 'My Test',
  agentName: 'my-agent',
  expectedProjectName: 'my-agent',
  operations: [
    { type: 'addOperator', operatorName: 'op1' },
    { type: 'addOperator', parentName: 'op1', operatorName: 'op2' },
  ],
};

test('Should match VisualSoar', async () => {
  await runTestScenario(scenario);
});
```

This makes it **easy to add new test cases**—just define the scenario and let
the framework handle everything!

## Writing Tests

### Simplified Test Structure (Recommended)

The easiest way to write tests is using the scenario-based API:

```typescript
import { TestScenario, runTestScenario } from '../helpers/datamap-manipulation.test';

// Define the scenario
const scenario: TestScenario = {
  name: 'My Test Scenario',
  agentName: 'my-agent',
  expectedProjectName: 'my-agent',
  operations: [
    { type: 'addOperator', operatorName: 'my-operator' },
    { type: 'addOperator', parentName: 'my-operator', operatorName: 'sub-operator' },
  ],
};

suite('My Test Suite', () => {
  test('Should match VisualSoar structure', async function () {
    this.timeout(10000);
    await runTestScenario(scenario);
  });
});
```

**That's it!** `runTestScenario` automatically handles:

- Setting up the test output directory
- Cleaning up previous test artifacts
- Creating the project
- Executing all operations
- Comparing datamap, layout, and file structure to the reference
- Providing detailed error messages if anything doesn't match

### Advanced: Manual Test Structure

For more control over the test process, you can use the low-level helpers:

```typescript
import {
  createTestProject,
  loadProjectContext,
  addOperator,
  assertDatamapsSimilar,
  assertLayoutsSimilar,
} from '../helpers/datamap-manipulation.test';

test('Should create project with operator', async function () {
  // 1. Create a test project
  const projectFile = await createTestProject(testDir, 'my-agent');

  // 2. Load the project context
  let context = await loadProjectContext(projectFile);

  // 3. Manipulate the datamap
  await addOperator(context, context.project.layout.id, 'my-operator');
  await saveProjectContext(context);

  // 4. Load expected reference
  const expectedContext = await loadProjectContext(expectedFile);

  // 5. Compare results
  assertDatamapsSimilar(context.project.datamap, expectedContext.project.datamap);
  assertLayoutsSimilar(context.project.layout, expectedContext.project.layout);
});
```

### Available Helper Functions

#### High-Level Test Runner

- `runTestScenario(scenario)` - Execute a complete test scenario (automatically
  sets up output directory, creates project, executes operations, compares to
  reference)

#### Test Scenario Types

```typescript
type TestOperation = { type: 'addOperator'; parentName?: string; operatorName: string };
// More operation types can be added here as needed

interface TestScenario {
  name: string;
  agentName: string;
  expectedProjectName: string;
  operations: TestOperation[];
}
```

#### Low-Level Helpers

##### Project Management

- `createTestProject(testDir, agentName)` - Create a new Soar project
- `loadProjectContext(projectFile)` - Load a project into a testable context
- `saveProjectContext(context)` - Save project changes to disk

##### Datamap Operations

- `addOperator(context, parentNodeId, operatorName)` - Add an operator to the project
- `findNodeByName(context, nodeName)` - Find a layout node by name
- `findOperatorVertexByName(context, operatorName)` - Find a datamap vertex for an operator

##### Comparison Functions

- `assertDatamapsSimilar(actual, expected)` - Assert that two datamaps are structurally similar
- `assertLayoutsSimilar(actual, expected)` - Assert that two layouts are structurally similar
- `assertFileStructuresSimilar(actualDir, expectedDir)` - Assert that file structures match

##### Utility Functions

- `compareDatamaps(actual, expected)` - Get list of differences between datamaps
- `compareLayouts(actual, expected)` - Get list of differences between layouts
- `compareFileStructure(actualDir, expectedDir)` - Get list of file structure differences
- `cleanupTestDirectory(testDir)` - Remove test output directory

## Creating Reference Projects

Reference projects in the `expected/` directory are created using VisualSoar and
serve as ground truth for our tests.

### Steps to Create a Reference Project

1. **Launch VisualSoar** and create a new agent
2. **Perform the operations** you want to test (e.g., add operators, add attributes)
3. **Export the project** as a `.vsa.json` file
4. **Copy the entire project folder** to `expected/<test-name>/`
5. **Document the operations** performed in comments at the top of the test file

### Example Reference Structure

```
expected/
└── sub-operator-agent/
    ├── sub-operator-generation.vsa.json    # Project file
    └── sub-operator-generation/            # Agent folder
        ├── _firstload.soar
        ├── initialize-sub-operator-generation.soar
        ├── sub-operator.soar
        └── sub-operator/
            ├── elaborations.soar
            └── sub-sub-operator.soar
```

## Test Cases

### Sub-Operator Agent Test

**Purpose**: Validates nested operator creation and substate generation

**Operations Tested**:

1. Create new project
2. Add "sub-operator" to root state
3. Add "sub-sub-operator" to "sub-operator" (creates substate)

**Validates**:

- Operator vertices are created correctly
- Substate vertices are created with proper edges
- HIGH_LEVEL_OPERATOR conversion works
- File structure matches VisualSoar output
- Layout hierarchy is correct

**Location**: `fixtures/sub-operator-agent.test.ts`

## Running Tests

### Run all datamap manipulation tests

```bash
npm test -- --grep "Datamap Manipulation"
```

### Run specific test suite

```bash
npm test -- --grep "Sub-Operator Agent"
```

### Debug a specific test

```bash
npm test -- --grep "Should create project with nested operators"
```

## Test Output

Tests create output in `test-output/datamap-manipulation/` which is
automatically cleaned up after tests run (cleanup can be disabled for
debugging).

## Comparison Strategy

### Datamap Comparison

Datamaps are compared by **structure** rather than exact vertex IDs because IDs
are generated uniquely each time. The comparison:

- Counts vertex types
- Compares edge structures (names and connections)
- Verifies enumeration choices
- Ensures all expected attributes exist

### Layout Comparison

Layouts are compared by:

- Node types and names
- Hierarchy structure
- File and folder references
- Children presence and count

### File Structure Comparison

File structures are compared by:

- File and folder names
- Directory hierarchy
- File presence (not content)

## Tips for Writing Tests

1. **Use descriptive test names** that explain what operation is being validated
2. **Increase timeout** for tests involving file I/O: `this.timeout(10000)`
3. **Add console.log** statements for debugging complex operations
4. **Comment out cleanup** in teardown when debugging failed tests
5. **Test one operation at a time** before combining multiple operations
6. **Always reload context** after operations that modify the project file

## Common Issues

### Test fails with "Vertex count mismatch"

This usually means an operation didn't create all expected vertices. Check:

- Is the operation being awaited properly?
- Did you reload the context after saving?
- Is the expected project actually from VisualSoar?

### Test fails with "File structure comparison failed"

This usually means files weren't created in expected locations. Check:

- Source script references (\_source.soar files)
- Folder creation for HIGH_LEVEL_OPERATOR nodes
- File naming conventions (spaces, hyphens, etc.)

### Test times out

Increase timeout or check for:

- Missing await on async operations
- Infinite loops in comparison functions
- Large file structures being compared

## Future Test Cases

Potential test cases to add:

- [ ] Add attribute to SOAR_ID vertex
- [ ] Add linked attribute
- [ ] Edit attribute properties
- [ ] Delete attribute
- [ ] Add file node
- [ ] Add folder node
- [ ] Convert simple operator to high-level operator
- [ ] Delete operator
- [ ] Multiple nested substates
- [ ] Complex datamap with multiple operators at different levels

## Contributing

When adding new tests:

1. Create the reference project in VisualSoar
2. Add it to `expected/` directory
3. Write the test in `fixtures/`
4. Use existing helper functions or add new ones to `helpers/`
5. Document the test purpose and operations in this README
6. Ensure all tests pass before committing
