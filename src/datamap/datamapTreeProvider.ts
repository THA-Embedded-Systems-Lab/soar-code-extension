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
    public readonly comment?: string,
    public readonly ancestorIds: Set<string> = new Set(),
    private readonly datamapIndex?: Map<string, DMVertex>
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
    } else if (this.vertex.type === 'SOAR_ID') {
      // For operator attributes, show the operator name if available
      if (this.edgeName === 'operator' && this.vertex.outEdges) {
        const nameEdge = this.vertex.outEdges.find(e => e.name === 'name');
        if (nameEdge) {
          // Try to find the name vertex
          const nameVertex = this.getVertexFromContext(nameEdge.toId);
          if (nameVertex && nameVertex.type === 'ENUMERATION' && nameVertex.choices) {
            return `{${nameVertex.choices.join(' | ')}}`;
          }
        }
      }
      if (this.vertex.outEdges) {
        return `(${this.vertex.outEdges.length} attributes)`;
      }
    }

    return this.vertex.type.toLowerCase();
  }

  private getVertexFromContext(vertexId: string): DMVertex | undefined {
    if (!this.datamapIndex) {
      return undefined;
    }
    return this.datamapIndex.get(vertexId);
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
  private _onDidChangeTreeData: vscode.EventEmitter<DatamapTreeItem | undefined | null | void> =
    new vscode.EventEmitter<DatamapTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DatamapTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private projectContext: ProjectContext | null = null;
  private currentRootId: string | null = null; // Which datamap vertex to display (null = project root)

  constructor() {}

  /**
   * Load project from a specific project file path
   */
  async loadProjectFromFile(projectFile: string): Promise<void> {
    try {
      // Load and parse project
      const content = await fs.promises.readFile(projectFile, 'utf-8');
      const project: VisualSoarProject = JSON.parse(content);

      // Build indices
      const datamapIndex = new Map<string, DMVertex>();
      for (const vertex of project.datamap.vertices) {
        datamapIndex.set(vertex.id, vertex);
      }

      const layoutIndex = new Map<string, any>();
      this.buildLayoutIndex(project.layout, layoutIndex);

      this.projectContext = {
        projectFile,
        project,
        datamapIndex,
        layoutIndex,
      };

      // Reset to project root when loading new project
      this.currentRootId = null;

      this.refresh();
      vscode.window.showInformationMessage(`Loaded datamap: ${path.basename(projectFile)}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load project: ${error.message}`);
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  /**
   * Set which datamap vertex to display as the root
   * @param vertexId The ID of the vertex to display, or null for the project root
   */
  setDatamapRoot(vertexId: string | null): void {
    this.currentRootId = vertexId;
    this.refresh();
  }

  /**
   * Get the current datamap root being displayed
   */
  getCurrentRootId(): string | null {
    return this.currentRootId;
  }

  /**
   * @deprecated Use loadProjectFromFile() instead. This method is kept for backward compatibility.
   */
  async loadProject(workspaceFolder: vscode.Uri): Promise<void> {
    try {
      // Find project file
      const projectFile = await this.findProjectFile(workspaceFolder.fsPath);
      if (!projectFile) {
        vscode.window.showInformationMessage(
          'No Soar project file (.vsa.json, .vsproj, or .soarproj) found in workspace'
        );
        return;
      }

      await this.loadProjectFromFile(projectFile);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load project: ${error.message}`);
    }
  }

  private buildLayoutIndex(node: any, index: Map<string, any>): void {
    index.set(node.id, node);
    if ('children' in node && node.children) {
      for (const child of node.children) {
        this.buildLayoutIndex(child, index);
      }
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
      // Root level - show the current root vertex (or project root if none selected)
      const rootId = this.currentRootId || this.projectContext.project.datamap.rootId;
      const rootVertex = this.projectContext.datamapIndex.get(rootId);

      if (!rootVertex) {
        return Promise.resolve([]);
      }

      const ancestorIds = new Set<string>();
      ancestorIds.add(rootId);

      // Find the layout node name for this datamap vertex
      let nodeName = rootId;
      if (this.currentRootId) {
        // Find layout node with this dmId
        for (const [nodeId, node] of this.projectContext.layoutIndex.entries()) {
          if ('dmId' in node && node.dmId === this.currentRootId) {
            nodeName = node.name + ' (substate)';
            break;
          }
        }
      } else {
        // Use root layout name
        nodeName = this.projectContext.project.layout.name || rootId;
      }

      return Promise.resolve([
        new DatamapTreeItem(
          nodeName,
          vscode.TreeItemCollapsibleState.Expanded,
          rootId,
          rootVertex,
          undefined,
          undefined,
          ancestorIds,
          this.projectContext.datamapIndex
        ),
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

        // Check for cycles - if the target is already an ancestor, don't expand it
        const isCycle = element.ancestorIds.has(edge.toId);

        const hasChildren =
          targetVertex.type === 'SOAR_ID' &&
          targetVertex.outEdges &&
          targetVertex.outEdges.length > 0 &&
          !isCycle; // Don't allow expansion if it's a cycle

        const collapsibleState = hasChildren
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;

        // Create new ancestor set for the child
        const childAncestors = new Set(element.ancestorIds);
        childAncestors.add(edge.toId);

        // Build label without leading ^
        let label = edge.name;
        if (isCycle) {
          label += ' (cycle)';
        }

        children.push(
          new DatamapTreeItem(
            label,
            collapsibleState,
            edge.toId,
            targetVertex,
            edge.name,
            edge.comment,
            childAncestors,
            this.projectContext.datamapIndex
          )
        );
      }
    }

    return Promise.resolve(children);
  }
}
