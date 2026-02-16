/**
 * Layout Tree View Provider
 *
 * Provides a tree view of the VisualSoar project structure (operators, substates, files, folders)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectLoader } from '../server/projectLoader';
import {
  VisualSoarProject,
  LayoutNode,
  ProjectContext,
  hasChildren,
} from '../server/visualSoarProject';

export class LayoutTreeItem extends vscode.TreeItem {
  constructor(
    labelText: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly node: LayoutNode,
    public readonly projectContext: ProjectContext,
    public readonly parentPath: string = '',
    private readonly currentDatamapId: string | null = null
  ) {
    // Check if this node's datamap is currently being viewed
    const isCurrentDatamap =
      ('dmId' in node && node.dmId && node.dmId === currentDatamapId) ||
      (currentDatamapId === null && node.type === 'OPERATOR_ROOT');

    // Add arrow prefix to indicate currently viewed datamap
    const label = isCurrentDatamap ? `→ ${labelText}` : labelText;

    super(label, collapsibleState);

    this.tooltip = this.buildTooltip();
    this.description = this.buildDescription();
    this.contextValue = `layout-${node.type.toLowerCase().replace(/_/g, '-')}`;
    this.iconPath = this.getIconForNodeType(node.type);

    // Set resource URI for file nodes so they can be opened
    if ('file' in node && node.file) {
      const workspaceFolder = path.dirname(projectContext.projectFile);
      // File paths in the .vsa.json are relative to their parent folder
      // parentPath already includes the full path from root (including project folder)
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
        return new vscode.ThemeIcon('bracket-dot');
      case 'OPERATOR':
        return new vscode.ThemeIcon('bracket');
      case 'HIGH_LEVEL_OPERATOR':
        return new vscode.ThemeIcon('bracket', new vscode.ThemeColor('charts.blue'));
      case 'IMPASSE_OPERATOR':
        return new vscode.ThemeIcon('bracket-error');
      case 'HIGH_LEVEL_IMPASSE_OPERATOR':
        return new vscode.ThemeIcon('bracket-error', new vscode.ThemeColor('charts.blue'));
      case 'FILE':
        return new vscode.ThemeIcon('file-code');
      case 'FILE_OPERATOR':
        return new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'));
      case 'HIGH_LEVEL_FILE_OPERATOR':
        return new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.blue'));
      case 'FOLDER':
        return new vscode.ThemeIcon('folder');
      case 'LINK':
        return new vscode.ThemeIcon('link');
      default:
        return new vscode.ThemeIcon('symbol-misc');
    }
  }

  public getFolderPath(): string {
    if ('folder' in this.node && this.node.folder) {
      return this.parentPath ? path.join(this.parentPath, this.node.folder) : this.node.folder;
    }
    return this.parentPath;
  }
}

export class LayoutTreeProvider implements vscode.TreeDataProvider<LayoutTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<LayoutTreeItem | undefined | null | void> =
    new vscode.EventEmitter<LayoutTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<LayoutTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private projectContext: ProjectContext | null = null;
  private currentDatamapId: string | null = null; // Track which datamap is currently being viewed

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  /**
   * Set which datamap is currently being viewed (to highlight the corresponding node)
   * @param datamapId The datamap vertex ID being viewed, or null for root
   */
  setCurrentDatamap(datamapId: string | null): void {
    this.currentDatamapId = datamapId;
    this.refresh();
  }

  /**
   * Load project from a specific project file path
   */
  async loadProjectFromFile(projectFile: string): Promise<void> {
    try {
      const loader = new ProjectLoader();
      const context = await loader.loadProject(projectFile);
      this.projectContext = context;
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
      const loader = new ProjectLoader();
      const projectFile = await loader.findProjectFile(workspaceFolder.fsPath);
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
          '', // Root element has no parent path
          this.currentDatamapId
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
          childParentPath,
          this.currentDatamapId
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
