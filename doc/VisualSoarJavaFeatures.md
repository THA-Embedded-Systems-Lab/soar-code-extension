# VisualSoar vs VS Code Extension - Feature Comparison

> [!note]
> This comparison table tracks feature parity between VisualSoar (Java) and the VS Code Extension.
> ✅ = Implemented, 🚧 = Partial, ❌ = Not Implemented, 🔄 = Alternative Approach
> The VisualSoar feature list was generated via AI on the basis of the VisualSoar manual.

## Project Management

| Feature                | VisualSoar | VS Code Extension | Status | Notes                                              |
| ---------------------- | ---------- | ----------------- | ------ | -------------------------------------------------- |
| Create new projects    | ✅         | ✅                | ✅     | VS Code: Command-based with guided setup           |
| Open existing projects | ✅         | ✅                | ✅     | VS Code: Auto-detects .vsa.json files              |
| Save/Save As           | ✅         | ✅                | ✅     | VS Code: Auto-saves on operations                  |
| Multiple instances     | ✅         | ✅                | ✅     | VS Code: Native workspace support                  |
| Project scaffolding    | ✅         | ✅                | ✅     | Both create standard folder structure              |
| Project selection UI   | ❌         | ✅                | 🔄     | VS Code: Multi-project manager with status bar     |
| Project validation     | ❌         | ✅                | 🔄     | VS Code: Automatic orphaned/missing file detection |

## Soar Source Editing

| Feature                 | VisualSoar | VS Code Extension | Status | Notes                                  |
| ----------------------- | ---------- | ----------------- | ------ | -------------------------------------- |
| Syntax highlighting     | ✅         | ✅                | ✅     | VS Code: TextMate grammar              |
| Auto-formatting         | ✅         | ❌                | ❌     | Not yet implemented                    |
| Comment toggle          | ✅         | ✅                | ✅     | VS Code: Native support                |
| Autocomplete            | ✅         | ✅                | ✅     | VS Code: LSP-based, datamap-aware      |
| Syntax error checking   | ✅         | ✅                | ✅     | VS Code: LSP diagnostics               |
| Datamap validation      | ✅         | ✅                | ✅     | VS Code: Context-aware, precise ranges |
| Multiple editor windows | ✅         | ✅                | ✅     | VS Code: Native split view             |
| Open non-project files  | ✅         | ✅                | ✅     | VS Code: Standard file operations      |
| Template insertion      | ✅         | ✅                | ✅     | VS Code: Snippets system               |
| Custom templates/macros | ✅         | 🚧                | 🚧     | VS Code: User snippets, no macros yet  |
| Editor preferences      | ✅         | ✅                | ✅     | VS Code: Native settings system        |

## Operator Hierarchy

| Feature                  | VisualSoar | VS Code Extension | Status | Notes                             |
| ------------------------ | ---------- | ----------------- | ------ | --------------------------------- |
| Visual hierarchy tree    | ✅         | ✅                | ✅     | VS Code: Layout tree view         |
| Add high-level operators | ✅         | ✅                | ✅     | With automatic datamap creation   |
| Add low-level operators  | ✅         | ✅                | ✅     | Simple operator nodes             |
| Add impasse folders      | ✅         | ❌                | ❌     | Not yet implemented               |
| Add .soar files          | ✅         | ✅                | ✅     | With template content             |
| Add folders              | ✅         | ✅                | ✅     | Organizational structure          |
| Rename nodes             | ✅         | ✅                | ✅     | Non-destructive to code           |
| Delete nodes             | ✅         | ✅                | ✅     | Removes files and datamap entries |
| Import/export (.vse)     | ✅         | ❌                | ❌     | Not planned                       |
| Find/replace in subtree  | ✅         | ❌                | ❌     | Use VS Code search                |
| Double-click to open     | ✅         | ✅                | ✅     | Native click behavior             |
| Path resolution          | ✅         | ✅                | ✅     | Handles nested folders correctly  |
| Orphan file detection    | ❌         | ✅                | 🔄     | VS Code-specific feature          |
| Orphan file import       | ❌         | ✅                | 🔄     | VS Code-specific feature          |

## Datamap System - Model & View

| Feature                | VisualSoar | VS Code Extension | Status | Notes                            |
| ---------------------- | ---------- | ----------------- | ------ | -------------------------------- |
| Tree structure         | ✅         | ✅                | ✅     | Hierarchical representation      |
| Superstate links       | ✅         | ✅                | ✅     | Inheritance support              |
| Recursive references   | ✅         | ✅                | ✅     | VS Code: Cycle detection         |
| Multiple datamap views | ✅         | ✅                | 🔄     | VS Code: Root + substate views   |
| Node type icons        | ✅         | ✅                | ✅     | Visual differentiation           |
| Attribute counts       | ✅         | ✅                | ✅     | Displayed in tree                |
| Operator name hints    | ❌         | ✅                | 🔄     | VS Code: Shows without expansion |

## Datamap System - Editing

| Feature                  | VisualSoar | VS Code Extension | Status | Notes                   |
| ------------------------ | ---------- | ----------------- | ------ | ----------------------- |
| Add SOAR_ID              | ✅         | ✅                | ✅     | Identifier type         |
| Add INTEGER (range)      | ✅         | ✅                | ✅     | With min/max            |
| Add FLOAT (range)        | ✅         | ✅                | ✅     | With min/max            |
| Add ENUMERATION          | ✅         | ✅                | ✅     | Comma-separated choices |
| Add STRING               | ✅         | ✅                | ✅     | Text type               |
| Edit/rename attributes   | ✅         | ✅                | ✅     | Contextual operations   |
| Delete attributes        | ✅         | ✅                | ✅     | Recursive deletion      |
| Comments on nodes        | ✅         | ✅                | ✅     | Attribute descriptions  |
| Drag-and-drop reorganize | ✅         | ❌                | ❌     | Not implemented         |
| Create linked references | ✅         | ❌                | ❌     | Not implemented         |
| Change attribute type    | ✅         | ✅                | ✅     | With warnings           |

## Datamap System - Automation

| Feature                   | VisualSoar | VS Code Extension | Status | Notes                           |
| ------------------------- | ---------- | ----------------- | ------ | ------------------------------- |
| Generate from productions | ✅         | ❌                | ❌     | Not implemented                 |
| Highlight unvalidated     | ✅         | ❌                | ❌     | Different approach              |
| Validate entries          | ✅         | ✅                | ✅     | VS Code: Real-time validation   |
| Remove autogenerated      | ✅         | ❌                | ❌     | Not applicable                  |
| Missing attributes check  | ✅         | ✅                | ✅     | Error diagnostics               |
| Type mismatch check       | ✅         | 🚧                | 🚧     | Partial implementation          |
| Range validation          | ✅         | ❌                | ❌     | Not yet implemented             |
| Enumeration validation    | ✅         | ✅                | ✅     | Context-aware validation        |
| Unbound variable check    | ❌         | ✅                | 🔄     | VS Code-specific                |
| Precise error locations   | ❌         | ✅                | 🔄     | VS Code: Exact attribute ranges |

## Datamap System - Search

| Feature             | VisualSoar | VS Code Extension | Status | Notes                |
| ------------------- | ---------- | ----------------- | ------ | -------------------- |
| Search by attribute | ✅         | ❌                | ❌     | Use VS Code search   |
| Locate productions  | ✅         | ❌                | ❌     | Use workspace search |

## Search and Navigation

| Feature              | VisualSoar | VS Code Extension | Status | Notes                   |
| -------------------- | ---------- | ----------------- | ------ | ----------------------- |
| Global find/replace  | ✅         | ✅                | ✅     | VS Code: Native feature |
| List all productions | ✅         | ❌                | ❌     | Use symbol search       |
| Context-aware search | ✅         | 🚧                | 🚧     | Limited implementation  |
| Go to definition     | ❌         | 🚧                | 🚧     | LSP foundation exists   |
| Find references      | ❌         | ❌                | ❌     | Not implemented         |

## Debugger Interface

| Feature               | VisualSoar | VS Code Extension | Status | Notes                            |
| --------------------- | ---------- | ----------------- | ------ | -------------------------------- |
| Connect to Soar agent | ✅         | ❌                | ❌     | Not planned (different workflow) |
| Send files to agent   | ✅         | ❌                | ❌     | Not planned                      |
| Debugger commands     | ✅         | ❌                | ❌     | Not planned                      |
| Multi-agent support   | ✅         | ❌                | ❌     | Not planned                      |

## Preferences and UI

| Feature                    | VisualSoar | VS Code Extension | Status | Notes                        |
| -------------------------- | ---------- | ----------------- | ------ | ---------------------------- |
| Window tiling              | ✅         | ✅                | ✅     | VS Code: Native layouts      |
| Toggle syntax highlighting | ✅         | ✅                | ✅     | VS Code: Theme system        |
| Toggle autocomplete        | ✅         | ✅                | ✅     | VS Code: Settings            |
| Color customization        | ✅         | ✅                | ✅     | VS Code: Theme customization |
| Font adjustment            | ✅         | ✅                | ✅     | VS Code: Native settings     |
| Preference persistence     | ✅         | ✅                | ✅     | VS Code: Settings sync       |

## File Format Support

| Feature            | VisualSoar | VS Code Extension | Status | Notes                          |
| ------------------ | ---------- | ----------------- | ------ | ------------------------------ |
| .vsa / .vsa.json   | ✅         | ✅                | ✅     | Project files                  |
| .vsproj (legacy)   | ✅         | ✅                | ✅     | Backward compatibility         |
| .soarproj (legacy) | ✅         | ✅                | ✅     | Backward compatibility         |
| .soar files        | ✅         | ✅                | ✅     | Source files                   |
| .dm files          | ✅         | ❌                | 🔄     | VS Code: Embedded in .vsa.json |
| .vse packages      | ✅         | ❌                | ❌     | Not planned                    |

## Language Features

| Feature           | VisualSoar | VS Code Extension | Status | Notes                     |
| ----------------- | ---------- | ----------------- | ------ | ------------------------- |
| Hover information | ❌         | 🚧                | 🚧     | LSP foundation exists     |
| Code completion   | ✅         | ✅                | ✅     | Context-aware             |
| Diagnostics       | ✅         | ✅                | ✅     | Real-time errors/warnings |
| Document symbols  | ❌         | 🚧                | 🚧     | Production listings       |
| Workspace symbols | ❌         | 🚧                | 🚧     | Cross-file search         |

## Testing & Quality

| Feature            | VisualSoar | VS Code Extension | Status | Notes                             |
| ------------------ | ---------- | ----------------- | ------ | --------------------------------- |
| Unit tests         | ?          | ✅                | 🔄     | VS Code: Comprehensive test suite |
| Integration tests  | ?          | ✅                | 🔄     | Mocha-based testing               |
| Syntax error tests | ?          | ✅                | 🔄     | Parser validation                 |
| Validation tests   | ?          | ✅                | 🔄     | Datamap checks                    |

## Summary Statistics

- **Total Features Analyzed**: 100+
- **Fully Implemented (✅)**: ~65
- **Partially Implemented (🚧)**: ~10
- **Not Implemented (❌)**: ~20
- **Alternative Approach (🔄)**: ~10

## Implementation Priorities

### High Priority (Core Functionality)

All high-priority features are implemented ✅

### Medium Priority (Quality of Life)

- Auto-formatting
- Range validation for INTEGER/FLOAT
- Type mismatch checking improvements
- Better hover information
- Document/workspace symbols

### Low Priority (Advanced Features)

- Import/export (.vse) packages
- Impasse folders
- Drag-and-drop datamap editing
- Generate datamap from productions
- Runtime debugger integration

### Not Planned (VS Code Alternatives Exist)

- Custom window tiling (VS Code native)
- Separate preference management (VS Code settings)
- Command-line project opening (VS Code handles)
- Debugger interface (different workflow)

## Key Advantages of VS Code Extension

1. **Better Validation**: Context-aware, precise error locations
2. **Modern IDE**: Native VS Code features (search, git, extensions)
3. **Multi-Project**: Handle multiple projects simultaneously
4. **Auto-Save**: Automatic persistence on operations
5. **Testing**: Comprehensive automated test coverage
6. **Extensibility**: LSP foundation for future features
7. **Cross-Platform**: Works on Windows, macOS, Linux
8. **Modern UI**: Tree views, status bar, command palette
9. **Version Control**: Git integration built-in
10. **Diagnostics Panel**: Centralized error/warning management

## Migration Path from VisualSoar

Projects created in VisualSoar 9.6.4 work seamlessly in VS Code Extension:

1. Open folder containing `.vsa` or `.vsproj` file
2. Extension auto-loads project structure
3. All datamap and layout information preserved
4. Files can be edited in both tools interchangeably
5. Full schema version 6 compatibility

## Version Compatibility

- **VisualSoar**: 9.6.4 (Schema v6)
- **VS Code Extension**: 0.1.8
- **VS Code**: 1.80.0+
- **Node.js**: 18+
- **TypeScript**: 5.9.3
