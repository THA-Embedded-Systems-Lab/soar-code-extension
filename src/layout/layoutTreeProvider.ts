/**
 * Layout Tree View Provider
 *
 * Provides a tree view of the VisualSoar project structure (operators, substates, files, folders)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  VisualSoarProject,
  LayoutNode,
  ProjectContext,
  hasChildren,
} from '../server/visualSoarProject';

export class LayoutTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly node: LayoutNode,
    public readonly projectContext: ProjectContext,
    private readonly parentPath: string = ''
  ) {
    super(label, collapsibleState);

    this.tooltip = this.buildTooltip();
    this.description = this.buildDescription();
    this.contextValue = `layout-${node.type.toLowerCase().replace(/_/g, '-')}`;
    this.iconPath = this.getIconForNodeType(node.type);

    // Set resource URI for file nodes so they can be opened
    if ('file' in node && node.file) {
      const workspaceFolder = path.dirname(projectContext.projectFile);
      // Build the full file path by combining parent path with the file
      const fullPath = path.join(workspaceFolder, parentPath, node.file);
      this.resourceUri = vscode.Uri.file(fullPath);
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri],
      };
    }
  }

  private buildTooltip(): string {
    const lines: string[] = [];
    lines.push(`Type: ${this.node.type}`);
    lines.push(`ID: ${this.node.id}`);

    if ('file' in this.node && this.node.file) {
      lines.push(`File: ${this.node.file}`);
    }

    if ('folder' in this.node && this.node.folder) {
      lines.push(`Folder: ${this.node.folder}`);
    }

    if ('dmId' in this.node && this.node.dmId) {
      lines.push(`Datamap ID: ${this.node.dmId}`);
    }

    if (hasChildren(this.node) && this.node.children) {
      lines.push(`Children: ${this.node.children.length}`);
    }

    return lines.join('\n');
  }

  private buildDescription(): string {
    if ('file' in this.node && this.node.file) {
      return path.basename(this.node.file);
    }

    if ('folder' in this.node && this.node.folder) {
      return path.basename(this.node.folder);
    }

    if (hasChildren(this.node) && this.node.children) {
      return `(${this.node.children.length} items)`;
    }

    return '';
  }

  private getIconForNodeType(type: string): vscode.ThemeIcon {
    switch (type) {
      case 'OPERATOR_ROOT':
        return new vscode.ThemeIcon('folder-library');
      case 'HIGH_LEVEL_OPERATOR':
      case 'HIGH_LEVEL_FILE_OPERATOR':
        return new vscode.ThemeIcon('symbol-operator', new vscode.ThemeColor('charts.blue'));
      case 'OPERATOR':
      case 'FILE_OPERATOR':
        return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.green'));
      case 'IMPASSE_OPERATOR':
      case 'HIGH_LEVEL_IMPASSE_OPERATOR':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
      case 'FOLDER':
        return new vscode.ThemeIcon('folder');
      case 'FILE':
        return new vscode.ThemeIcon('file-code');
      case 'LINK':
        return new vscode.ThemeIcon('link');
      default:
        return new vscode.ThemeIcon('symbol-misc');
    }
  }
}

export class LayoutTreeProvider implements vscode.TreeDataProvider<LayoutTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<LayoutTreeItem | undefined | null | void> =
    new vscode.EventEmitter<LayoutTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<LayoutTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private projectContext: ProjectContext | null = null;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  /**
   * Load project from a specific project file path
   */
  async loadProjectFromFile(projectFile: string): Promise<void> {
    try {
      // Load and parse project
      const content = await fs.promises.readFile(projectFile, 'utf-8');
      const project: VisualSoarProject = JSON.parse(content);

      // Build indices
      const datamapIndex = new Map<string, any>();
      for (const vertex of project.datamap.vertices) {
        datamapIndex.set(vertex.id, vertex);
      }

      const layoutIndex = new Map<string, LayoutNode>();
      this.buildLayoutIndex(project.layout, layoutIndex);

      this.projectContext = {
        projectFile,
        project,
        datamapIndex,
        layoutIndex,
      };

      this.refresh();
      vscode.window.showInformationMessage(
        `Loaded project structure: ${path.basename(projectFile)}`
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load project: ${error.message}`);
    }
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

  private buildLayoutIndex(node: LayoutNode, index: Map<string, LayoutNode>): void {
    index.set(node.id, node);
    if (hasChildren(node) && node.children) {
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

  getTreeItem(element: LayoutTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LayoutTreeItem): Thenable<LayoutTreeItem[]> {
    if (!this.projectContext) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level - show the layout root
      const rootNode = this.projectContext.project.layout;

      return Promise.resolve([
        new LayoutTreeItem(
          rootNode.name || 'Project Root',
          vscode.TreeItemCollapsibleState.Expanded,
          rootNode,
          this.projectContext,
          '' // Root element has no parent path
        ),
      ]);
    }

    // Show children
    if (!hasChildren(element.node) || !element.node.children) {
      return Promise.resolve([]);
    }

    const children: LayoutTreeItem[] = [];

    // Build the parent path for children
    // Children's files are located inside this node's folder
    let childParentPath = element['parentPath'] || '';
    if ('folder' in element.node && element.node.folder) {
      // Add this node's folder to the path for children
      childParentPath = childParentPath
        ? path.join(childParentPath, element.node.folder)
        : element.node.folder;
    }

    for (const childNode of element.node.children) {
      const hasChildNodes =
        hasChildren(childNode) && childNode.children && childNode.children.length > 0;

      const collapsibleState = hasChildNodes
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      children.push(
        new LayoutTreeItem(
          childNode.name,
          collapsibleState,
          childNode,
          this.projectContext,
          childParentPath
        )
      );
    }

    return Promise.resolve(children);
  }

  /**
   * Get parent node for a given node ID
   */
  getParentNode(nodeId: string): LayoutNode | null {
    if (!this.projectContext) {
      return null;
    }

    return this.findParent(this.projectContext.project.layout, nodeId);
  }

  private findParent(node: LayoutNode, targetId: string): LayoutNode | null {
    if (hasChildren(node) && node.children) {
      for (const child of node.children) {
        if (child.id === targetId) {
          return node;
        }
        const found = this.findParent(child, targetId);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }
}
