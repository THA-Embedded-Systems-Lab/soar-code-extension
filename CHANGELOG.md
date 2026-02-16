## [0.4.1] - 2026-02-16

### Testing

- Extend timeout for undo manager test

### Miscellaneous Tasks

- Add changelog and create changelog configuration
- Release 0.4.1

## [0.4.0] - 2026-02-15

### Features

- Enhance project loading and datamap validation with new indexing and metadata features
- Undo/ redo ([#2](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/2))

### Bug Fixes

- _(parser)_ Enhance parsing logic to handle strings and parentheses correctly; add new test fixtures ([#10](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/10))
- _(parser)_ Enhance attribute parsing to support path disjunction and update test fixtures ([#11](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/11))
- Use syntax of unmaintained soar extension ([#8](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/8))
- Add missing automatic test files
- _(datamap)_ Add test ([#7](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/7))
- _(projectManager)_ Implement file system watcher for active project file changes ([#3](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/3))
- _(undoManager)_ Reduce max stack size from 50 to 25 and update related tests

### Other

- Update tests

### Refactor

- Improve test suite setup

### Documentation

- Update readme

### Miscellaneous Tasks

- Use x server for linux

## [0.3.1] - 2025-12-16

### Miscellaneous Tasks

- Update package version to 0.3.1 and add ajv dependency

## [0.3.0] - 2025-12-16

### Features

- _(tests)_ Add SmartSander test case and corresponding fixture for unbound variable diagnostics
- _(layout)_ Enhance addFile functionality to support folder path overrides and add programmatic file addition method
- _(source-scripts)_ Implement source script management and diagnostics analysis
- _(definition-provider)_ Add definition provider for source scripts and corresponding tests
- _(validation)_ [**breaking**] Implement project schema validation and diagnostics reporting

### Bug Fixes

- Resolve testing timeout issues
- _(layout)_ Update source reference management and ensure directory creation for new files

## [0.2.1] - 2025-12-06

### Features

- _(datamap)_ Enhance linked attribute functionality and add CRUD tests
- _(datamap)_ Add hasLinkedSiblings attribute and update tree view representation
- Update version to 0.2.1 and change icon for SOAR_ID type in datamap tree view

### Bug Fixes

- _(projectManager)_ Implement active project change event and refactor project loading logic

### Testing

- Add water jug simple for linked test

## [0.2.0] - 2025-12-05

### Features

- _(parser)_ Enhance attribute parsing to support context-aware attributes and multiple values
- _(parser)_ Enhance context attribute parsing to support new patterns and multiple values
- _(parser)_ Skip validation for '-' in attributes and add tests for WME removal
- _(parser)_ Update validation command to target selected project instead of workspace
- _(parser)_ Enhance project loading by adding recursive search for project files in subdirectories
- Add project creation command and test
- _(tests)_ Add validation test for created project without datamap errors
- _(tests)_ Add tests for deleting operators and restoring initial state
- _(layout)_ Enhance layout view to highlight currently viewed datamap
- _(datamap)_ Improve datamap ID handling and update layout view messaging
- _(commands)_ Remove 'Add Substate' command from extension and package.json
- _(lsp)_ Implement project change notification handling in LSP server and improve context aware autocompletions
- _(datamap)_ Enhance attribute validation with detailed error messages and path analysis
- _(tests)_ Add unit tests for completion logic and datamap attribute suggestions
- _(datamap)_ Add validation for unbound variables in production attributes
- _(datamap)_ Escalate missing LSP in completion tests to failure; reduce logging for tests
- Add VisualSoar feature specification document
- _(validation)_ Add command to find missing files and validate project structure
- _(schema)_ Add project schema for VisualSoar with detailed definitions and properties
- _(validation)_ Enhance datamap validation to include document text for precise error reporting
- _(validation)_ Enhance enumeration validation to utilize variable bindings for context
- _(validation)_ Improve error reporting by adding precise attribute range detection
- _(parser)_ Implement comment stripping to preserve line structure during parsing
- _(docs)_ Update VisualSoar feature specification to a comparison format with VS Code Extension
- _(package)_ Update version to 0.2.0

### Bug Fixes

- Increase timeout duration
- _(tests)_ Correct attribute completion syntax in test cases
- _(tests)_ Increase tests and add missing parenthesis

### Refactor

- _(parser)_ Streamline validation methods and enhance enumeration checks
- _(tests)_ Remove typo validation in test project

### Testing

- _(parser)_ Add enumeration error detection for project validation
- Add test for operator and high level operator creation

### Miscellaneous Tasks

- Reduce dependency and reduce trigger frequency
- Update code formatting

## [0.1.8] - 2025-12-03

### Features

- Implement project management features including project selection and loading from file

## [0.1.7] - 2025-12-03

### Features

- Enhance collectProjectFiles method to include parent folder path and improve orphaned files report formatting

### Bug Fixes

- Update version number to 0.1.7 in package.json

## [0.1.5] - 2025-12-03

### Features

- Add layout tree provider and project synchronization utilities
- Add commands to view datamap and root datamap in the layout
- Enhance datamap validation with detailed error range and improve parser position calculations
- Add CI workflow for build, test, and linting processes
- Update version to 0.1.4, change activation event, and add restart command for LSP client
- Add MIT license and update publisher and repository details in package.json
- Enhance CI workflow with release job and update Node.js caching

### Bug Fixes

- Update validation message and severity for missing attributes in datamap
- Enhance LayoutTreeItem to support parent path for file resource URIs
- Remove Java feature configuration from devcontainer setup
- Dependency
- Align lock file with package.json
- Standardize quotes and remove redundant linting steps in CI workflow
- Update CI workflow to use Node.js 20.x and streamline test execution
- Remove pre-commit checks from CI workflow
- Update publisher name and repository URL in package.json; correct extension identifier in tests
- Update version number to 0.1.5 in package.json

### Documentation

- Update documentation
