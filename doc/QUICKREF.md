# Quick Reference

Essential documentation for the Soar VS Code Extension.

## Documentation Structure

- **README.md** - User guide with features and usage examples
- **ARCHITECTURE.md** - System design, data flow, and implementation details
- **FEATURES.md** - Complete feature list with implementation guidance
- **DATAMAP-CRUD.md** - Detailed guide for datamap operations
- **VISUALSOAR-INTEGRATION.md** - VisualSoar compatibility and schema details

## Quick Links

### For Users

- [Getting Started](../README.md#getting-started)
- [Working with Datamaps](../README.md#working-with-datamaps)
- [Working with Project Structure](../README.md#working-with-project-structure)
- [Commands Reference](../README.md#commands)

### For Developers

- [System Architecture](ARCHITECTURE.md#system-components)
- [Data Flow Diagrams](ARCHITECTURE.md#data-flow)
- [Extension Points](FEATURES.md#extension-points)
- [Testing Guide](FEATURES.md#testing)

### For AI Agents

- [Key Design Patterns](ARCHITECTURE.md#key-design-patterns)
- [Critical Implementation Details](ARCHITECTURE.md#critical-implementation-details)
- [Common Modifications](FEATURES.md#common-modifications)
- [Debugging Tips](FEATURES.md#debugging-tips)

## File Organization

```
/workspaces/soar-vs-code/
├── README.md                    # User documentation
├── ARCHITECTURE.md              # System design for developers
├── FEATURES.md                  # Implementation guide
├── DATAMAP-CRUD.md             # Datamap operations guide
├── VISUALSOAR-INTEGRATION.md   # VisualSoar compatibility
├── REFERENCES.md               # External resources
│
├── src/                        # Source code
│   ├── extension.ts           # Main entry point
│   ├── client/                # LSP client
│   ├── server/                # LSP server & parser
│   ├── datamap/               # Datamap management
│   └── layout/                # Project structure
│
├── syntaxes/                  # TextMate grammar
├── snippets/                  # Code snippets
├── test/                      # Test fixtures and suites
└── package.json              # Extension manifest
```

## Common Tasks

### User Tasks

| Task                  | Action                                 |
| --------------------- | -------------------------------------- |
| Open project          | Open folder with .vsa.json file        |
| View datamap          | Click Soar icon in Activity Bar        |
| Add attribute         | Right-click SOAR_ID → Add Attribute    |
| View substate datamap | Right-click operator → View Datamap    |
| Find orphaned files   | Click search icon in Project Structure |
| Validate file         | Save file (auto) or run command        |

### Development Tasks

| Task            | Command           |
| --------------- | ----------------- |
| Compile         | `npm run compile` |
| Watch mode      | `npm run watch`   |
| Run tests       | `npm test`        |
| Debug extension | Press `F5`        |
| Lint code       | `npm run lint`    |
| Package         | `npm run package` |

### Code Locations

| Feature                  | File                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| Parser position tracking | `src/server/soarParser.ts` → `getPositionInBody()`                    |
| Datamap cycle detection  | `src/datamap/datamapTreeProvider.ts` → `getChildren()`                |
| File path resolution     | `src/layout/layoutTreeProvider.ts` → constructor                      |
| Validation logic         | `src/datamap/datamapValidator.ts` → `validateAttribute()`             |
| CRUD operations          | `src/datamap/datamapOperations.ts` & `src/layout/layoutOperations.ts` |

## Key Concepts

### Project Context

Shared state object containing project file path, parsed project, and lookup indices:

```typescript
{
    projectFile: string,
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    layoutIndex: Map<string, LayoutNode>
}
```

### Datamap Vertex Types

- **SOAR_ID**: Identifier with attributes (children)
- **ENUMERATION**: Fixed set of string choices
- **INTEGER**: Integer range with min/max
- **FLOAT**: Float range with min/max
- **STRING**: String value

### Layout Node Types

- **OPERATOR_ROOT**: Project root
- **HIGH_LEVEL_OPERATOR**: Substate with `dmId`
- **OPERATOR**: Basic operator
- **FILE/FILE_OPERATOR**: Soar/non-Soar files
- **FOLDER**: Directory container

### Validation Strategy

1. Parse document to extract attributes
2. Check if each attribute exists in datamap
3. Report errors with exact attribute position
4. Severity: ERROR (breaks Soar import)

## Configuration

### Extension Settings

```json
{
  "soar.maxNumberOfProblems": 100,
  "soar.trace.server": "off"
}
```

### Context Values (for menus)

- `datamap-root`: Root node
- `datamap-attribute-{type}`: Attribute by type
- `layout-{type}`: Layout node by type

## Troubleshooting

| Issue                  | Solution                                             |
| ---------------------- | ---------------------------------------------------- |
| Files won't open       | Check `layoutTreeProvider.ts` path resolution        |
| Wrong line highlighted | Check `soarParser.ts` position calculation           |
| Datamap not loading    | Verify project file format and schema version        |
| Infinite expansion     | Check cycle detection in `datamapTreeProvider.ts`    |
| Validation not working | Ensure project file loaded, check console for errors |

## Version Compatibility

- **VS Code**: 1.80.0+
- **Node.js**: 18+
- **VisualSoar**: 9.6.4 (Schema version 6)
- **TypeScript**: 5.0+

## Essential Commands

```bash
# Development
npm install              # Install dependencies
npm run compile          # Compile once
npm run watch           # Watch mode
npm test                # Run tests
npm run lint            # Run linter

# Debugging
F5                      # Launch Extension Development Host
Ctrl+Shift+P           # Command Palette
Ctrl+Shift+M           # Problems Panel
Ctrl+`                 # Terminal
```

## Quick Tips

### For Users

- Project auto-loads on folder open
- Files auto-validate on save
- Right-click for context menus
- Use home icon to return to root datamap

### For Developers

- Set breakpoints before pressing F5
- Use `console.log()` for debugging (appears in Debug Console)
- Check Problems panel for TypeScript errors
- Test with BW-Hierarchical fixture for complex scenarios

### For AI Agents

- Read ARCHITECTURE.md first for system overview
- Check FEATURES.md for implementation patterns
- Follow existing code style and patterns
- Test changes with both simple and hierarchical projects
- Maintain VisualSoar compatibility (schema version 6)

## Resources

- **Soar Manual**: https://soar.eecs.umich.edu/
- **VisualSoar**: https://github.com/SoarGroup/VisualSoar
- **VS Code API**: https://code.visualstudio.com/api
- **Schema**: https://github.com/SoarGroup/VisualSoar/blob/master/doc/project_schema.json

## Support

- Check documentation first
- Search issues in repository
- Read error messages carefully
- Enable verbose logging if needed

---

**Last Updated**: December 2, 2025
**Extension Version**: 0.1.0
