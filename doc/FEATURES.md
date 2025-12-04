# Feature Implementation Guide

This document describes the implemented features and provides guidance for future development or modifications.

## Implemented Features

### 0. Project Creation

**Files**: `src/layout/projectCreator.ts`

**Command**: `soar.createProject` - "Create New Soar Project"

**Functionality**:

- Creates a complete Soar project structure matching VisualSoar's behavior
- Prompts user for directory and agent name
- Generates default datamap with standard Soar attributes
- Creates file scaffolding with proper folder structure

**Generated Structure**:

```
AgentName/
├── AgentName.vsa.json          # Project file with datamap and layout
├── AgentName.soar              # Main load file
└── AgentName/                  # Agent folder
    ├── _firstload.soar         # First load file (empty)
    ├── AgentName_source.soar   # Source file with includes
    ├── initialize-AgentName.soar  # Initialization operator
    ├── all/                    # Generic rules folder
    │   └── all_source.soar
    └── elaborations/           # Elaborations folder
        ├── _all.soar           # State propagation rules
        ├── top-state.soar      # Top-state elaboration
        └── elaborations_source.soar
```

**Default Datamap**:

- Root state with: `^io`, `^name`, `^operator`, `^type`, `^superstate`, `^top-state`
- Memory systems: `^epmem`, `^smem`, `^reward-link`
- IO structure: `^io.input-link`, `^io.output-link` (empty SOAR_ID)
- Initialize operator with proper propose/apply rules

**Validation**:

- Agent name must start with letter
- Only alphanumeric, hyphens, and underscores allowed
- Directory must exist
- Prevents overwriting existing projects

### 1. Syntax Highlighting

**Files**: `syntaxes/soar.tmLanguage.json`, `language-configuration.json`

**Implementation**:

- Complete TextMate grammar covering all Soar language elements
- Keywords: `sp`, `gp`, `state`, `operator`, `impasse`, etc.
- Variables: `<identifier>` patterns
- Attributes: `^attribute-name` patterns
- Comments: Single-line `#` and block `#|...|#`
- String literals with escape sequences
- Numeric literals (integers and floats)
- RHS functions and operators

**Auto-closing Pairs**: `()`, `{}`, `[]`, `<>`, `""`, `||`

**Code Folding**: Production blocks, comments

### 2. Code Snippets

**Files**: `snippets/soar.json`

**Available Snippets**:

- `spp`: Simple production
- `spn`: Production with negation
- `gpp`: Goal production
- `operator-prop`: Operator proposal
- `operator-app`: Operator application
- `operator-term`: Operator termination
- `elab`: Elaboration production
- `rhs-make`: RHS make action
- `rhs-remove`: RHS remove action

### 3. Language Server Protocol (LSP)

**Files**: `src/server/soarLanguageServer.ts`, `src/client/lspClient.ts`

**Capabilities**:

- Document synchronization
- Diagnostic reporting (validation errors)
- Foundation for future features (hover, completion, etc.)

**Key Features**:

- Activates on `.soar` file open
- Parses Soar productions
- Validates against datamap
- Reports errors with accurate positions

### 4. Soar Parser

**Files**: `src/server/soarParser.ts`, `src/server/soarTypes.ts`

**Parsing Capabilities**:

- Production detection (`sp`, `gp`)
- Production name extraction
- Variable tracking (`<var>`)
- Attribute extraction (`^attr`)
- Function call detection
- **Accurate Position Tracking**: Properly calculates line/column for multi-line productions

**Critical Method**: `getPositionInBody()` - Tracks newlines and characters
\*within production body to compute absolute document positions.

### 5. VisualSoar Project Integration

**Files**: `src/server/visualSoarProject.ts`, `src/server/projectLoader.ts`

**Schema Support**:

- VisualSoar 9.6.4 project schema (version 6)
- Full type definitions for datamap and layout
- Bidirectional compatibility

**Project Detection**:

- Auto-finds `.vsa.json`, `.vsproj`, `.soarproj` files
- Loads on workspace open
- Builds indices for fast lookups

**Data Structures**:

```typescript
ProjectContext {
    projectFile: string;
    project: VisualSoarProject;
    datamapIndex: Map<string, DMVertex>;
    layoutIndex: Map<string, LayoutNode>;
}
```

### 6. Datamap Tree View

**Files**: `src/datamap/datamapTreeProvider.ts`

**Features**:

- Hierarchical display of datamap structure
- Shows node names instead of IDs
- Removes `^` prefix from attributes
- Type-specific icons
- Descriptions show:
  - Attribute counts for SOAR_ID
  - Enumeration choices
  - Operator names for ^operator attributes

**Cycle Detection**:

- Tracks ancestor IDs to prevent infinite loops
- Labels cyclic references as "(cycle)"
- Makes cyclic references non-expandable

**Multiple Datamap Views**:

- View root datamap by default
- Switch to substate datamaps via "View Datamap" command
- Shows which datamap is active (e.g., "move-block (substate)")
- Return to root via home icon button

**Methods**:

- `setDatamapRoot(vertexId)`: Switch to different datamap
- `getCurrentRootId()`: Get current datamap being viewed
- `loadProject(uri)`: Load project file

### 7. Datamap CRUD Operations

**Files**: `src/datamap/datamapOperations.ts`

**Operations**:

#### Add Attribute

- Input: attribute name, type, optional comment
- For ENUMERATION: comma-separated choices
- Creates vertex and edge
- Generates unique IDs
- Saves to project file

#### Edit Attribute

- Rename: Changes edge name
- Edit Comment: Modifies edge comment
- Change Type: Converts vertex type (warning if has children)

#### Delete Attribute

- Removes edge from parent
- Recursively deletes orphaned vertices
- Updates project file

**Validation**:

- Name format checking
- Duplicate detection
- Type-specific validation

### 8. Datamap Validation

**Files**: `src/datamap/datamapValidator.ts`, `src/server/soarParser.ts`

**Strategy**:

- Check if attribute exists anywhere in datamap
- Report error if not found (typo detection)
- Skip negated attributes (testing absence)
- Use full parsed range for diagnostics

**Enumeration Value Validation** (NEW):

- Parser extracts attribute values from patterns like `^status complete`
- Validator checks if values match enumeration choices in datamap
- Supports dotted attribute paths (e.g., `^io.output-link.status complete`)
- **Context-aware validation**: Handles cases where the same attribute name appears in different contexts
  - Example: `^name` on an operator vs `^name` on a state may have different valid enumerations
  - Validator checks ALL possible enumeration contexts for the attribute
  - Only reports error if the value is invalid in ALL contexts
  - This prevents false positives when attribute names are reused across different vertex types
- Navigation: Follows path through datamap from root for dotted paths
- Reports errors with all valid choices from all contexts

**Examples**:

```soar
# Valid - "complete" is in status enum
(state <s> ^io.output-link.status complete)

# Invalid - "finished" is not in status enum
(state <s> ^io.output-link.status finished)  # Error reported

# Valid - "move" is in command enum
(state <s> ^io.output-link.command move)

# Variables are not validated (dynamic values)
(state <s> ^status <my-status>)  # No error
```

**Severity**: Errors (breaks Soar import)

**Integration**:

- Auto-validates on file save
- Auto-validates on file open
- Manual validation command available
- Workspace-wide validation available

**Output**: VS Code Diagnostics displayed at exact attribute location

### 9. Project Structure Tree View

**Files**: `src/layout/layoutTreeProvider.ts`

**Features**:

- Hierarchical display of project layout
- Type-specific icons (operators, files, folders)
- Click to open files
- Shows item counts for containers

**Path Resolution**:

- Accumulates folder paths from root to node
- Combines: `workspaceFolder + parentPath + node.file`
- Correctly handles nested folders and substates

**Example Path Building**:

```
Root: folder = "BW-Hierarchical", parentPath = ""
  → children get parentPath = "BW-Hierarchical"
move-block: folder = "move-block", parentPath = "BW-Hierarchical"
  → children get parentPath = "BW-Hierarchical/move-block"
pick-up.soar: file = "pick-up.soar", parentPath = "BW-Hierarchical/move-block"
  → opens: "BW-Hierarchical/move-block/pick-up.soar"
```

### 10. Layout CRUD Operations

**Files**: `src/layout/layoutOperations.ts`

**Operations**:

#### Add Operator

- Creates new operator node
- Generates .soar file
- Adds to parent's children
- Updates project file

#### Add Substate

- Creates HIGH_LEVEL_OPERATOR node
- Creates folder
- Creates datamap vertex for substate
- Links via `dmId`
- Generates boilerplate file

#### Add File/Folder

- Creates FILE or FOLDER node
- Creates physical file/folder
- Adds to project structure

#### Rename Node

- Updates node name
- Can rename file on disk (optional)

#### Delete Node

- Removes from parent's children
- Optionally deletes file/folder
- Cleans up datamap vertex if substate

### 11. Project Synchronization

**Files**: `src/layout/projectSync.ts`

**Features**:

#### Find Orphaned Files

- Scans workspace for `.soar` files
- Compares with project structure
- Returns list of untracked files
- Generates report

#### Sync Project Files

- Shows selection dialog for orphaned files
- Adds selected files to project
- Updates project file
- Refreshes tree view

#### Validation

- Excludes files in version control
- Excludes common build directories
- Checks if already in project

### 12. Commands

**Registered Commands**:

**Datamap**:

- `soar.loadDatamap`: Load project file
- `soar.refreshDatamap`: Reload datamap
- `soar.addAttribute`: Add attribute to SOAR_ID
- `soar.editAttribute`: Edit attribute properties
- `soar.deleteAttribute`: Delete attribute
- `soar.viewDatamap`: View substate datamap
- `soar.viewRootDatamap`: Return to root datamap

**Layout**:

- `soar.refreshLayout`: Reload project structure
- `soar.addOperator`: Add operator node
- `soar.addFile`: Add file node
- `soar.addFolder`: Add folder node
- `soar.renameNode`: Rename node
- `soar.deleteNode`: Delete node

**Validation**:

- `soar.validateAgainstDatamap`: Validate current file
- `soar.validateSelectedProjectAgainstDatamap`: Validate all files in the selected project

**Sync**:

- `soar.findOrphanedFiles`: Find untracked files
- `soar.syncProjectFiles`: Import orphaned files

## Architecture Patterns

### Tree View Pattern

1. Implement `TreeDataProvider<T>`
2. Create custom `TreeItem` subclass
3. Use event emitter for refresh
4. Set `contextValue` for conditional menus

### Command Pattern

1. Register command in `extension.ts`
2. Add to `package.json` commands array
3. Add menu item in `package.json` menus section
4. Use `when` clauses for conditional visibility

### Project Context Pattern

Shared state object passed through all components:

```typescript
{
    projectFile: string,
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    layoutIndex: Map<string, LayoutNode>
}
```

### Validation Flow

1. Document saved → event triggered
2. Parse document → `SoarDocument`
3. Validate → `ValidationError[]`
4. Create diagnostics → `Diagnostic[]`
5. Set diagnostics collection

## Extension Points

### Adding a New Command

1. Register in `extension.ts`: `vscode.commands.registerCommand()`
2. Add to `package.json` commands section
3. Add menu item if needed
4. Implement handler function

### Adding a New Tree View

1. Create provider implementing `TreeDataProvider`
2. Create custom `TreeItem` class
3. Register view in `package.json` views section
4. Create view in `extension.ts`: `vscode.window.createTreeView()`

### Adding a New Validation Rule

1. Add check in `datamapValidator.ts`
2. Return `ValidationError` with range
3. System automatically creates diagnostic

### Adding a New LSP Feature

1. Add capability in `soarLanguageServer.ts`
2. Register handler: `connection.on<Feature>()`
3. Return appropriate response type

## Testing

### Test Structure

```
test/
├── fixtures/              # Test data
│   ├── example.soar      # Basic Soar file
│   ├── test-validation.soar  # Validation test cases
│   └── test-project.vsa.json  # Sample project
├── BW-Hierarchical/      # Complex hierarchical project
└── suite/
    └── extension.test.ts  # Extension tests
```

### Running Tests

```bash
npm test
```

### Debug Tests

1. Open `src/test/suite/extension.test.ts`
2. Set breakpoints
3. Run "Extension Tests" launch configuration

## Performance Optimizations

1. **Indices**: Use `Map` for O(1) lookups instead of array searches
2. **Lazy Tree Items**: Create on-demand, not all at once
3. **Debounced Validation**: Avoid validating on every keystroke
4. **Caching**: Cache parsed documents by version

## Common Modifications

### Change Validation Severity

Edit `src/datamap/datamapValidator.ts`:

```typescript
severity: 'error'; // or 'warning', 'info'
```

### Add New Datamap Vertex Type

1. Add type to `DMVertex` union in `visualSoarProject.ts`
2. Add interface for new type
3. Handle in `datamapOperations.ts` add/edit
4. Add icon in `datamapTreeProvider.ts`

### Add New Layout Node Type

1. Add type to `LayoutNode` union
2. Add interface for new type
3. Handle in `layoutOperations.ts`
4. Add icon in `layoutTreeProvider.ts`
5. Add context value for menus

### Modify Tree View Display

Edit `buildDescription()` method in tree provider to change how items are labeled.

## Debugging Tips

### Enable LSP Tracing

```json
"soar.trace.server": "verbose"
```

### Check Project Loading

Look for console messages:

```
"Loaded VisualSoar project: /path/to/project.vsa.json"
```

### Verify Position Calculation

Add console.log in `soarParser.getPositionInBody()` to see position tracking.

### Check Datamap Loading

Inspect `projectContext.datamapIndex.size` to verify vertices loaded.

## Future Development

### High Priority

2. **Hover Information**: Show attribute info from datamap on hover
3. **Go to Definition**: Navigate to operator/substate definitions

### Medium Priority

4. **Refactoring**: Rename attribute across entire project
5. **Code Actions**: Quick fixes for validation errors
6. **Semantic Tokens**: Better syntax highlighting with LSP

### Low Priority

7. **Datamap Graph View**: Visual graph editor
8. **Import from Code**: Generate datamap from existing Soar code
9. **Undo/Redo**: For datamap operations
10. **Drag-and-Drop**: Reorganize layout tree
