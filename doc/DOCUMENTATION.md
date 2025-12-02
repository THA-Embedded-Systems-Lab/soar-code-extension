# Documentation Overview

This directory contains comprehensive documentation for the Soar VS Code Extension.

## 📚 Documentation Files

### For End Users

- **[README.md](../README.md)** - Main user guide
  - Features overview
  - Installation instructions
  - Usage examples
  - Commands reference
  - Configuration options

### For Developers

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design and implementation

  - Component overview
  - Data flow diagrams
  - Design patterns
  - Critical implementation details
  - Performance considerations

- **[FEATURES.md](FEATURES.md)** - Feature implementation guide

  - Complete feature list
  - Implementation details
  - Extension points
  - Testing guidelines
  - Common modifications

- **[QUICKREF.md](QUICKREF.md)** - Quick reference card
  - Common tasks
  - File locations
  - Key concepts
  - Troubleshooting
  - Commands cheat sheet

### For VisualSoar Integration

- **[VISUALSOAR-INTEGRATION.md](VISUALSOAR-INTEGRATION.md)** - VisualSoar compatibility

  - Project schema (version 6)
  - Type definitions
  - Bidirectional compatibility
  - File format details

- **[DATAMAP-CRUD.md](DATAMAP-CRUD.md)** - Datamap operations

  - Add/edit/delete attributes
  - Usage examples
  - Best practices
  - Troubleshooting

- **[DATAMAP-TREE-VIEW.md](DATAMAP-TREE-VIEW.md)** - Tree view details
  - Display format
  - Navigation
  - Context menus

### For Reference

- **[REFERENCES.md](REFERENCES.md)** - External resources
  - API documentation links
  - Code examples
  - Community resources
  - Tools and libraries

## 🎯 Quick Navigation

### I want to

**Use the extension**
→ Start with [README.md](README.md)

**Understand how it works**
→ Read [ARCHITECTURE.md](ARCHITECTURE.md)

**Modify or extend it**
→ Check [FEATURES.md](FEATURES.md)

**Find something quickly**
→ Use [QUICKREF.md](QUICKREF.md)

**Work with datamaps**
→ See [DATAMAP-CRUD.md](DATAMAP-CRUD.md)

**Ensure VisualSoar compatibility**
→ Follow [VISUALSOAR-INTEGRATION.md](VISUALSOAR-INTEGRATION.md)

## 📊 Project Statistics

- **Total Code**: ~4,400 lines of TypeScript
- **Components**: 5 main systems (Extension, LSP, Datamap, Layout, Client)
- **Commands**: 18 registered commands
- **Tree Views**: 2 (Datamap, Layout)
- **VisualSoar Schema**: Version 6 (compatible with 9.6.4)

## 🏗️ System Overview

```
Extension Architecture
├── Extension Host (extension.ts)
│   ├── Commands & Event Handlers
│   ├── View Providers
│   └── Validation Coordinator
│
├── Language Server (server/)
│   ├── Parser (accurate position tracking)
│   ├── Project Loader
│   └── Type Definitions
│
├── Datamap System (datamap/)
│   ├── Tree Provider (with cycle detection)
│   ├── CRUD Operations
│   └── Validator (attribute checking)
│
└── Layout System (layout/)
    ├── Tree Provider (file path resolution)
    ├── CRUD Operations
    ├── Project Sync
    └── Templates
```

## 🔑 Key Features

✅ Syntax highlighting with TextMate grammar
✅ Real-time validation against datamap
✅ Visual datamap editor with CRUD operations
✅ Project structure tree with navigation
✅ VisualSoar 9.6.4 compatibility
✅ Orphaned file detection and import
✅ Multiple datamap views (root and substates)
✅ Accurate error positioning
✅ Cycle detection in datamap

## 🎓 Learning Path

### For AI Agents / New Developers

1. **Start**: Read [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
2. **Understand**: Review [FEATURES.md](FEATURES.md) for implementation patterns
3. **Explore**: Check [QUICKREF.md](QUICKREF.md) for quick lookups
4. **Reference**: Use [VISUALSOAR-INTEGRATION.md](VISUALSOAR-INTEGRATION.md) for schema details

### Key Concepts to Understand

1. **Project Context**: Shared state object with project data and indices
2. **Tree View Pattern**: How tree providers work with custom items
3. **Position Tracking**: Parser's method for accurate diagnostics
4. **Cycle Detection**: Preventing infinite loops in datamap
5. **Path Resolution**: Building correct file paths for nested structures

## 🐛 Common Issues & Solutions

| Issue                | Document        | Section                     |
| -------------------- | --------------- | --------------------------- |
| Files won't open     | ARCHITECTURE.md | File Path Resolution        |
| Wrong error location | ARCHITECTURE.md | Parser Position Calculation |
| Datamap not loading  | QUICKREF.md     | Troubleshooting             |
| Infinite expansion   | ARCHITECTURE.md | Datamap Cycle Prevention    |

## 🔧 Development Workflow

```bash
# Setup
npm install
npm run compile

# Development
npm run watch      # Auto-compile on changes
Press F5          # Launch Extension Development Host

# Testing
npm test          # Run test suite

# Packaging
npm run package   # Create .vsix file
```

## 📝 Documentation Standards

When updating documentation:

1. **README.md**: User-facing features and instructions
2. **ARCHITECTURE.md**: System design and implementation details
3. **FEATURES.md**: Implementation guide for developers
4. **QUICKREF.md**: Quick lookups and common tasks

Keep all documentation in sync when adding features or making changes.

## 🔗 External Links

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Soar Manual](https://soar.eecs.umich.edu/)
- [VisualSoar GitHub](https://github.com/SoarGroup/VisualSoar)
- [Project Schema](https://github.com/SoarGroup/VisualSoar/blob/master/doc/project_schema.json)

## 📅 Last Updated

**Date**: December 2, 2025
**Version**: 0.1.0
**Schema Compatibility**: VisualSoar 6 (9.6.4)

---

_All documentation is written to be accessible to both human developers and AI coding agents._
