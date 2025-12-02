# Phase 6: DataMap Checker

## Objective

Implement datamap validation to detect errors like undefined nodes, circular references, duplicate attributes, and unreachable nodes.

## Prerequisites

- Completed Phases 1-5
- Understanding of graph algorithms (cycle detection, reachability)

## Steps

### 6.1 Create Validator

Create `src/datamap/validator.ts`:

```typescript
import { SoarDataMap } from './index';
import { DataMapError, DataMapErrorType, NodeId, DataMapNode, DataMapNodeType } from './types';

export class DataMapValidator {
    private datamap: SoarDataMap;
    private errors: DataMapError[] = [];

    constructor(datamap: SoarDataMap) {
        this.datamap = datamap;
    }

    validate(): DataMapError[] {
        this.errors = [];
        
        this.checkUndefinedNodes();
        this.checkCircularReferences();
        this.checkDuplicateAttributes();
        this.checkUnreachableNodes();
        this.checkMissingParents();
        
        return this.errors;
    }

    private checkUndefinedNodes(): void {
        const allLinks = this.datamap.getAllNodes()
            .flatMap(node => this.datamap.getLinksFrom(node.id));
        
        for (const link of allLinks) {
            if (!this.datamap.getNode(link.to)) {
                this.errors.push({
                    type: DataMapErrorType.UNDEFINED_NODE,
                    message: `Link references undefined node: ${link.to}`,
                    nodeId: link.from,
                    severity: 'error'
                });
            }
        }
    }

    private checkCircularReferences(): void {
        const visited = new Set<NodeId>();
        const recursionStack = new Set<NodeId>();

        const detectCycle = (nodeId: NodeId): boolean => {
            visited.add(nodeId);
            recursionStack.add(nodeId);

            const node = this.datamap.getNode(nodeId);
            if (!node) return false;

            for (const childId of node.children) {
                if (!visited.has(childId)) {
                    if (detectCycle(childId)) return true;
                } else if (recursionStack.has(childId)) {
                    this.errors.push({
                        type: DataMapErrorType.CIRCULAR_REFERENCE,
                        message: `Circular reference detected involving node: ${node.name}`,
                        nodeId: nodeId,
                        severity: 'error'
                    });
                    return true;
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        for (const node of this.datamap.getAllNodes()) {
            if (!visited.has(node.id)) {
                detectCycle(node.id);
            }
        }
    }

    private checkDuplicateAttributes(): void {
        for (const node of this.datamap.getAllNodes()) {
            const attributeNames = new Map<string, NodeId[]>();
            
            for (const child of this.datamap.getChildren(node.id)) {
                if (child.type === DataMapNodeType.ATTRIBUTE) {
                    if (!attributeNames.has(child.name)) {
                        attributeNames.set(child.name, []);
                    }
                    attributeNames.get(child.name)!.push(child.id);
                }
            }

            for (const [name, nodeIds] of attributeNames) {
                if (nodeIds.length > 1) {
                    this.errors.push({
                        type: DataMapErrorType.DUPLICATE_ATTRIBUTE,
                        message: `Duplicate attribute '${name}' under node '${node.name}'`,
                        nodeId: node.id,
                        severity: 'warning'
                    });
                }
            }
        }
    }

    private checkUnreachableNodes(): void {
        const root = this.datamap.getRootNode();
        if (!root) return;

        const reachable = new Set<NodeId>();
        const visit = (nodeId: NodeId) => {
            if (reachable.has(nodeId)) return;
            reachable.add(nodeId);
            
            const node = this.datamap.getNode(nodeId);
            if (node) {
                for (const childId of node.children) {
                    visit(childId);
                }
            }
        };

        visit(root.id);

        for (const node of this.datamap.getAllNodes()) {
            if (!reachable.has(node.id)) {
                this.errors.push({
                    type: DataMapErrorType.UNREACHABLE_NODE,
                    message: `Node '${node.name}' is unreachable from root`,
                    nodeId: node.id,
                    severity: 'info'
                });
            }
        }
    }

    private checkMissingParents(): void {
        for (const node of this.datamap.getAllNodes()) {
            if (node.parent && !this.datamap.getNode(node.parent)) {
                this.errors.push({
                    type: DataMapErrorType.MISSING_PARENT,
                    message: `Node '${node.name}' references missing parent`,
                    nodeId: node.id,
                    severity: 'error'
                });
            }
        }
    }
}
```

### 6.2 Integrate with VS Code Diagnostics

Create `src/datamap/diagnostics.ts`:

```typescript
import * as vscode from 'vscode';
import { DataMapValidator } from './validator';
import { SoarDataMap } from './index';
import { DataMapError } from './types';

export class DataMapDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('soar-datamap');
    }

    updateDiagnostics(datamap: SoarDataMap): void {
        this.diagnosticCollection.clear();

        const validator = new DataMapValidator(datamap);
        const errors = validator.validate();

        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

        for (const error of errors) {
            const node = error.nodeId ? datamap.getNode(error.nodeId) : undefined;
            const file = node?.sourceFile;
            const line = node?.sourceLine || 0;

            if (file) {
                if (!diagnosticsByFile.has(file)) {
                    diagnosticsByFile.set(file, []);
                }

                const range = new vscode.Range(
                    new vscode.Position(Math.max(0, line - 1), 0),
                    new vscode.Position(Math.max(0, line - 1), Number.MAX_VALUE)
                );

                const severity = 
                    error.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                    error.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                    vscode.DiagnosticSeverity.Information;

                const diagnostic = new vscode.Diagnostic(range, error.message, severity);
                diagnostic.source = 'soar-datamap';
                
                diagnosticsByFile.get(file)!.push(diagnostic);
            }
        }

        for (const [file, diagnostics] of diagnosticsByFile) {
            this.diagnosticCollection.set(vscode.Uri.file(file), diagnostics);
        }
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
```

### 6.3 Update Extension

Update `src/extension.ts`:

```typescript
import { DataMapDiagnostics } from './datamap/diagnostics';
import { DataMapLoader } from './datamap/loader';

let datamapDiagnostics: DataMapDiagnostics;

export async function activate(context: vscode.ExtensionContext) {
    // ... existing code ...

    // Initialize datamap diagnostics
    datamapDiagnostics = new DataMapDiagnostics();
    context.subscriptions.push(datamapDiagnostics);

    // Load and validate datamap
    const datamap = await DataMapLoader.loadFromWorkspace();
    datamapDiagnostics.updateDiagnostics(datamap);

    // Watch for file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.soar');
    watcher.onDidChange(async () => {
        const updatedDatamap = await DataMapLoader.loadFromWorkspace();
        datamapDiagnostics.updateDiagnostics(updatedDatamap);
    });
    context.subscriptions.push(watcher);
}
```

## Verification Checklist

- [ ] Validator detects undefined nodes
- [ ] Validator detects circular references
- [ ] Validator detects duplicate attributes
- [ ] Validator detects unreachable nodes
- [ ] Diagnostics appear in Problems panel
- [ ] Diagnostics show correct severity
- [ ] Diagnostics update on file changes

## Next Steps

Proceed to Phase 7: `instructions/phase7-datamap-ui.md`
