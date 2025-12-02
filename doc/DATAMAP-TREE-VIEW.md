# Soar Datamap Tree View

## Overview

The Soar extension now includes a dedicated side panel in VS Code to visualize
the datamap structure from your Soar project file (`.vsa.json`).

## Location

The Soar panel appears in the Activity Bar (left sidebar) with a circuit board
icon (⚡). Click it to open the Soar Explorer.

## Features

### Datamap Tree View

- **Hierarchical Display**: Shows the complete datamap structure as a tree
- **Attribute Navigation**: Expand/collapse nodes to explore attribute relationships
- **Type Icons**: Different icons for different vertex types:
  - 🔷 SOAR_ID (object)
  - 🔢 INTEGER/FLOAT (numbers)
  - 📝 STRING (text)
  - 📋 ENUMERATION (enum)
  - 📄 JAVA_FILE (code file)
- **Rich Information**: Hover over items to see:
  - Vertex type
  - Vertex ID
  - Comments (if available)
  - Number of attributes
  - Enumeration choices

### Auto-Loading

The datamap automatically loads when you open a workspace containing a Soar project file:

- `.vsa.json` (default format)
- `.vsproj` (VisualSoar compatibility)
- `.soarproj` (legacy format)

### Manual Refresh

Click the refresh icon (🔄) in the Datamap view title bar to reload the project file.

## Usage

1. **Open a workspace** with a Soar project file (`.vsa.json`, `.vsproj`, or `.soarproj`)
2. **Click the Soar icon** in the Activity Bar
3. **Explore the datamap** by expanding tree nodes
4. **Hover** over attributes to see detailed information

## Project File Format

The extension uses `.vsa.json` (Visual Soar Agent) as the default project file
format. This format follows the VisualSoar Schema v6 specification and is fully
compatible with VisualSoar 9.6.4 `.vsproj` files.

**Supported formats (in priority order):**

1. `.vsa.json` - Default format for this extension
2. `.vsproj` - VisualSoar native format (backward compatibility)
3. `.soarproj` - Legacy format (backward compatibility)

## Example

Given this datamap structure in your project file:

```
root-state
  ^io
    ^input-link
      ^data (STRING)
      ^value (INTEGER)
    ^output-link
      ^command (ENUMERATION)
      ^status (ENUMERATION)
  ^operator
    ^name (ENUMERATION)
```

The tree view will display:

```
📦 root-state (5 attributes)
  ├─ ^io (2 attributes)
  │   ├─ ^input-link (2 attributes)
  │   │   ├─ ^data string
  │   │   └─ ^value integer
  │   └─ ^output-link (2 attributes)
  │       ├─ ^command {move | stop | ...}
  │       └─ ^status {complete | running | ...}
  └─ ^operator (1 attributes)
      └─ ^name {operator1 | operator2 | ...}
```

## Commands

- **Soar: Refresh Datamap** - Reload the datamap from the project file
- **Soar: Load Datamap** - Manually load a datamap (useful if auto-load failed)

## Next Steps

Future enhancements will include:

- Editing capabilities (add/remove vertices and edges)
- Visual datamap graph view
- Sync with Soar code changes
- Export/import functionality
