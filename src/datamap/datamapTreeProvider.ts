/**
 * Datamap Tree View Provider
 * 
 * Provides a tree view of the VisualSoar datamap in the VS Code sidebar
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VisualSoarProject, DMVertex, ProjectContext } from '../server/visualSoarProject';

export class DatamapTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly vertexId: string,
        public readonly vertex: DMVertex | null,
        public readonly edgeName?: string,
        public readonly comment?: string
    ) {
        super(label, collapsibleState);

        if (vertex) {
            this.tooltip = this.buildTooltip();
            this.description = this.buildDescription();
            // Context value determines which menu items are shown
            if (edgeName) {
                // This is an attribute (not the root)
                this.contextValue = `datamap-attribute-${vertex.type.toLowerCase()}`;
            } else {
                // This is the root node
                this.contextValue = `datamap-root`;
            }
            this.iconPath = this.getIconForVertexType(vertex.type);
        }
    }

    private buildTooltip(): string {
        if (!this.vertex) {
            return '';
        }

        const lines: string[] = [];
        lines.push(`Type: ${this.vertex.type}`);
        lines.push(`ID: ${this.vertexId}`);

        if (this.comment) {
            lines.push(`Comment: ${this.comment}`);
        }

        if (this.vertex.type === 'ENUMERATION') {
            lines.push(`Choices: ${this.vertex.choices.join(', ')}`);
        } else if (this.vertex.type === 'SOAR_ID' && this.vertex.outEdges) {
            lines.push(`Attributes: ${this.vertex.outEdges.length}`);
        }

        return lines.join('\n');
    }

    private buildDescription(): string {
        if (!this.vertex) {
            return '';
        }

        if (this.vertex.type === 'ENUMERATION') {
            return `{${this.vertex.choices.join(' | ')}}`;
        } else if (this.vertex.type === 'SOAR_ID' && this.vertex.outEdges) {
            return `(${this.vertex.outEdges.length} attributes)`;
        }

        return this.vertex.type.toLowerCase();
    }

    private getIconForVertexType(type: string): vscode.ThemeIcon {
        switch (type) {
            case 'SOAR_ID':
                return new vscode.ThemeIcon('symbol-object');
            case 'INTEGER':
                return new vscode.ThemeIcon('symbol-number');
            case 'FLOAT':
                return new vscode.ThemeIcon('symbol-number');
            case 'STRING':
                return new vscode.ThemeIcon('symbol-string');
            case 'ENUMERATION':
                return new vscode.ThemeIcon('symbol-enum');
            case 'JAVA_FILE':
                return new vscode.ThemeIcon('file-code');
            default:
                return new vscode.ThemeIcon('symbol-property');
        }
    }
}

export class DatamapTreeProvider implements vscode.TreeDataProvider<DatamapTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatamapTreeItem | undefined | null | void> = new vscode.EventEmitter<DatamapTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatamapTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private projectContext: ProjectContext | null = null;

    constructor() { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getProjectContext(): ProjectContext | null {
        return this.projectContext;
    }

    async loadProject(workspaceFolder: vscode.Uri): Promise<void> {
        try {
            // Find project file
            const projectFile = await this.findProjectFile(workspaceFolder.fsPath);
            if (!projectFile) {
                vscode.window.showInformationMessage('No Soar project file (.vsa.json, .vsproj, or .soarproj) found in workspace');
                return;
            }

            // Load and parse project
            const content = await fs.promises.readFile(projectFile, 'utf-8');
            const project: VisualSoarProject = JSON.parse(content);

            // Build indices
            const datamapIndex = new Map<string, DMVertex>();
            for (const vertex of project.datamap.vertices) {
                datamapIndex.set(vertex.id, vertex);
            }

            this.projectContext = {
                projectFile,
                project,
                datamapIndex,
                layoutIndex: new Map() // Not needed for tree view
            };

            this.refresh();
            vscode.window.showInformationMessage(`Loaded datamap: ${path.basename(projectFile)}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to load project: ${error.message}`);
        }
    }

    private async findProjectFile(workspaceRoot: string): Promise<string | null> {
        try {
            const files = await fs.promises.readdir(workspaceRoot);

            // Priority order: .vsa.json (default), .vsproj (VisualSoar), .soarproj (legacy)
            for (const file of files) {
                if (file.endsWith('.vsa.json')) {
                    return path.join(workspaceRoot, file);
                }
            }

            // Fall back to VisualSoar formats for backward compatibility
            for (const file of files) {
                if (file.endsWith('.vsproj') || file.endsWith('.soarproj')) {
                    return path.join(workspaceRoot, file);
                }
            }
        } catch (error) {
            console.error('Error finding project file:', error);
        }
        return null;
    }

    getTreeItem(element: DatamapTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DatamapTreeItem): Thenable<DatamapTreeItem[]> {
        if (!this.projectContext) {
            return Promise.resolve([]);
        }

        if (!element) {
            // Root level - show the root vertex
            const rootId = this.projectContext.project.datamap.rootId;
            const rootVertex = this.projectContext.datamapIndex.get(rootId);

            if (!rootVertex) {
                return Promise.resolve([]);
            }

            return Promise.resolve([
                new DatamapTreeItem(
                    rootId,
                    vscode.TreeItemCollapsibleState.Expanded,
                    rootId,
                    rootVertex
                )
            ]);
        }

        // Show children (outgoing edges)
        if (!element.vertex || element.vertex.type !== 'SOAR_ID') {
            return Promise.resolve([]);
        }

        const children: DatamapTreeItem[] = [];

        if (element.vertex.outEdges) {
            for (const edge of element.vertex.outEdges) {
                const targetVertex = this.projectContext.datamapIndex.get(edge.toId);
                if (!targetVertex) {
                    continue;
                }

                const hasChildren = targetVertex.type === 'SOAR_ID' &&
                    targetVertex.outEdges &&
                    targetVertex.outEdges.length > 0;

                const collapsibleState = hasChildren
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                children.push(
                    new DatamapTreeItem(
                        `^${edge.name}`,
                        collapsibleState,
                        edge.toId,
                        targetVertex,
                        edge.name,
                        edge.comment
                    )
                );
            }
        }

        return Promise.resolve(children);
    }
}
