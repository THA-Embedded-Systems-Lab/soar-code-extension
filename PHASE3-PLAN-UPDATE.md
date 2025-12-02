# Phase 3 Plan Update - Summary

## Change: Java LSP → TypeScript LSP

**Date**: December 2, 2025

### Original Plan (phase3-lsp.md)
- Use external Java-based Soar Language Server from SoarTech
- Require Java installation
- Run server as separate process
- Complex setup and distribution

### Updated Plan (phase3-lsp-typescript.md)
- Implement native TypeScript LSP server
- No external dependencies
- Runs in same process as extension
- Easier maintenance and distribution

## Benefits of TypeScript Implementation

### 1. **No External Dependencies**
- ❌ Old: Requires Java JDK 11+
- ✅ New: Pure TypeScript, no Java needed

### 2. **Simpler Distribution**
- ❌ Old: Bundle JAR file, handle Java paths
- ✅ New: Single extension package

### 3. **Easier Development**
- ❌ Old: Debug across Java/TypeScript boundary
- ✅ New: Debug everything in VS Code

### 4. **Better Integration**
- ❌ Old: Separate server process
- ✅ New: Direct integration with extension

### 5. **Code Reuse**
- ❌ Old: Cannot share code with datamap logic
- ✅ New: Share parser and types across features

### 6. **Faster Startup**
- ❌ Old: JVM startup overhead
- ✅ New: Immediate availability

## Implementation Approach

### Architecture

```
Extension Process
├── Extension Host (src/extension.ts)
├── LSP Client (src/client/lspClient.ts)
└── LSP Server (IPC)
    ├── soarLanguageServer.ts (main server)
    ├── soarParser.ts (parser)
    └── soarTypes.ts (type definitions)
```

### Key Components

1. **Type System** (`soarTypes.ts`)
   - Core Soar language structures
   - Productions, variables, attributes
   - Shared across all features

2. **Parser** (`soarParser.ts`)
   - Regex-based for Phase 3
   - Can be enhanced later with proper grammar
   - Extracts productions, variables, attributes

3. **Language Server** (`soarLanguageServer.ts`)
   - Implements LSP protocol
   - Provides diagnostics, hover, completion
   - Document symbols, go-to-definition

4. **Client** (`lspClient.ts`)
   - Connects extension to server
   - Handles lifecycle (start/stop/restart)

### Features Implemented

#### ✅ Phase 3 Features
- [x] **Diagnostics**: Parse errors
- [x] **Hover**: Production information
- [x] **Completion**: Attributes, variables, functions, keywords
- [x] **Go to Definition**: Jump to productions
- [x] **Document Symbols**: Outline view

#### 🔄 Future Enhancements
- [ ] Find References
- [ ] Rename Symbol
- [ ] Code Actions (Quick Fixes)
- [ ] Formatting
- [ ] Better parser (ANTLR/Chevrotain)
- [ ] Semantic validation

## Migration from Original Plan

### What's Preserved
- All LSP feature goals (diagnostics, hover, completion, etc.)
- Integration points with extension
- Testing approach
- Feature set

### What's Changed
- Implementation language (Java → TypeScript)
- Deployment model (external → embedded)
- Development workflow (no Java tooling needed)
- Dependencies (removed Java requirement)

### What's Better
- Easier onboarding for contributors
- Faster iteration cycles
- Better VS Code integration
- Simpler build and packaging
- More maintainable codebase

## Dependencies

### Added
```json
{
  "vscode-languageclient": "^9.0.0",
  "vscode-languageserver": "^9.0.0", 
  "vscode-languageserver-textdocument": "^1.0.0"
}
```

### Removed
- Java 11+ requirement
- Gradle build system
- External server JAR

## Testing Strategy

### Unit Testing (Future)
- Test parser with various Soar constructs
- Test completion logic
- Test hover information generation

### Integration Testing
- Use test Soar files
- Verify LSP features in Extension Development Host
- Check output channel for errors

### Test Files
- `test/fixtures/test-lsp.soar` - Comprehensive test cases
- `test/fixtures/example.soar` - Existing syntax examples

## Timeline Impact

### Original Phase 3 Estimate
- Download/build Java server: 1-2 hours
- Configure Java paths: 30 min
- Integrate external server: 2-3 hours
- Debug cross-process: 2-4 hours
- **Total: 6-10 hours**

### Updated Phase 3 Estimate
- Implement type system: 30 min
- Implement parser: 2-3 hours
- Implement LSP server: 3-4 hours
- Implement client: 1 hour
- Testing: 1-2 hours
- **Total: 7-10 hours**

**Similar timeline, but:**
- More maintainable result
- Better foundation for future features
- No ongoing Java maintenance

## Reference Usage

The SoarTech Java LSP server is still valuable as a **reference** for:
- Feature completeness checklist
- Expected behavior examples
- Edge cases to handle
- Semantic analysis patterns

**Repository**: https://github.com/soartech/soar-language-server

## Files Organization

### New Files (Phase 3)
```
src/
├── server/
│   ├── soarTypes.ts           # NEW: Type definitions
│   ├── soarParser.ts          # NEW: Parser
│   └── soarLanguageServer.ts  # NEW: LSP server
└── client/
    └── lspClient.ts           # NEW: LSP client
```

### Updated Files
```
src/extension.ts               # Updated: LSP initialization
package.json                   # Updated: Dependencies and commands
```

### Test Files
```
test/fixtures/
├── example.soar               # Existing
└── test-lsp.soar             # NEW: LSP-specific tests
```

## Next Steps After Phase 3

With TypeScript LSP in place, phases 4-7 become easier:

1. **Phase 4**: DataMap logic can share parser types
2. **Phase 5**: Completions can use datamap information
3. **Phase 6**: DataMap checker integrates with diagnostics
4. **Phase 7**: UI can query LSP document cache

## Success Criteria

Phase 3 is complete when:

- [x] Extension compiles without errors
- [x] LSP server starts successfully
- [x] Diagnostics appear for parse errors
- [x] Hover shows production information
- [x] Completions work for attributes, variables, functions
- [x] Go to definition jumps to productions
- [x] Document symbols populate outline view
- [x] No errors in console or output channel

## Documentation

- **Original Plan**: `instructions/phase3-lsp.md` (kept for reference)
- **Updated Plan**: `instructions/phase3-lsp-typescript.md` (use this)
- **This Summary**: `PHASE3-PLAN-UPDATE.md`

---

**Decision**: Implement TypeScript LSP (phase3-lsp-typescript.md)
**Rationale**: Better maintainability, no external dependencies, easier distribution
**Status**: Ready for implementation
**Updated**: December 2, 2025
