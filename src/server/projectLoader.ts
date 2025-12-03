/**
 * Project Loader for Soar project files (.vsa.json, .vsproj, .soarproj)
 *
 * Handles loading and saving Soar project files with VisualSoar schema compatibility.
 * Default format: .vsa.json
 * Legacy support: .vsproj, .soarproj
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  VisualSoarProject,
  ProjectContext,
  DMVertex,
  LayoutNode,
  hasChildren,
} from './visualSoarProject';

export class ProjectLoader {
  /**
   * Find a Soar project file in the workspace
   * Priority: .vsa.json (default) > .vsproj (VisualSoar) > .soarproj (legacy)
   */
  async findProjectFile(workspaceRoot: string): Promise<string | null> {
    try {
      const files = await fs.promises.readdir(workspaceRoot);

      // Priority 1: .vsa.json (default format)
      for (const file of files) {
        if (file.endsWith('.vsa.json')) {
          return path.join(workspaceRoot, file);
        }
      }

      // Priority 2 & 3: VisualSoar formats for backward compatibility
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
   * Recursively search for a Soar project file in subdirectories
   * Searches up to 3 levels deep to avoid performance issues
   */
  async findProjectFileRecursive(
    workspaceRoot: string,
    maxDepth: number = 3
  ): Promise<string | null> {
    // First try the current directory
    const projectFile = await this.findProjectFile(workspaceRoot);
    if (projectFile) {
      return projectFile;
    }

    // If not found and we haven't reached max depth, search subdirectories
    if (maxDepth > 0) {
      try {
        const entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const subPath = path.join(workspaceRoot, entry.name);
            const result = await this.findProjectFileRecursive(subPath, maxDepth - 1);
            if (result) {
              return result;
            }
          }
        }
      } catch (error) {
        console.error('Error searching subdirectories:', error);
      }
    }

    return null;
  }

  /**
   * Load a VisualSoar project file
   */
  async loadProject(projectFile: string): Promise<ProjectContext> {
    const content = await fs.promises.readFile(projectFile, 'utf-8');
    const project: VisualSoarProject = JSON.parse(content);

    // Validate schema version
    if (project.version !== '6') {
      throw new Error(`Unsupported project version: ${project.version}. Expected version 6.`);
    }

    // Validate required fields
    if (!project.datamap || !project.layout) {
      throw new Error('Invalid project file: missing datamap or layout');
    }

    // Build datamap index for fast lookup
    const datamapIndex = new Map<string, DMVertex>();
    for (const vertex of project.datamap.vertices) {
      datamapIndex.set(vertex.id, vertex);
    }

    // Build layout index for fast lookup
    const layoutIndex = new Map<string, LayoutNode>();
    this.indexLayout(project.layout, layoutIndex);

    return {
      projectFile,
      project,
      datamapIndex,
      layoutIndex,
    };
  }

  /**
   * Save a VisualSoar project file
   */
  async saveProject(context: ProjectContext): Promise<void> {
    const content = JSON.stringify(context.project, null, 2);
    await fs.promises.writeFile(context.projectFile, content, 'utf-8');
  }

  /**
   * Recursively index layout nodes for fast lookup
   */
  private indexLayout(node: LayoutNode, index: Map<string, LayoutNode>): void {
    index.set(node.id, node);

    if (hasChildren(node) && node.children) {
      for (const child of node.children) {
        this.indexLayout(child, index);
      }
    }
  }

  /**
   * Get all attributes from a datamap vertex
   */
  getVertexAttributes(
    vertexId: string,
    context: ProjectContext
  ): Array<{ name: string; toId: string; comment?: string }> {
    const vertex = context.datamapIndex.get(vertexId);

    if (!vertex || vertex.type !== 'SOAR_ID') {
      return [];
    }

    return (
      vertex.outEdges?.map(edge => ({
        name: edge.name,
        toId: edge.toId,
        comment: edge.comment,
      })) || []
    );
  }

  /**
   * Get all possible values for an enumeration vertex
   */
  getEnumerationChoices(vertexId: string, context: ProjectContext): string[] {
    const vertex = context.datamapIndex.get(vertexId);

    if (!vertex || vertex.type !== 'ENUMERATION') {
      return [];
    }

    return vertex.choices;
  }

  /**
   * Check if an attribute is valid for a given vertex
   */
  isValidAttribute(vertexId: string, attributeName: string, context: ProjectContext): boolean {
    const attributes = this.getVertexAttributes(vertexId, context);
    return attributes.some(attr => attr.name === attributeName);
  }
}
