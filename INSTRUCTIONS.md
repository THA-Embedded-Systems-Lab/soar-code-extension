# Soar VS Code Extension - Build Instructions

## Overview

This document provides a comprehensive roadmap for building a complete Soar VS Code extension from scratch. The extension will combine syntax support, LSP-based IDE features, VisualSoar datamap utilities, and development helpers.

## Project Goals

1. **LSP Integration** - Integrate the SoarTech language server for diagnostics, hovers, completions, and definitions
2. **Syntax Highlighting** - Implement TextMate grammar-based syntax highlighting
3. **DataMap-Based Code Suggestions** - Use datamap information for intelligent completions
4. **DataMap Checker** - Port VisualSoar's DataMap validation logic
5. **DataMap Creation Helper** - Provide UI tools for building and modifying datamaps

## Key Resources

- **Soar Language Server**: https://github.com/soartech/soar-language-server
- **Legacy VS Code Extension**: https://bitbucket.org/bdegrendel/soar-vscode-extension/src/master/
- **VisualSoar**: https://github.com/SoarGroup/VisualSoar

## Build Phases

The project is divided into 8 distinct phases. Each phase has its own detailed instruction file:

### Phase 1: Project Scaffolding
**File**: `instructions/phase1-scaffolding.md`
**Goal**: Set up the basic VS Code extension structure
**Deliverables**: 
- Basic extension manifest (package.json)
- TypeScript configuration
- Project structure
- Build system

### Phase 2: Syntax Highlighting
**File**: `instructions/phase2-syntax.md`
**Goal**: Implement Soar syntax highlighting
**Deliverables**:
- TextMate grammar (soar.tmLanguage.json)
- Language configuration
- Basic tokenization and scopes

### Phase 3: LSP Integration
**File**: `instructions/phase3-lsp.md`
**Goal**: Integrate the Soar Language Server
**Deliverables**:
- LSP client setup
- Server spawning and lifecycle management
- Basic IDE features (diagnostics, hover, go-to-definition)

### Phase 4: DataMap Logic Port
**File**: `instructions/phase4-datamap-logic.md`
**Goal**: Port VisualSoar's DataMap logic to TypeScript
**Deliverables**:
- DataMap data structures
- Parser for datamap files
- Core datamap operations

### Phase 5: DataMap-Based Completions
**File**: `instructions/phase5-datamap-completions.md`
**Goal**: Implement intelligent code suggestions using datamap
**Deliverables**:
- Completion provider
- Symbol table from datamap
- Context-aware suggestions

### Phase 6: DataMap Checker
**File**: `instructions/phase6-datamap-checker.md`
**Goal**: Implement datamap validation and diagnostics
**Deliverables**:
- Validation logic (cycles, duplicates, undefined links)
- Diagnostic reporting
- Error messages

### Phase 7: DataMap UI
**File**: `instructions/phase7-datamap-ui.md`
**Goal**: Build user interface for datamap manipulation
**Deliverables**:
- TreeView or Webview panel
- Commands for datamap CRUD operations
- Visual datamap editor

### Phase 8: Testing & Packaging
**File**: `instructions/phase8-testing-packaging.md`
**Goal**: Test, package, and prepare for publication
**Deliverables**:
- Unit tests
- Integration tests
- vsce packaging
- Documentation

## Recommended Workflow

1. **Complete phases sequentially** - Each phase builds on the previous
2. **Test after each phase** - Ensure functionality before moving forward
3. **Commit frequently** - Use git to track progress
4. **Reference existing code** - Use the legacy extension and VisualSoar as guides
5. **Document as you go** - Update README and inline comments

## Success Criteria

The project is complete when:

- [ ] Extension activates for .soar files
- [ ] Syntax highlighting works correctly
- [ ] LSP features are functional (diagnostics, hover, completion, definition)
- [ ] DataMap can be loaded and parsed
- [ ] DataMap-based completions are available
- [ ] DataMap checker identifies validation errors
- [ ] DataMap UI allows viewing and editing
- [ ] All tests pass
- [ ] Extension is packaged as .vsix
- [ ] Documentation is complete

## Project Structure

```
soar-vscode-extension/
├── package.json                    # Extension manifest
├── tsconfig.json                   # TypeScript configuration
├── syntaxes/
│   └── soar.tmLanguage.json        # TextMate grammar
├── language-configuration.json     # Language config (brackets, comments)
├── src/
│   ├── extension.ts                # Extension entry point
│   ├── client/
│   │   └── lspClient.ts            # LSP client setup
│   ├── datamap/
│   │   ├── index.ts                # DataMap core logic
│   │   ├── parser.ts               # DataMap file parser
│   │   ├── validator.ts            # DataMap checker
│   │   └── types.ts                # DataMap type definitions
│   ├── providers/
│   │   └── completionProvider.ts   # DataMap-based completions
│   ├── ui/
│   │   ├── treeview.ts             # TreeView for datamap
│   │   └── webview/
│   │       └── datamapPanel.ts     # Webview panel for datamap
│   └── server/                     # Server wrapper or binary
├── test/
│   └── suite/
│       └── extension.test.ts       # Extension tests
├── instructions/                   # Phase-by-phase instructions
├── INSTRUCTIONS.md                 # This file
└── README.md                       # User-facing documentation
```

## Getting Started

1. Read through this entire document
2. Review the REFERENCES.md file for links to source code
3. Start with Phase 1 instructions
4. Work through each phase systematically
5. Test thoroughly at each step

## Support and Resources

- **VS Code Extension API**: https://code.visualstudio.com/api
- **LSP Specification**: https://microsoft.github.io/language-server-protocol/
- **TextMate Grammars**: https://macromates.com/manual/en/language_grammars
- **vscode-languageclient**: https://www.npmjs.com/package/vscode-languageclient

## Notes

- The Soar Language Server may need modifications to work seamlessly with VS Code
- DataMap logic from VisualSoar is complex - budget significant time for Phase 4
- Consider starting with a minimal viable product (Phases 1-3) before adding advanced features
- The LSP server handles most IDE features - don't duplicate work

## Next Steps

Proceed to `instructions/phase1-scaffolding.md` to begin building the extension.
