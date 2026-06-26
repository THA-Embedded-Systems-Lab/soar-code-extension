/**
 * Datamap Tree View Provider
 *
 * Provides a tree view of the VisualSoar datamap in the VS Code sidebar
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VisualSoarProject, DMVertex } from '../server/visualSoarProject';
import { ProjectLoader } from '../server/projectLoader';
import {
  DatamapMetadataCache,
  DatamapProjectContext,
  DatamapEdgeMetadata,
} from './datamapMetadata';

export class DatamapTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly vertexId: string,
    public readonly vertex: DMVertex | null,
    public readonly edgeName?: string,
    public readonly comment?: string,
    public readonly ancestorIds: Set<string> = new Set(),
    private readonly datamapIndex?: Map<string, DMVertex>,
    public readonly parentVertexId?: string,
    public readonly isImmutableView: boolean = false,
    public readonly edgeMetadata?: DatamapEdgeMetadata
  ) {
    super(label, collapsibleState);

    if (vertex) {
      this.tooltip = this.buildTooltip();
      this.description = this.buildDescription();

      const isLinkedEdge = this.edgeMetadata?.isLink ?? false;
      const showLinkGlyph = this.edgeMetadata?.hasLinkedSiblings ?? false;

      if (edgeName) {
        const baseContext = `datamap-attribute-${vertex.type.toLowerCase()}`;
        this.contextValue = isLinkedEdge ? `${baseContext}-linked` : baseContext;
      } else {
        this.contextValue = 'datamap-root';
      }

      if (showLinkGlyph) {
        this.iconPath = new vscode.ThemeIcon('link', new vscode.ThemeColor('charts.blue'));
      } else {
        this.iconPath = this.getIconForVertexType(vertex.type);
      }
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

    if (this.edgeMetadata?.hasLinkedSiblings) {
      if (this.edgeMetadata.isLink) {
        lines.push('🔗 Linked attribute');
        if (this.edgeMetadata.ownerParentId) {
          lines.push(`Owner: ${this.edgeMetadata.ownerParentId}`);
        }
      } else {
        lines.push('🔗 Shared attribute owner');
        const linkedPartners = Math.max(this.edgeMetadata.inboundCount - 1, 0);
        lines.push(`Linked parents: ${linkedPartners}`);
      }
      lines.push(`Inbound references: ${this.edgeMetadata.inboundCount}`);
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
      if (this.edgeName === 'operator' && this.vertex.outEdges) {
        const nameEdge = this.vertex.outEdges.find(e => e.name === 'name');
        if (nameEdge) {
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
    return this.datamapIndex?.get(vertexId);
  }

  private getIconForVertexType(type: string): vscode.ThemeIcon {
    switch (type) {
      case 'SOAR_ID':
        return new vscode.ThemeIcon('link');
      case 'INTEGER':
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

/** Sort order priority for vertex types (lower = higher priority) */
const TYPE_SORT_ORDER: Record<string, number> = {
  SOAR_ID: 0,
  ENUMERATION: 1,
  INTEGER: 2,
  FLOAT: 3,
  STRING: 4,
  JAVA_FILE: 5,
};

export class DatamapTreeProvider implements vscode.TreeDataProvider<DatamapTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DatamapTreeItem | undefined | null | void> =
    new vscode.EventEmitter<DatamapTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DatamapTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private projectContext: DatamapProjectContext | null = null;
  private currentRootId: string | null = null; // Which datamap vertex to display (null = project root)
  private _searchFilter: string = '';
  /** Maps a high-level operator's name (lowercased) to its substate datamap root id. */
  private highLevelSubstates: Map<string, string> = new Map();

  constructor() {}

  /**
   * Whether high-level operator substate datamaps should be expanded inline
   * within the parent datamap tree (off by default to match VisualSoar, where
   * substates are viewed by switching the datamap root).
   */
  private expandHighLevelOperators(): boolean {
    return vscode.workspace
      .getConfiguration('soar')
      .get<boolean>('datamap.expandHighLevelOperators', false);
  }

  /** Current search filter string (empty means no filter) */
  get searchFilter(): string {
    return this._searchFilter;
  }

  /** Set the search filter and refresh the tree */
  setSearchFilter(filter: string): void {
    this._searchFilter = filter.trim().toLowerCase();
    this.refresh();
  }

  /**
   * Load project from a specific project file path
   */
  async loadProjectFromFile(projectFile: string): Promise<void> {
    try {
      const loader = new ProjectLoader();
      const baseContext = await loader.loadProject(projectFile);
      const datamapMetadata = DatamapMetadataCache.build(
        baseContext.project,
        baseContext.datamapIndex
      );

      this.projectContext = {
        ...baseContext,
        datamapMetadata,
      } as DatamapProjectContext;

      this.buildHighLevelSubstateMap();

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

  getProjectContext(): DatamapProjectContext | null {
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
   * Build the lookup from high-level operator name to its substate datamap root.
   * Substate datamaps are disconnected subgraphs reachable only through the
   * layout node's `dmId`; they are matched back to the parent datamap by the
   * operator's name (the same association VisualSoar uses).
   */
  private buildHighLevelSubstateMap(): void {
    this.highLevelSubstates = new Map();
    if (!this.projectContext) {
      return;
    }
    for (const node of this.projectContext.layoutIndex.values()) {
      if (
        (node.type === 'HIGH_LEVEL_OPERATOR' || node.type === 'HIGH_LEVEL_FILE_OPERATOR') &&
        'dmId' in node &&
        node.dmId &&
        'name' in node &&
        node.name
      ) {
        this.highLevelSubstates.set(node.name.toLowerCase(), node.dmId);
      }
    }
  }

  /** Return the single enumeration name of an operator SOAR_ID vertex, if any. */
  private getOperatorName(vertex: DMVertex | null): string | undefined {
    if (!vertex || vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
      return undefined;
    }
    const nameEdge = vertex.outEdges.find(e => e.name === 'name');
    if (!nameEdge) {
      return undefined;
    }
    const nameVertex = this.projectContext!.datamapIndex.get(nameEdge.toId);
    if (nameVertex && nameVertex.type === 'ENUMERATION' && nameVertex.choices.length > 0) {
      return nameVertex.choices[0];
    }
    return undefined;
  }

  /**
   * Resolve the substate datamap root for an `operator` edge target when inline
   * expansion is enabled. Returns undefined when disabled, when the operator has
   * no associated high-level substate, or when including it would create a cycle.
   */
  private resolveSubstateRoot(
    edgeName: string | undefined,
    vertex: DMVertex | null,
    ancestorIds: Set<string>
  ): string | undefined {
    if (!this.expandHighLevelOperators() || edgeName !== 'operator') {
      return undefined;
    }
    const operatorName = this.getOperatorName(vertex);
    if (!operatorName) {
      return undefined;
    }
    const substateId = this.highLevelSubstates.get(operatorName.toLowerCase());
    if (!substateId || ancestorIds.has(substateId)) {
      return undefined;
    }
    return this.projectContext!.datamapIndex.get(substateId)?.type === 'SOAR_ID'
      ? substateId
      : undefined;
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

  /**
   * Returns true if the edge name matches the filter OR any descendant attribute
   * name matches (recursive). Cycle-safe via the visited set.
   */
  private edgeMatchesFilter(
    edgeName: string,
    targetId: string,
    filter: string,
    visited: Set<string> = new Set()
  ): boolean {
    if (edgeName.toLowerCase().includes(filter)) {
      return true;
    }
    if (visited.has(targetId)) {
      return false;
    }
    visited.add(targetId);
    const vertex = this.projectContext!.datamapIndex.get(targetId);
    if (!vertex || vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
      return false;
    }
    return vertex.outEdges.some(e => this.edgeMatchesFilter(e.name, e.toId, filter, visited));
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
        for (const [, node] of this.projectContext.layoutIndex.entries()) {
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
          this.projectContext.datamapIndex,
          undefined,
          false
        ),
      ]);
    }

    // Show children (outgoing edges)
    if (!element.vertex || element.vertex.type !== 'SOAR_ID') {
      return Promise.resolve([]);
    }

    const children: DatamapTreeItem[] = [];
    const metadataHelper = this.projectContext.datamapMetadata;

    if (element.vertex.outEdges) {
      // Optionally filter edges by search term
      const filterLower = this._searchFilter;

      let edges = element.vertex.outEdges;
      if (filterLower) {
        edges = edges.filter(e => this.edgeMatchesFilter(e.name, e.toId, filterLower));
      }

      // Sort: by type priority first, then alphabetically by name
      edges = [...edges].sort((a, b) => {
        const vA = this.projectContext!.datamapIndex.get(a.toId);
        const vB = this.projectContext!.datamapIndex.get(b.toId);
        const tA = TYPE_SORT_ORDER[vA?.type ?? ''] ?? 99;
        const tB = TYPE_SORT_ORDER[vB?.type ?? ''] ?? 99;
        if (tA !== tB) {
          return tA - tB;
        }
        return a.name.localeCompare(b.name);
      });

      for (const edge of edges) {
        const targetVertex = this.projectContext.datamapIndex.get(edge.toId);
        if (!targetVertex) {
          continue;
        }

        const edgeMetadata = metadataHelper.getEdgeMetadata(element.vertexId, edge.name, edge.toId);
        const isLinkedEdge = edgeMetadata?.isLink ?? false;

        // Check for cycles - if the target is already an ancestor, don't expand it
        const isCycle = element.ancestorIds.has(edge.toId);

        // Create new ancestor set for the child (also used as the cycle guard for
        // any inline-expanded substate hanging off this operator vertex)
        const childAncestors = new Set(element.ancestorIds);
        childAncestors.add(edge.toId);

        const hasInlineSubstate =
          !isCycle &&
          this.resolveSubstateRoot(edge.name, targetVertex, childAncestors) !== undefined;

        const hasChildren =
          (targetVertex.type === 'SOAR_ID' &&
            targetVertex.outEdges &&
            targetVertex.outEdges.length > 0 &&
            !isCycle) || // Don't allow expansion if it's a cycle
          hasInlineSubstate;

        // When filtering, auto-expand nodes whose match is only in a descendant
        const shouldAutoExpand =
          hasChildren && !!filterLower && !edge.name.toLowerCase().includes(filterLower);

        const collapsibleState = !hasChildren
          ? vscode.TreeItemCollapsibleState.None
          : shouldAutoExpand
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed;

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
            this.projectContext.datamapIndex,
            element.vertexId,
            isLinkedEdge || element.isImmutableView,
            edgeMetadata
          )
        );
      }
    }

    // Inline-expand the substate datamap of a high-level operator directly under
    // its operator vertex so the full datamap is reachable without switching root.
    const substateRootId = this.resolveSubstateRoot(
      element.edgeName,
      element.vertex,
      element.ancestorIds
    );
    if (substateRootId) {
      const substateVertex = this.projectContext.datamapIndex.get(substateRootId)!;
      const substateAncestors = new Set(element.ancestorIds);
      substateAncestors.add(substateRootId);
      const operatorName = this.getOperatorName(element.vertex) ?? 'operator';

      children.push(
        new DatamapTreeItem(
          `${operatorName} (substate)`,
          vscode.TreeItemCollapsibleState.Collapsed,
          substateRootId,
          substateVertex,
          undefined,
          undefined,
          substateAncestors,
          this.projectContext.datamapIndex,
          undefined,
          element.isImmutableView
        )
      );
    }

    return Promise.resolve(children);
  }
}
