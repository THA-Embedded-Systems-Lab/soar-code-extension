# Phase 7: DataMap UI

## Objective

Build a user interface for viewing and editing the datamap, using either a TreeView (sidebar) or Webview (panel).

## Prerequisites

- Completed Phases 1-6
- Understanding of VS Code TreeView and/or Webview APIs

## Steps

### 7.1 Create TreeView Provider

Create `src/ui/treeview.ts`:

```typescript
import * as vscode from 'vscode';
import { SoarDataMap } from '../datamap/index';
import { DataMapNode, NodeId, DataMapNodeType } from '../datamap/types';

class DataMapTreeItem extends vscode.TreeItem {
    constructor(
        public readonly node: DataMapNode,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(node.name, collapsibleState);
        
        this.tooltip = `${node.name} (${node.type})`;
        this.description = node.type;
        this.contextValue = node.type;
        
        // Set icon based on type
        this.iconPath = new vscode.ThemeIcon(
            node.type === DataMapNodeType.STATE ? 'symbol-class' :
            node.type === DataMapNodeType.ATTRIBUTE ? 'symbol-property' :
            'symbol-variable'
        );
    }
}

export class DataMapTreeProvider implements vscode.TreeDataProvider<DataMapNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<DataMapNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private datamap: SoarDataMap) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateDataMap(datamap: SoarDataMap): void {
        this.datamap = datamap;
        this.refresh();
    }

    getTreeItem(element: DataMapNode): vscode.TreeItem {
        const hasChildren = element.children.length > 0;
        return new DataMapTreeItem(
            element,
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
    }

    getChildren(element?: DataMapNode): Thenable<DataMapNode[]> {
        if (!element) {
            const root = this.datamap.getRootNode();
            return Promise.resolve(root ? [root] : []);
        }

        return Promise.resolve(this.datamap.getChildren(element.id));
    }

    getParent(element: DataMapNode): vscode.ProviderResult<DataMapNode> {
        return this.datamap.getParent(element.id);
    }
}
```

### 7.2 Register TreeView

Update `src/extension.ts`:

```typescript
import { DataMapTreeProvider } from './ui/treeview';

export async function activate(context: vscode.ExtensionContext) {
    // ... existing code ...

    // Create and register tree view
    const treeProvider = new DataMapTreeProvider(datamap);
    const treeView = vscode.window.createTreeView('soarDataMap', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(treeView);

    // Add commands for tree view
    registerTreeViewCommands(context, treeProvider, datamap);
}

function registerTreeViewCommands(
    context: vscode.ExtensionContext,
    treeProvider: DataMapTreeProvider,
    datamap: SoarDataMap
) {
    // Refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.datamap.refresh', () => {
            treeProvider.refresh();
        })
    );

    // Add node command
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.datamap.addNode', async (node: DataMapNode) => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter node name',
                placeHolder: 'node-name'
            });
            
            if (name) {
                datamap.addNode({
                    name,
                    type: DataMapNodeType.ATTRIBUTE,
                    parent: node.id,
                    children: []
                });
                treeProvider.refresh();
            }
        })
    );

    // Delete node command
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.datamap.deleteNode', (node: DataMapNode) => {
            vscode.window.showWarningMessage(
                `Delete node '${node.name}'?`,
                'Yes', 'No'
            ).then(choice => {
                if (choice === 'Yes') {
                    datamap.removeNode(node.id);
                    treeProvider.refresh();
                }
            });
        })
    );
}
```

### 7.3 Update package.json

Add view container and commands:

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "soar-explorer",
          "title": "Soar",
          "icon": "$(symbol-class)"
        }
      ]
    },
    "views": {
      "soar-explorer": [
        {
          "id": "soarDataMap",
          "name": "DataMap",
          "contextualTitle": "Soar DataMap"
        }
      ]
    },
    "commands": [
      {
        "command": "soar.datamap.refresh",
        "title": "Refresh DataMap",
        "category": "Soar",
        "icon": "$(refresh)"
      },
      {
        "command": "soar.datamap.addNode",
        "title": "Add Node",
        "category": "Soar",
        "icon": "$(add)"
      },
      {
        "command": "soar.datamap.deleteNode",
        "title": "Delete Node",
        "category": "Soar",
        "icon": "$(trash)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "soar.datamap.refresh",
          "when": "view == soarDataMap",
          "group": "navigation"
        }
      ],
      "view/item/context": [
        {
          "command": "soar.datamap.addNode",
          "when": "view == soarDataMap",
          "group": "inline"
        },
        {
          "command": "soar.datamap.deleteNode",
          "when": "view == soarDataMap",
          "group": "inline"
        }
      ]
    }
  }
}
```

### 7.4 Optional: Create Webview Panel

Create `src/ui/webview/datamapPanel.ts` for a graphical editor (more advanced):

```typescript
import * as vscode from 'vscode';
import { SoarDataMap } from '../../datamap/index';
import { DataMapUtils } from '../../datamap/utils';

export class DataMapPanel {
    public static currentPanel: DataMapPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private datamap: SoarDataMap) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._update();
    }

    public static createOrShow(extensionUri: vscode.Uri, datamap: SoarDataMap) {
        if (DataMapPanel.currentPanel) {
            DataMapPanel.currentPanel._panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'soarDataMapView',
            'Soar DataMap',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        DataMapPanel.currentPanel = new DataMapPanel(panel, datamap);
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        const tree = DataMapUtils.toTree(this.datamap);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Soar DataMap</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .node { margin-left: 20px; margin-top: 5px; }
                .node-name { font-weight: bold; }
                .node-type { color: var(--vscode-descriptionForeground); }
            </style>
        </head>
        <body>
            <h1>DataMap Visualization</h1>
            <div id="tree"></div>
            <script>
                const tree = ${JSON.stringify(tree, null, 2)};
                
                function renderTree(node, container) {
                    const div = document.createElement('div');
                    div.className = 'node';
                    div.innerHTML = \`
                        <span class="node-name">\${node.name}</span>
                        <span class="node-type">[\${node.type}]</span>
                    \`;
                    
                    if (node.children && node.children.length > 0) {
                        const childContainer = document.createElement('div');
                        node.children.forEach(child => renderTree(child, childContainer));
                        div.appendChild(childContainer);
                    }
                    
                    container.appendChild(div);
                }
                
                if (tree) {
                    renderTree(tree, document.getElementById('tree'));
                }
            </script>
        </body>
        </html>`;
    }

    public dispose() {
        DataMapPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
```

## Verification Checklist

- [ ] TreeView appears in sidebar
- [ ] DataMap nodes visible in tree
- [ ] Tree can be expanded/collapsed
- [ ] Refresh command works
- [ ] Add node command works
- [ ] Delete node command works
- [ ] Icons display correctly
- [ ] Webview panel displays (if implemented)

## Next Steps

Proceed to Phase 8: `instructions/phase8-testing-packaging.md`
