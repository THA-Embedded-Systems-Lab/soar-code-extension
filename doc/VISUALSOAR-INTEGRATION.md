# VisualSoar Project Schema Integration

## Overview

This document details how the VS Code extension integrates with VisualSoar's project format to ensure seamless transitions between tools.

## Schema Version

- **VisualSoar Version**: 9.6.4
- **Schema Version**: 6
- **Schema URL**: https://github.com/SoarGroup/VisualSoar/blob/master/doc/project_schema.json

## Project File Structure

VisualSoar projects use a JSON file (typically `.vsproj` or `.soarproj`) with the following structure:

```json
{
  "version": "6",
  "datamap": { ... },
  "layout": { ... }
}
```

## Key Components

### 1. Datamap

The datamap defines the working memory structure of the Soar agent.

**Structure:**
- `rootId`: ID of the root vertex (typically `<s>` state)
- `vertices`: Array of datamap vertices

**Vertex Types:**
- `SOAR_ID`: Identifier with outgoing edges (attributes)
- `ENUMERATION`: Set of possible string values
- `INTEGER`: Integer range with min/max
- `FLOAT`: Float range with min/max
- `STRING`: String value
- `FOREIGN`: Reference to external datamap

### 2. Layout

The layout defines the file/folder/operator structure.

**Node Types:**
- `FILE`: Non-Soar files (txt, png, etc.)
- `FILE_OPERATOR`: Soar file associated with operator
- `FOLDER`: Directory container
- `OPERATOR`: Basic operator node
- `HIGH_LEVEL_OPERATOR`: Operator with sub-operators
- `HIGH_LEVEL_FILE_OPERATOR`: File operator with sub-operators
- `IMPASSE_OPERATOR`: Impasse handling operator
- `HIGH_LEVEL_IMPASSE_OPERATOR`: High-level impasse operator
- `OPERATOR_ROOT`: Project root node
- `LINK`: Reference to node elsewhere (legacy)

## LSP Integration Requirements

### Mandatory Features

1. **Project File Detection**
   - Scan workspace for `.vsproj` or `.soarproj` files
   - Parse and validate against schema
   - Load datamap and layout information

2. **Datamap-Aware Completions**
   - Use datamap to suggest valid attributes
   - Provide type information from vertex types
   - Suggest enumeration choices

3. **Datamap-Based Diagnostics**
   - Warn about undefined attributes
   - Check attribute values against types
   - Validate against enumeration choices
   - Check integer/float ranges

4. **Project-Aware Navigation**
   - Use layout structure for file organization
   - Navigate between operator files
   - Understand operator hierarchy

5. **Compatibility**
   - Read existing VisualSoar projects
   - Write projects that VisualSoar can read
   - Preserve all schema fields

## Implementation Plan

### Phase 3 (LSP) Updates

Add project schema awareness to the LSP server.

**Files to Create:**
- `src/server/visualSoarProject.ts` - Project schema types and loader
- `src/server/datamapTypes.ts` - Datamap-specific types
- `src/server/layoutTypes.ts` - Layout-specific types

**Files to Modify:**
- `src/server/soarLanguageServer.ts` - Add project context
- `src/server/soarParser.ts` - Use datamap for validation

### Phase 4 (Datamap Logic) Updates

Implement full datamap support compatible with VisualSoar.

**Features:**
- Load/save datamap in VisualSoar format
- Graph representation matching VisualSoar
- Support all vertex types
- Handle foreign datamaps

### Phase 5 (Completions) Updates

Use datamap for context-aware completions.

**Features:**
- Attribute suggestions from datamap
- Type-aware value suggestions
- Enumeration choices
- Valid state/operator names

### Phase 6 (Validation) Updates

Validate against datamap.

**Features:**
- Check undefined attributes
- Type validation
- Range checking
- Enumeration validation

### Phase 7 (UI) Updates

Visualize datamap compatible with VisualSoar.

**Features:**
- Tree view showing layout structure
- Graph view of datamap
- Edit datamap vertices
- Sync with VisualSoar

## Type Definitions

Create `src/server/visualSoarProject.ts`:

```typescript
/**
 * TypeScript definitions for VisualSoar Project Schema
 * Based on: https://github.com/SoarGroup/VisualSoar/blob/master/doc/project_schema.json
 */

export interface VisualSoarProject {
    version: "6";
    datamap: Datamap;
    layout: LayoutNode;
}

// Datamap Types

export interface Datamap {
    rootId: string;
    vertices: DMVertex[];
}

export type DMVertex = 
    | SoarIdVertex
    | EnumerationVertex
    | IntegerRangeVertex
    | FloatRangeVertex
    | StringVertex
    | ForeignVertex;

export interface BaseDMVertex {
    id: string;
    type: "SOAR_ID" | "ENUMERATION" | "INTEGER" | "FLOAT" | "STRING" | "FOREIGN";
}

export interface SoarIdVertex extends BaseDMVertex {
    type: "SOAR_ID";
    outEdges?: OutEdge[];
}

export interface EnumerationVertex extends BaseDMVertex {
    type: "ENUMERATION";
    choices: string[];
}

export interface IntegerRangeVertex extends BaseDMVertex {
    type: "INTEGER";
    min?: number;
    max?: number;
}

export interface FloatRangeVertex extends BaseDMVertex {
    type: "FLOAT";
    min?: number;
    max?: number;
}

export interface StringVertex extends BaseDMVertex {
    type: "STRING";
}

export interface ForeignVertex extends BaseDMVertex {
    type: "FOREIGN";
    foreignDMPath: string;
    importedVertex: DMVertex;
}

export interface OutEdge {
    name: string;
    toId: string;
    comment?: string;
    generated?: boolean;
}

// Layout Types

export type LayoutNode =
    | FileNode
    | FileOperatorNode
    | FolderNode
    | OperatorNode
    | HighLevelOperatorNode
    | HighLevelFileOperatorNode
    | ImpasseOperatorNode
    | HighLevelImpasseOperatorNode
    | OperatorRootNode
    | LinkNode;

export interface BaseLayoutNode {
    type: string;
    id: string;
    children?: LayoutNode[];
}

export interface FileNode extends BaseLayoutNode {
    type: "FILE";
    name: string;
    file: string;
}

export interface FileOperatorNode extends BaseLayoutNode {
    type: "FILE_OPERATOR";
    name: string;
    file: string;
}

export interface FolderNode extends BaseLayoutNode {
    type: "FOLDER";
    name: string;
    folder: string;
    children?: LayoutNode[];
}

export interface OperatorNode extends BaseLayoutNode {
    type: "OPERATOR";
    name: string;
    file: string;
}

export interface HighLevelOperatorNode extends BaseLayoutNode {
    type: "HIGH_LEVEL_OPERATOR";
    name: string;
    file: string;
    dmId: string;
    folder: string;
    children?: LayoutNode[];
}

export interface HighLevelFileOperatorNode extends BaseLayoutNode {
    type: "HIGH_LEVEL_FILE_OPERATOR";
    name: string;
    file: string;
    dmId: string;
    folder: string;
    children?: LayoutNode[];
}

export type ImpasseName =
    | "Impasse__Operator_Tie"
    | "Impasse__Operator_Conflict"
    | "Impasse__Operator_Constraint-Failure"
    | "Impasse__State_No-Change";

export interface ImpasseOperatorNode extends BaseLayoutNode {
    type: "IMPASSE_OPERATOR";
    name: ImpasseName;
    file: string;
}

export interface HighLevelImpasseOperatorNode extends BaseLayoutNode {
    type: "HIGH_LEVEL_IMPASSE_OPERATOR";
    name: ImpasseName;
    file: string;
    dmId: string;
    folder: string;
    children?: LayoutNode[];
}

export interface OperatorRootNode extends BaseLayoutNode {
    type: "OPERATOR_ROOT";
    name: string;
    folder: string;
    children?: LayoutNode[];
}

export interface LinkNode extends BaseLayoutNode {
    type: "LINK";
    name: string;
    file: string;
    linkedNodeId: string;
}

// Utility Types

export interface ProjectContext {
    projectFile: string;
    project: VisualSoarProject;
    datamapIndex: Map<string, DMVertex>;
    layoutIndex: Map<string, LayoutNode>;
}

export function isOperatorNode(node: LayoutNode): node is OperatorNode | HighLevelOperatorNode | HighLevelFileOperatorNode {
    return node.type === "OPERATOR" || 
           node.type === "HIGH_LEVEL_OPERATOR" || 
           node.type === "HIGH_LEVEL_FILE_OPERATOR";
}

export function hasChildren(node: LayoutNode): node is FolderNode | HighLevelOperatorNode | HighLevelFileOperatorNode | HighLevelImpasseOperatorNode | OperatorRootNode {
    return 'children' in node && node.children !== undefined;
}

export function hasDatamapId(node: LayoutNode): node is HighLevelOperatorNode | HighLevelFileOperatorNode | HighLevelImpasseOperatorNode {
    return 'dmId' in node;
}
```

## Project Loader

Create `src/server/projectLoader.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { VisualSoarProject, ProjectContext, DMVertex, LayoutNode } from './visualSoarProject';

export class ProjectLoader {
    
    async findProjectFile(workspaceRoot: string): Promise<string | null> {
        // Look for .vsproj or .soarproj files
        const extensions = ['.vsproj', '.soarproj'];
        
        for (const ext of extensions) {
            const files = await this.findFiles(workspaceRoot, `**/*${ext}`);
            if (files.length > 0) {
                return files[0];
            }
        }
        
        return null;
    }
    
    async loadProject(projectFile: string): Promise<ProjectContext> {
        const content = fs.readFileSync(projectFile, 'utf-8');
        const project: VisualSoarProject = JSON.parse(content);
        
        // Validate schema version
        if (project.version !== "6") {
            throw new Error(`Unsupported project version: ${project.version}`);
        }
        
        // Build indices for fast lookup
        const datamapIndex = new Map<string, DMVertex>();
        for (const vertex of project.datamap.vertices) {
            datamapIndex.set(vertex.id, vertex);
        }
        
        const layoutIndex = new Map<string, LayoutNode>();
        this.indexLayout(project.layout, layoutIndex);
        
        return {
            projectFile,
            project,
            datamapIndex,
            layoutIndex
        };
    }
    
    private indexLayout(node: LayoutNode, index: Map<string, LayoutNode>): void {
        index.set(node.id, node);
        if ('children' in node && node.children) {
            for (const child of node.children) {
                this.indexLayout(child, index);
            }
        }
    }
    
    async saveProject(context: ProjectContext): Promise<void> {
        const content = JSON.stringify(context.project, null, 2);
        fs.writeFileSync(context.projectFile, content, 'utf-8');
    }
    
    private async findFiles(root: string, pattern: string): Promise<string[]> {
        // Implementation depends on file system utilities
        // For now, simple recursive search
        const results: string[] = [];
        this.findFilesRecursive(root, pattern, results);
        return results;
    }
    
    private findFilesRecursive(dir: string, pattern: string, results: string[]): void {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                this.findFilesRecursive(fullPath, pattern, results);
            } else if (fullPath.endsWith('.vsproj') || fullPath.endsWith('.soarproj')) {
                results.push(fullPath);
            }
        }
    }
}
```

## LSP Server Updates

Update `src/server/soarLanguageServer.ts` to use project context:

```typescript
import { ProjectLoader } from './projectLoader';
import { ProjectContext } from './visualSoarProject';

// Add to server initialization
let projectContext: ProjectContext | null = null;
const projectLoader = new ProjectLoader();

connection.onInitialize(async (params: InitializeParams) => {
    // Load project if available
    if (params.workspaceFolders && params.workspaceFolders.length > 0) {
        const workspaceRoot = params.workspaceFolders[0].uri.replace('file://', '');
        const projectFile = await projectLoader.findProjectFile(workspaceRoot);
        if (projectFile) {
            try {
                projectContext = await projectLoader.loadProject(projectFile);
                connection.console.log(`Loaded VisualSoar project: ${projectFile}`);
            } catch (error) {
                connection.console.error(`Failed to load project: ${error}`);
            }
        }
    }
    
    // ... rest of initialization
});

// Update completion provider to use datamap
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    // ... existing code ...
    
    // Add datamap-aware completions
    if (projectContext && beforeCursor.match(/\^\w*$/)) {
        const datamapAttributes = getDatamapAttributes(projectContext);
        datamapAttributes.forEach(attr => {
            completions.push({
                label: attr.name,
                kind: CompletionItemKind.Property,
                detail: `Datamap attribute (${attr.type})`,
                documentation: attr.comment
            });
        });
    }
    
    // ... rest of completion logic
});

function getDatamapAttributes(context: ProjectContext): Array<{name: string, type: string, comment?: string}> {
    const attributes: Array<{name: string, type: string, comment?: string}> = [];
    
    // Get root vertex
    const rootVertex = context.datamapIndex.get(context.project.datamap.rootId);
    if (rootVertex && rootVertex.type === 'SOAR_ID' && rootVertex.outEdges) {
        for (const edge of rootVertex.outEdges) {
            const targetVertex = context.datamapIndex.get(edge.toId);
            attributes.push({
                name: edge.name,
                type: targetVertex?.type || 'UNKNOWN',
                comment: edge.comment
            });
        }
    }
    
    return attributes;
}
```

## Validation Updates

Add datamap validation:

```typescript
async function validateDocument(textDocument: TextDocument): Promise<void> {
    // ... existing parsing ...
    
    // Add datamap validation if project loaded
    if (projectContext) {
        const datamapErrors = validateAgainstDatamap(soarDoc, projectContext);
        soarDoc.errors.push(...datamapErrors);
    }
    
    // ... send diagnostics ...
}

function validateAgainstDatamap(doc: SoarDocument, context: ProjectContext): SoarDiagnostic[] {
    const errors: SoarDiagnostic[] = [];
    
    for (const production of doc.productions) {
        for (const attribute of production.attributes) {
            // Check if attribute exists in datamap
            const isValid = isAttributeInDatamap(attribute.name, context);
            if (!isValid) {
                errors.push({
                    range: attribute.range,
                    message: `Attribute '${attribute.name}' not found in datamap`,
                    severity: DiagnosticSeverity.Warning,
                    source: 'soar-datamap'
                });
            }
        }
    }
    
    return errors;
}

function isAttributeInDatamap(attrName: string, context: ProjectContext): boolean {
    // Simplified - real implementation would traverse graph
    const rootVertex = context.datamapIndex.get(context.project.datamap.rootId);
    if (rootVertex && rootVertex.type === 'SOAR_ID' && rootVertex.outEdges) {
        return rootVertex.outEdges.some(edge => edge.name === attrName);
    }
    return false;
}
```

## File Organization

```
src/
├── server/
│   ├── visualSoarProject.ts       # Schema type definitions
│   ├── projectLoader.ts           # Load/save projects
│   ├── datamapValidator.ts        # Datamap validation
│   ├── soarLanguageServer.ts      # Updated with project support
│   └── soarParser.ts              # Parser
```

## Testing

Create `test/fixtures/test-project.vsproj`:

```json
{
  "version": "6",
  "datamap": {
    "rootId": "root-s",
    "vertices": [
      {
        "id": "root-s",
        "type": "SOAR_ID",
        "outEdges": [
          { "name": "io", "toId": "io-id", "comment": "Input/output link" },
          { "name": "type", "toId": "type-enum" },
          { "name": "operator", "toId": "op-id" }
        ]
      },
      {
        "id": "io-id",
        "type": "SOAR_ID",
        "outEdges": [
          { "name": "input-link", "toId": "input-id" },
          { "name": "output-link", "toId": "output-id" }
        ]
      },
      {
        "id": "type-enum",
        "type": "ENUMERATION",
        "choices": ["state", "operator"]
      }
    ]
  },
  "layout": {
    "type": "OPERATOR_ROOT",
    "id": "root",
    "name": "TestProject",
    "folder": ".",
    "children": []
  }
}
```

## Verification Checklist

- [ ] Type definitions match schema exactly
- [ ] Project loader can read .vsproj files
- [ ] Project loader can write .vsproj files
- [ ] VisualSoar can open projects created by extension
- [ ] Extension can open projects created by VisualSoar
- [ ] Datamap is used for completions
- [ ] Datamap is used for validation
- [ ] Layout structure is respected
- [ ] All vertex types supported
- [ ] Foreign datamaps handled
- [ ] Schema version validated

## Compatibility Requirements

1. **Bidirectional Compatibility**
   - Projects created by extension work in VisualSoar
   - Projects created by VisualSoar work in extension
   - No data loss when editing

2. **Schema Adherence**
   - Strictly follow JSON schema
   - Preserve unknown fields
   - Validate before saving

3. **File Path Handling**
   - Use relative paths as per schema
   - Handle different path separators
   - Resolve paths correctly

4. **Version Management**
   - Always use version "6"
   - Validate incoming version
   - Reject unsupported versions

## Next Steps

1. **Phase 3 (Current)**: Add basic project loading to LSP
2. **Phase 4**: Full datamap implementation
3. **Phase 5**: Datamap-aware completions
4. **Phase 6**: Datamap validation
5. **Phase 7**: Visual datamap editor

---

**Status**: Planning Complete
**Schema Version**: 6 (VisualSoar 9.6.4)
**Mandatory**: Yes - Full compatibility required
**Updated**: December 2, 2025
