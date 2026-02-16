# Layout Operations Test Suite

This directory contains comprehensive tests for the layout manipulation operations in the Soar VS Code extension.

## Overview

The test suite validates all CRUD operations on Soar project layouts, including
operators, files, folders, and impasse operators. Each test applies operations
to a live Soar project and validates:

1. **Layout Structure** - Correct node hierarchy and relationships
2. **Datamap Integrity** - Valid vertex references and edges
3. **Schema Compliance** - Project JSON conforms to `project.schema.json`
4. **File System State** - Physical files and folders match project structure

## Test Files

### layoutOperations.test.ts

Comprehensive test suite for all layout manipulation functions:

**Tested Operations:**

- `addOperator` - Add simple and nested operators
- `addImpasseOperator` - Add all impasse types
- `addFile` - Add files to folders and operators
- `addFolder` - Add folders with nested hierarchies
- `deleteNode` - Delete operators, files, and folders with cleanup
- `renameNode` - Update logical names in project structure

**Test Categories:**

1. **Basic Operations** - Individual CRUD operations
2. **Complex Scenarios** - Multi-step operations with mixed types
3. **Schema Validation** - Edge cases and compliance checks
4. **Datamap Validation** - Vertex references and graph integrity
5. **Layout Structure** - Parent-child relationships and indexing

**Key Features:**

- ✅ Schema validation using Ajv against `project.schema.json`
- ✅ Datamap vertex and edge validation
- ✅ File system state verification
- ✅ 30+ individual test cases
- ✅ All tests use programmatic APIs (no UI prompts)

### projectCreator.test.ts

Tests for creating new Soar projects with correct scaffolding:

- Directory structure validation
- Default datamap creation
- File generation
- Schema compliance

### undoManager.test.ts

Tests for undo/redo functionality:

- Stack management
- State restoration
- Datamap graph recovery
- Multi-operation sequences

## Running Tests

```bash
# Run all layout tests
npm run test -- --grep "Layout"

# Run only layoutOperations tests
npm run test -- --grep "LayoutOperations"

# Run specific test suite
npm run test -- --grep "addOperator"

# Run all tests
npm run test
```

## Test Structure

Each test follows this pattern:

```typescript
test('Description', async () => {
  const rootNodeId = projectContext.project.layout.id;

  // 1. Perform operation
  const result = await LayoutOperations.addOperatorProgrammatic(
    projectContext,
    rootNodeId,
    'operator-name'
  );

  // 2. Reload project
  await reloadProject();

  // 3. Validate layout structure
  const node = findNodeByName('operator-name');
  assert.ok(node, 'Node should exist');

  // 4. Validate datamap
  const vertex = findVertexById(node.dmId);
  assert.ok(vertex, 'Datamap vertex should exist');

  // 5. Validate file system
  const filePath = path.join(projectPath, 'operator-name.soar');
  assert.ok(fs.existsSync(filePath), 'File should exist');

  // 6. Validate schema compliance
  validateProjectSchema();
});
```

## Schema Validation

All tests validate the generated `.vsa.json` project file against the JSON schema using Ajv:

```typescript
function validateProjectSchema(): void {
  const projectJson = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));
  const isValid = schemaValidator(projectJson);

  if (!isValid) {
    // Detailed error reporting
    const errors = schemaValidator.errors
      .map(err => `${err.instancePath}: ${err.message}`)
      .join('\n');
    assert.fail(`Schema validation failed:\n${errors}`);
  }
}
```

## Datamap Validation Helpers

The test suite includes helpers for validating datamap structure:

- `findVertexById(id)` - Lookup vertex in datamap index
- `findOperatorVertex(name, stateId)` - Find operator by name in state
- `countVertices()` - Get total vertex count
- `isSoarIdVertex(vertex)` - Type guard for SOAR_ID vertices

## Layout Validation Helpers

Helpers for validating layout structure:

- `findNodeByName(name)` - Recursively search layout tree
- `findParentNode(nodeId)` - Locate parent of a node
- `reloadProject()` - Reload project from disk

## Coverage Summary

**Functions Tested:**

- ✅ `addOperator` / `addOperatorProgrammatic`
- ✅ `addImpasseOperator` / `addImpasseOperatorProgrammatic`
- ✅ `addFile` / `addFileProgrammatic`
- ✅ `addFolder` / `addFolderProgrammatic`
- ✅ `deleteNode`
- ✅ `renameNode`

**Scenarios Covered:**

- Single operator creation
- Nested operator hierarchies (high-level operators)
- Multiple operator creation
- All impasse types
- File creation in folders
- Nested folder hierarchies
- Operator deletion with datamap cleanup
- Folder deletion
- Mixed operation sequences
- Edge cases (empty children, conversions, etc.)

**Validation Checks:**

- ✅ Project JSON schema compliance (100% of operations)
- ✅ Layout node structure and indexing
- ✅ Datamap vertex references and edges
- ✅ File system file/folder creation and deletion
- ✅ Parent-child relationships
- ✅ Operator-to-datamap linkage via `dmId`

## Test Results

```
  LayoutOperations - Comprehensive Manipulation Tests
    addOperator
      ✔ Should add operator to root and update datamap
      ✔ Should add nested operator to high-level operator
      ✔ Should add multiple operators and maintain datamap consistency
    addImpasseOperator
      ✔ Should add impasse operator to root
      ✔ Should add all impasse types
      ✔ Should convert impasse operator to high-level when adding child
    addFile
      ✔ Should add file to root folder
      ✔ Should add file to folder
      ✔ Should add multiple files
    addFolder
      ✔ Should add folder to root
      ✔ Should add nested folders
      ✔ Should add multiple folders
    deleteNode
      ✔ Should delete operator and update datamap
      ✔ Should delete file
      ✔ Should delete folder - validates proper cleanup
      ✔ Should delete high-level operator with children
    renameNode
      ✔ Should rename operator (logical name only)
    Complex Scenarios
      ✔ Should handle complex project structure with mixed operations
      ✔ Should maintain schema validity through multiple operations
      ✔ Should maintain datamap integrity through add and delete cycles
    Schema Validation Edge Cases
      ✔ Should validate empty children arrays
      ✔ Should validate project with only operators
      ✔ Should validate project with only files
      ✔ Should validate project with nested folder hierarchy
      ✔ Should validate after converting operator to high-level
    Datamap Validation
      ✔ Should maintain valid vertex references
      ✔ Should maintain root vertex reference
      ✔ Should not create orphaned vertices
    Layout Structure Validation
      ✔ Should maintain valid parent-child relationships
      ✔ Should have all nodes indexed

  30 passing
```

## Notes

1. **Programmatic APIs**: Tests use programmatic versions of operations (e.g.,
   `addOperatorProgrammatic`) to avoid UI prompts.

2. **Schema Version**: All tests validate against schema version "6" as defined
   in `project.schema.json`.

3. **Datamap Structure**: Each operator gets its own vertex with a dedicated
   name enumeration, not a shared enumeration.

4. **File Cleanup**: Tests use `setup()` and `teardown()` to ensure clean test
   environments.

5. **Async Operations**: All tests properly await async operations and reload
   the project context after modifications.

## Future Enhancements

Potential additions to the test suite:

- [ ] Test operator conversion (OPERATOR → HIGH_LEVEL_OPERATOR)
- [ ] Test link node operations (if supported)
- [ ] Test foreign vertex handling
- [ ] Performance tests for large project structures
- [ ] Concurrent operation tests
- [ ] Error recovery and rollback tests
