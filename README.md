# Soar VS Code Extension

A comprehensive VS Code extension for the Soar cognitive architecture, providing
syntax highlighting, intelligent code validation, datamap management, and
seamless VisualSoar project integration.

## Features

### Project Creation

- **Command**: "Create New Soar Project"
- **Guided Setup**: Select directory and enter agent name
- **Default Datamap**: Standard Soar state structure with IO, memory systems
- **File Scaffolding**: Complete folder structure with source files
- **VisualSoar Compatible**: Generates .vsa.json project files
- **Ready to Run**: Includes initialization operator and elaborations

### Syntax Highlighting

- Complete TextMate grammar for Soar productions
- Color-coded keywords, variables, attributes, and operators
- Support for comments, strings, and numeric literals

### Language Server Protocol (LSP)

- **Real-time Validation**: Checks code against project datamap
- **Diagnostics**: Highlights errors at exact attribute locations
- **Code Intelligence**: Foundation for completions and navigation

### Datamap Management

- **Tree View**: Visual representation of working memory structure
- **CRUD Operations**: Add, edit, delete attributes via UI
- **Type Support**: SOAR_ID, ENUMERATION, INTEGER, FLOAT, STRING
- **Cycle Detection**: Prevents infinite expansion of recursive structures
- **Multiple Views**: Switch between root and substate datamaps

### Project Structure

- **Layout Tree**: Hierarchical view of operators and files
- **VisualSoar Compatible**: Full bidirectional compatibility
- **Quick Navigation**: Click to open files
- **CRUD Operations**: Add operators, substates, files, folders
- **Orphan Detection**: Find and import untracked .soar files

### Code Validation

- Validates attributes against datamap structure
- Reports errors at actual attribute locations
- Escalated to errors (breaks Soar import if invalid)
- Auto-validates on save

## Getting Started

### Prerequisites

- VS Code 1.80.0 or higher
- Node.js 18+ (for development)

### Installation

#### From VSIX (Recommended)

1. Download the `.vsix` file from releases
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click `...` menu → `Install from VSIX`
5. Select the downloaded file

CLI installation via `code --install-extension ./soar-<version>.vsix` in the VS
Code terminal.

#### From Source

```bash
git clone <repository-url>
cd soar-vs-code
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

### Quick Start

1. **Create a New Project**

   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run "Soar: Create New Soar Project"
   - Select a directory and enter your agent name
   - Project structure is automatically generated

2. **Open an Existing Soar Project**

   - Open a folder containing a `.vsa.json`, `.vsproj`, or `.soarproj` file
   - The extension auto-loads the project structure

3. **View Datamap**

   - Open the Soar sidebar (circuit board icon in Activity Bar)
   - Explore the "Datamap" tree view
   - Right-click to add/edit/delete attributes

4. **Navigate Project Structure**

   - View the "Project Structure" tree
   - Click files to open them
   - Right-click to add operators or substates

5. **Write Soar Code**
   - Create a `.soar` file
   - Get syntax highlighting automatically
   - Save to validate against datamap

## Usage

### Working with Datamaps

#### View Datamap

The datamap tree shows your agent's working memory structure:

- Root node shows the top-level state
- Attributes appear without the `^` prefix
- ENUMERATION types show possible values
- Operator attributes show operator names

#### Add Attribute

1. Right-click a SOAR_ID node in the datamap tree
2. Select "Add Attribute"
3. Enter attribute name (e.g., `position`, `status`)
4. Choose type (SOAR_ID, ENUMERATION, INTEGER, FLOAT, STRING)
5. For ENUMERATION, enter comma-separated values
6. Optionally add a comment

#### Edit Attribute

1. Right-click an attribute
2. Select "Edit Attribute"
3. Choose what to edit:
   - **Rename**: Change attribute name
   - **Edit Comment**: Add/modify description
   - **Change Type**: Convert to different type (⚠️ may delete children)

#### Delete Attribute

1. Right-click an attribute
2. Select "Delete Attribute"
3. Confirm (⚠️ deletes all child attributes)

#### View Substate Datamap

1. Right-click a HIGH_LEVEL_OPERATOR in the project structure
2. Select "View Datamap"
3. The datamap view switches to that substate
4. Click the home icon to return to root datamap

### Working with Project Structure

#### Add Operator

1. Right-click a folder or operator in the project structure
2. Select "Add Operator"
3. Enter operator name
4. A new .soar file is created

#### Add Substate

1. Right-click a folder or operator
2. Select "Add Substate"
3. Enter substate name
4. Creates folder, file, and datamap vertex

#### Find Orphaned Files

1. Click the search icon in the Project Structure toolbar
2. Review list of .soar files not in the project
3. Select files to import
4. Files are added to the project structure

### Code Validation

Validation happens automatically on save:

```soar
sp {example
   (state <s> ^io <io>        # Valid - 'io' in datamap
              ^foo <f>)       # ERROR - 'foo' not in datamap
   (<io> ^input-link <in>)   # Valid
-->
   (<s> ^result ok)
}
```

Errors appear:

- In the editor (red squigglies)
- In the Problems panel (`Ctrl+Shift+M`)
- At the exact attribute location

### Commands

Access via Command Palette (`Ctrl+Shift+P`):

| Command                                           | Description                                      |
| ------------------------------------------------- | ------------------------------------------------ |
| `Soar: Refresh Datamap`                           | Reload datamap from project file                 |
| `Soar: Refresh Project Structure`                 | Reload project structure                         |
| `Soar: View Root Datamap`                         | Return to root datamap view                      |
| `Soar: Validate Against Datamap`                  | Manually validate current file                   |
| `Soar: Validate Selected Project Against Datamap` | Validate all .soar files in the selected project |
| `Soar: Find Orphaned Files`                       | Find untracked .soar files                       |
| `Soar: Sync Project Files`                        | Import orphaned files                            |

## Project File Format

The extension uses VisualSoar's project format (.vsa.json):

```json
{
  "version": "6",
  "datamap": {
    "rootId": "root-state",
    "vertices": [
      {
        "id": "root-state",
        "type": "SOAR_ID",
        "outEdges": [
          {
            "name": "io",
            "toId": "io-vertex",
            "comment": "Input/output interface"
          }
        ]
      }
    ]
  },
  "layout": {
    "type": "OPERATOR_ROOT",
    "id": "root",
    "name": "MyProject",
    "folder": ".",
    "children": []
  }
}
```

**Compatible with VisualSoar 9.6.4** - Projects can be opened in both tools.

## Development

### Setup

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode for development
npm run lint         # Run ESLint
npm test             # Run unit tests (mocha)
npm run test:ci      # Run integration tests (VS Code environment)
```

### Debug Extension

1. Open project in VS Code
2. Press `F5` to launch Extension Development Host
3. Set breakpoints in TypeScript files
4. Test in the debug window

### Testing

The extension has two test configurations:

**Unit Tests** (`npm test`)

- Fast mocha tests that run in Node.js
- Tests for parsers, validators, and core logic
- No VS Code environment required
- Use for TDD and quick feedback

**Integration Tests** (`npm run test:ci`)

- Full VS Code extension host tests
- Tests LSP client/server, tree views, commands
- Runs in headless VS Code environment
- Use for E2E validation

Both test suites run in CI on all platforms (Linux, Windows, macOS).

### Release Process

To create a new release:

1. **Create Git Tag**

   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```

   This triggers CI to build, test, and create a GitHub release with the VSIX package.

2. **Generate Changelog**

   ```bash
   git-cliff > CHANGELOG.md
   ```

   Updates the changelog based on conventional commits since the last tag.

3. **Commit Changelog**

   ```bash
   git add CHANGELOG.md
   git commit -m "chore: update changelog for 1.0.0"
   git push
   ```

### Project Structure

```
src/
├── extension.ts              # Main entry point
├── client/                   # LSP client
├── server/                   # LSP server & parser
├── datamap/                  # Datamap management
└── layout/                   # Project structure
```

See [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) for detailed system design.

## VisualSoar Compatibility

✅ **Full bidirectional compatibility** with VisualSoar 9.6.4

- Open VisualSoar projects in VS Code
- Edit projects in VS Code, open in VisualSoar
- Preserves all project metadata
- Supports all node types and vertex types

## Configuration

### Extension Settings

```json
{
  "soar.maxNumberOfProblems": 100,
  "soar.trace.server": "off" // or "messages", "verbose"
}
```

## Known Issues

- **Large Projects**: Very large projects (>10K lines) may have slow initial validation
- **Foreign Datamaps**: External datamap references not fully implemented yet

## Contributing

Contributions welcome! See [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) for system design details.

### Development Guidelines

1. Maintain VisualSoar schema compatibility
2. Test with both simple and hierarchical projects
3. Follow existing code patterns
4. Update documentation for new features

## Resources

- [Soar Cognitive Architecture](https://soar.eecs.umich.edu/)
- [VisualSoar](https://github.com/SoarGroup/VisualSoar)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Project Schema](https://github.com/SoarGroup/VisualSoar/blob/master/doc/project_schema.json)

## License

[License](./LICENSE)

## Documentation

For detailed documentation, see the [doc/](doc/) directory:

- [ARCHITECTURE.md](doc/ARCHITECTURE.md) - System design and implementation
- [FEATURES.md](doc/FEATURES.md) - Feature implementation guide
- [QUICKREF.md](doc/QUICKREF.md) - Quick reference card
- [DATAMAP-CRUD.md](doc/DATAMAP-CRUD.md) - Datamap operations guide
- [VISUALSOAR-INTEGRATION.md](doc/VISUALSOAR-INTEGRATION.md) - VisualSoar compatibility
- [REFERENCES.md](doc/REFERENCES.md) - External resources
