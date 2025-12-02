# Soar VS Code Extension - Architecture

## Overview

The Soar VS Code extension provides comprehensive IDE support for the Soar cognitive architecture language, including syntax highlighting, language server features, datamap management, and project structure visualization compatible with VisualSoar.

## System Components

### 1. Extension Host (`src/extension.ts`)

The main extension entry point that coordinates all components:

- **Lifecycle Management**: Activates/deactivates extension components
- **Command Registration**: Registers all VS Code commands
- **View Providers**: Initializes tree view providers
- **LSP Client**: Starts the language server
- **Validation Coordinator**: Manages document validation workflow

### 2. Language Server (`src/server/`)

Provides LSP-based language features:

#### `soarLanguageServer.ts`
- Main LSP server implementation
- Handles client-server communication
- Coordinates language features

#### `soarParser.ts`
- Parses Soar productions into structured format
- Extracts variables, attributes, function calls
- Calculates accurate position information for diagnostics
- **Key Fix**: Uses `getPositionInBody()` to properly track line numbers across multi-line productions

#### `soarTypes.ts`
- Type definitions for parsed Soar documents
- Production, attribute, variable types
- Range and position types

#### `visualSoarProject.ts`
- VisualSoar project schema type definitions
- Datamap vertex types (SOAR_ID, ENUMERATION, INTEGER, FLOAT, STRING)
- Layout node types (operators, files, folders, substates)
- Project context management

#### `projectLoader.ts`
- Finds and loads VisualSoar project files (.vsa.json, .vsproj, .soarproj)
- Builds indices for fast datamap/layout lookups
- Saves project changes

### 3. Datamap System (`src/datamap/`)

Manages VisualSoar datamap integration:

#### `datamapTreeProvider.ts`
- Displays datamap as hierarchical tree view
- **Cycle Detection**: Prevents infinite expansion of self-referencing attributes (e.g., ^superstate)
- **Multiple Datamap Views**: Switch between root datamap and substate datamaps
- **Smart Labeling**: Shows node names instead of IDs, removes leading ^ from attributes
- **Operator Hints**: Displays operator name choices without expanding

#### `datamapOperations.ts`
- CRUD operations for datamap attributes
- Add, edit, delete attributes
- Type changes with validation
- Automatic project file saving

#### `datamapValidator.ts`
- Validates Soar code against datamap structure
- Reports errors at actual attribute locations (not production header)
- Escalates validation issues to errors (breaks Soar import)
- Uses full parsed range information for accurate diagnostics

### 4. Layout System (`src/layout/`)

Manages project structure visualization:

#### `layoutTreeProvider.ts`
- Displays VisualSoar project structure
- **Path Resolution**: Correctly builds file paths using parent folder accumulation
- **Click-to-Open**: Opens files in editor when clicked
- Supports operators, substates, folders, files

#### `layoutOperations.ts`
- Add/remove operators, substates, files, folders
- Rename and delete nodes
- Creates corresponding datamap vertices for substates
- Synchronizes file system with project structure

#### `projectSync.ts`
- Finds orphaned .soar files not in project
- Bulk import/sync operations
- Maintains project file consistency

#### `soarTemplates.ts`
- Templates for creating new Soar files
- Operator scaffolding
- Substate initialization

### 5. LSP Client (`src/client/lspClient.ts`)

- Bridges extension and language server
- Configures LSP capabilities
- Handles client-side LSP features

## Data Flow

### Validation Workflow

```
1. User saves .soar file
   ↓
2. extension.ts receives save event
   ↓
3. Calls validateDocument()
   ↓
4. soarParser.parse() → SoarDocument with accurate positions
   ↓
5. datamapValidator.validateDocument() → ValidationErrors with ranges
   ↓
6. datamapValidator.createDiagnostics() → VS Code Diagnostics
   ↓
7. Diagnostics displayed in editor at correct locations
```

### Datamap CRUD Workflow

```
1. User right-clicks datamap tree item
   ↓
2. Selects command (add/edit/delete attribute)
   ↓
3. extension.ts routes to datamapOperations
   ↓
4. Operation modifies ProjectContext in memory
   ↓
5. projectLoader.saveProject() writes to .vsa.json
   ↓
6. datamapTreeProvider.refresh() updates UI
```

### File Path Resolution

```
1. User clicks layout tree item
   ↓
2. layoutTreeProvider builds LayoutTreeItem with:
   - parentPath accumulated from ancestors
   - node.file from project
   ↓
3. Combines: workspaceFolder + parentPath + node.file
   ↓
4. Example: /workspace + BW-Hierarchical/move-block + pick-up.soar
   ↓
5. Opens: /workspace/BW-Hierarchical/move-block/pick-up.soar
```

## Key Design Patterns

### 1. Tree View Pattern
- **Provider**: Implements `TreeDataProvider<T>`
- **Items**: Custom `TreeItem` subclasses with context
- **Refresh**: Event emitter for tree updates
- **Context Values**: Enable/disable commands based on item type

### 2. Project Context Pattern
```typescript
interface ProjectContext {
    projectFile: string;           // Path to .vsa.json
    project: VisualSoarProject;    // Parsed project
    datamapIndex: Map<string, DMVertex>;  // Fast vertex lookup
    layoutIndex: Map<string, LayoutNode>; // Fast node lookup
}
```
Shared across all components for consistent state.

### 3. Position Tracking Pattern
Parser calculates positions by:
- Tracking base position (where body starts)
- Counting newlines and characters within body
- Building absolute positions for diagnostics
```typescript
private getPositionInBody(body: string, offset: number, basePosition: Position): Position {
    let line = basePosition.line;
    let character = basePosition.character;
    for (let i = 0; i < offset && i < body.length; i++) {
        if (body[i] === '\n') {
            line++;
            character = 0;
        } else {
            character++;
        }
    }
    return { line, character };
}
```

### 4. Cycle Detection Pattern
Tracks ancestor IDs to prevent infinite loops:
```typescript
ancestorIds: Set<string>  // All vertex IDs from root to current node
if (ancestorIds.has(edge.toId)) {
    // Mark as cycle, don't allow expansion
}
```

## Critical Implementation Details

### Parser Position Calculation
**Problem**: Originally all attributes reported errors at production header line.

**Solution**: 
1. Calculate `bodyBasePosition` where production body starts (after `sp {`)
2. Use `getPositionInBody()` to track line breaks within body
3. Store full range in `SoarAttribute.range`
4. Use range in diagnostics for accurate highlighting

### File Path Resolution
**Problem**: Files in nested folders couldn't be opened (path not found).

**Solution**:
1. Pass `parentPath` parameter through tree construction
2. Accumulate folder paths: `parent + node.folder` for children
3. Combine: `workspaceFolder + parentPath + node.file`
4. Handle both root files and deeply nested files correctly

### Datamap Cycle Prevention
**Problem**: `^superstate` attribute pointing to parent caused infinite expansion.

**Solution**:
1. Add `ancestorIds: Set<string>` to each tree item
2. Check `ancestorIds.has(targetVertexId)` before allowing expansion
3. Label cycles as "(cycle)" and make non-expandable

### Multiple Datamap Views
**Feature**: View different datamaps for substates.

**Implementation**:
1. Add `currentRootId` to track which vertex to display
2. Provide `setDatamapRoot(vertexId)` method
3. Find layout node name for labeled display
4. Add "View Datamap" command for nodes with `dmId`

## File Organization

```
src/
├── extension.ts                    # Main entry point
├── client/
│   └── lspClient.ts               # LSP client
├── server/
│   ├── soarLanguageServer.ts      # LSP server
│   ├── soarParser.ts              # Parser with position tracking
│   ├── soarTypes.ts               # Type definitions
│   ├── visualSoarProject.ts       # VisualSoar schema types
│   └── projectLoader.ts           # Project file I/O
├── datamap/
│   ├── datamapTreeProvider.ts     # Datamap tree view
│   ├── datamapOperations.ts       # CRUD operations
│   └── datamapValidator.ts        # Code validation
└── layout/
    ├── layoutTreeProvider.ts       # Project structure tree
    ├── layoutOperations.ts         # Structure CRUD
    ├── projectSync.ts              # File sync
    └── soarTemplates.ts            # File templates
```

## Configuration

### Extension Settings
- `soar.maxNumberOfProblems`: Max diagnostics per file (default: 100)
- `soar.trace.server`: LSP communication logging (off/messages/verbose)

### Context Values
Used for conditional menu items:
- `datamap-root`: Root datamap node
- `datamap-attribute-{type}`: Datamap attribute by type
- `layout-{type}`: Layout node by type (operator-root, high-level-operator, etc.)

## VisualSoar Compatibility

### Schema Version: 6
Follows VisualSoar 9.6.4 project schema exactly.

### File Support
- `.vsa.json`: Primary format (JSON with explicit schema)
- `.vsproj`: VisualSoar native format
- `.soarproj`: Legacy format

### Bidirectional Compatibility
- Projects created in extension open in VisualSoar
- Projects created in VisualSoar open in extension
- All schema fields preserved

### Datamap Vertex Types
- `SOAR_ID`: Identifier with attributes
- `ENUMERATION`: Fixed set of choices
- `INTEGER`: Integer range
- `FLOAT`: Float range  
- `STRING`: String value

### Layout Node Types
- `OPERATOR_ROOT`: Project root
- `FOLDER`: Directory
- `FILE`: Non-Soar file
- `FILE_OPERATOR`: Soar file
- `OPERATOR`: Basic operator
- `HIGH_LEVEL_OPERATOR`: Operator with substate (has `dmId`)
- `HIGH_LEVEL_FILE_OPERATOR`: File operator with substate
- `IMPASSE_OPERATOR`: Impasse handler
- `HIGH_LEVEL_IMPASSE_OPERATOR`: High-level impasse handler

## Future Development

### Potential Enhancements
1. **Advanced Completions**: Context-aware based on variable bindings
2. **Refactoring**: Rename attribute across project
3. **Datamap Graph View**: Visual graph editor for datamap
4. **Code Generation**: Generate boilerplate from datamap
5. **Import/Export**: Import datamap from existing code
6. **Undo/Redo**: For datamap operations
7. **Drag-and-Drop**: Reorganize layout tree
8. **Semantic Search**: Find all uses of an attribute

### Extension Points
- Custom commands: Add via `registerCommand()`
- Tree view providers: Extend `TreeDataProvider`
- LSP features: Add to `soarLanguageServer.ts`
- Validation rules: Extend `datamapValidator.ts`

## Testing

### Test Fixtures
- `test/fixtures/example.soar`: Basic Soar file
- `test/fixtures/test-validation.soar`: Validation test cases
- `test/fixtures/test-project.vsa.json`: Sample project
- `test/BW-Hierarchical/`: Complete hierarchical project

### Test Structure
```
test/
├── suite/
│   ├── extension.test.ts         # Extension tests
│   └── index.ts                  # Test runner
└── fixtures/                      # Test data
```

## Debugging

### Launch Configuration
Press `F5` to launch Extension Development Host:
- Extension loads in isolated VS Code instance
- Set breakpoints in TypeScript
- Console logs appear in Debug Console
- Test with real .soar files

### Common Issues
1. **"File not found"**: Check path resolution in `layoutTreeProvider.ts`
2. **"Wrong line highlighted"**: Check position calculation in `soarParser.ts`
3. **"Datamap not loading"**: Verify project file format and schema version
4. **"Infinite expansion"**: Check cycle detection in `datamapTreeProvider.ts`

## Performance Considerations

### Optimization Strategies
1. **Indices**: Use `Map<string, T>` for O(1) lookups
2. **Lazy Loading**: Tree items created on-demand
3. **Caching**: Parse results cached per document version
4. **Debouncing**: Validation debounced on rapid edits

### Memory Management
- Clear diagnostic collection on file close
- Release references to closed documents
- Rebuild indices only when project file changes

---

**Last Updated**: December 2, 2025
**Schema Version**: VisualSoar 6
**Extension Version**: 0.1.0
