/**
 * Datamap Operations
 *
 * Handles CRUD operations on the datamap structure
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  VisualSoarProject,
  DMVertex,
  OutEdge,
  SoarIdVertex,
  EnumerationVertex,
} from '../server/visualSoarProject';
import { generateVertexId } from '../server/idGeneration';
import { DatamapProjectContext, DatamapMetadataCache, InboundEdgeInfo } from './datamapMetadata';

export class DatamapOperations {
  /**
   * Add a linked attribute (SOAR_ID reference to existing vertex)
   */
  static async addLinkedAttribute(
    projectContext: DatamapProjectContext,
    parentVertexId: string
  ): Promise<boolean> {
    const parentVertex = projectContext.datamapIndex.get(parentVertexId);

    if (!parentVertex || parentVertex.type !== 'SOAR_ID') {
      vscode.window.showErrorMessage('Can only add attributes to SOAR_ID vertices');
      return false;
    }

    // Get all SOAR_ID vertices that can be linked to
    const linkableVertices: Array<{ label: string; vertexId: string; description: string }> = [];

    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.id !== parentVertexId) {
        // Find a descriptive name for this vertex by looking for edges pointing to it
        let name = vertex.id;
        let description = 'SOAR_ID';

        // Try to find attribute name pointing to this vertex
        for (const v of projectContext.project.datamap.vertices) {
          if (v.type === 'SOAR_ID' && v.outEdges) {
            for (const edge of v.outEdges) {
              if (edge.toId === vertex.id) {
                name = edge.name;
                description = edge.comment || 'SOAR_ID';
                break;
              }
            }
          }
        }

        linkableVertices.push({
          label: name,
          vertexId: vertex.id,
          description: description,
        });
      }
    }

    if (linkableVertices.length === 0) {
      vscode.window.showWarningMessage('No other SOAR_ID vertices available to link to');
      return false;
    }

    // Prompt to select target vertex
    const selectedVertex = await vscode.window.showQuickPick(linkableVertices, {
      placeHolder: 'Select the SOAR_ID to link to',
      matchOnDescription: true,
    });

    if (!selectedVertex) {
      return false;
    }

    // Use the selected vertex label as the attribute name by default
    const attributeName = await vscode.window.showInputBox({
      prompt: 'Enter attribute name for the link',
      placeHolder: 'e.g., superstate, top-state, linked-state',
      value: selectedVertex.label,
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'Attribute name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return 'Attribute name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        // Check if attribute already exists
        if (parentVertex.outEdges?.some(e => e.name === value)) {
          return `Attribute '${value}' already exists`;
        }
        return null;
      },
    });

    if (!attributeName) {
      return false;
    }

    // Optional: prompt for comment
    const comment = await vscode.window.showInputBox({
      prompt: 'Enter comment (optional)',
      placeHolder: 'Description of this link',
    });

    // Create new edge pointing to existing vertex (no new vertex created)
    const newEdge: OutEdge = {
      name: attributeName,
      toId: selectedVertex.vertexId,
      comment: comment || undefined,
    };

    // Add edge to parent
    if (!parentVertex.outEdges) {
      parentVertex.outEdges = [];
    }
    parentVertex.outEdges.push(newEdge);

    // Save project
    await this.saveProject(projectContext);

    vscode.window.showInformationMessage(
      `Created link '${attributeName}' → '${selectedVertex.label}'`
    );

    return true;
  }

  /**
   * Add a new attribute to a SOAR_ID vertex
   */
  static async addAttribute(
    projectContext: DatamapProjectContext,
    parentVertexId: string
  ): Promise<boolean> {
    const parentVertex = projectContext.datamapIndex.get(parentVertexId);

    if (!parentVertex || parentVertex.type !== 'SOAR_ID') {
      vscode.window.showErrorMessage('Can only add attributes to SOAR_ID vertices');
      return false;
    }

    // Prompt for attribute name
    const attributeName = await vscode.window.showInputBox({
      prompt: 'Enter attribute name',
      placeHolder: 'e.g., position, value, status',
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'Attribute name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return 'Attribute name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        // Check if attribute already exists
        if (parentVertex.outEdges?.some(e => e.name === value)) {
          return `Attribute '${value}' already exists`;
        }
        return null;
      },
    });

    if (!attributeName) {
      return false;
    }

    // Prompt for attribute type
    const attributeType = await vscode.window.showQuickPick(
      [
        { label: 'SOAR_ID', description: 'Identifier (can have sub-attributes)' },
        { label: 'INTEGER', description: 'Integer number' },
        { label: 'FLOAT', description: 'Floating point number' },
        { label: 'STRING', description: 'Text string' },
        { label: 'ENUMERATION', description: 'Enumeration (predefined choices)' },
      ],
      {
        placeHolder: 'Select attribute type',
      }
    );

    if (!attributeType) {
      return false;
    }

    // Handle enumeration - prompt for choices
    let choices: string[] = [];
    if (attributeType.label === 'ENUMERATION') {
      const choicesInput = await vscode.window.showInputBox({
        prompt: 'Enter enumeration choices (comma-separated)',
        placeHolder: 'e.g., success, failure, pending',
        validateInput: value => {
          if (!value || value.trim().length === 0) {
            return 'Enumeration must have at least one choice';
          }
          return null;
        },
      });

      if (!choicesInput) {
        return false;
      }

      choices = choicesInput
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);
    }

    // Optional: prompt for comment
    const comment = await vscode.window.showInputBox({
      prompt: 'Enter comment (optional)',
      placeHolder: 'Description of this attribute',
    });

    // Generate new vertex ID
    const newVertexId = generateVertexId(
      projectContext.project.datamap.vertices.map(vertex => vertex.id)
    );

    // Create new vertex
    const newVertex: DMVertex = {
      id: newVertexId,
      type: attributeType.label as any,
      outEdges: attributeType.label === 'SOAR_ID' ? [] : undefined,
      choices: attributeType.label === 'ENUMERATION' ? choices : undefined,
    };

    // Create new edge
    const newEdge: OutEdge = {
      name: attributeName,
      toId: newVertexId,
      comment: comment || undefined,
    };

    // Add vertex to project
    projectContext.project.datamap.vertices.push(newVertex);
    projectContext.datamapIndex.set(newVertexId, newVertex);

    // Add edge to parent
    if (!parentVertex.outEdges) {
      parentVertex.outEdges = [];
    }
    parentVertex.outEdges.push(newEdge);

    // Debug: Log the state before saving
    console.log(`Adding attribute '^${attributeName}' to vertex ${parentVertexId}`);
    console.log(`Total vertices in project: ${projectContext.project.datamap.vertices.length}`);
    console.log(`Saving to file: ${projectContext.projectFile}`);

    // Save project
    await this.saveProject(projectContext);

    vscode.window.showInformationMessage(
      `Added attribute '^${attributeName}' (${attributeType.label})`
    );
    return true;
  }

  /**
   * Edit an attribute's properties
   */
  static async editAttribute(
    projectContext: DatamapProjectContext,
    vertexId: string,
    edgeName: string
  ): Promise<boolean> {
    // Find the edge
    let parentVertex: SoarIdVertex | undefined;
    let edge: OutEdge | undefined;

    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID') {
        const soarIdVertex = vertex as SoarIdVertex;
        if (soarIdVertex.outEdges) {
          const foundEdge = soarIdVertex.outEdges.find(
            (e: OutEdge) => e.toId === vertexId && e.name === edgeName
          );
          if (foundEdge) {
            parentVertex = soarIdVertex;
            edge = foundEdge;
            break;
          }
        }
      }
    }

    if (!edge || !parentVertex) {
      vscode.window.showErrorMessage('Could not find attribute to edit');
      return false;
    }

    const targetVertex = projectContext.datamapIndex.get(vertexId);
    if (!targetVertex) {
      vscode.window.showErrorMessage('Could not find target vertex');
      return false;
    }

    // Prompt for what to edit
    const editChoice = await vscode.window.showQuickPick(
      [
        { label: 'Rename', description: 'Change attribute name' },
        { label: 'Edit Comment', description: 'Change or add a comment' },
        { label: 'Change Type', description: 'Change the attribute type (careful!)' },
        { label: 'Change Parent', description: 'Move attribute and children to a new parent' },
      ].concat(
        targetVertex.type === 'ENUMERATION'
          ? [{ label: 'Edit Values', description: 'Update enumeration values' }]
          : [],
        targetVertex.type === 'SOAR_ID'
          ? [
              {
                label: 'Change Parent + Link',
                description: 'Move to new parent and keep a linked reference here',
              },
            ]
          : []
      ),
      {
        placeHolder: 'What would you like to edit?',
      }
    );

    if (!editChoice) {
      return false;
    }

    switch (editChoice.label) {
      case 'Rename':
        return await this.renameAttribute(parentVertex, edge, projectContext);
      case 'Edit Comment':
        return await this.editAttributeComment(edge, projectContext);
      case 'Change Type':
        return await this.changeAttributeType(targetVertex, edge, projectContext);
      case 'Edit Values':
        return await this.editEnumerationValues(targetVertex, edge, projectContext);
      case 'Change Parent':
        return await this.changeParent(parentVertex, edge, targetVertex, projectContext);
      case 'Change Parent + Link':
        return await this.changeParentAndLink(parentVertex, edge, targetVertex, projectContext);
    }

    return false;
  }

  /**
   * Delete an attribute
   */
  static async deleteAttribute(
    projectContext: DatamapProjectContext,
    vertexId: string,
    edgeName: string
  ): Promise<boolean> {
    // Find the edge and parent
    let parentVertex: SoarIdVertex | undefined;
    let edgeIndex: number = -1;

    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID') {
        const soarIdVertex = vertex as SoarIdVertex;
        if (soarIdVertex.outEdges) {
          edgeIndex = soarIdVertex.outEdges.findIndex(
            (e: OutEdge) => e.toId === vertexId && e.name === edgeName
          );
          if (edgeIndex !== -1) {
            parentVertex = soarIdVertex;
            break;
          }
        }
      }
    }

    if (!parentVertex || edgeIndex === -1 || !parentVertex.outEdges) {
      vscode.window.showErrorMessage('Could not find attribute to delete');
      return false;
    }

    const edge = parentVertex.outEdges[edgeIndex];

    // Confirm deletion
    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete attribute '^${edge.name}'? This will also delete all sub-attributes.`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return false;
    }

    // Remove edge
    parentVertex.outEdges!.splice(edgeIndex, 1);

    // Remove vertex and all descendants
    this.removeVertexRecursive(vertexId, projectContext);

    // Save project
    await this.saveProject(projectContext);

    vscode.window.showInformationMessage(`Deleted attribute '^${edge.name}'`);
    return true;
  }

  /**
   * Remove a linked attribute edge without deleting the underlying vertex
   */
  static async removeLinkedAttribute(
    projectContext: DatamapProjectContext,
    edgeMetadata: InboundEdgeInfo
  ): Promise<boolean> {
    const parentVertex = projectContext.datamapIndex.get(edgeMetadata.parentId);
    if (!parentVertex || parentVertex.type !== 'SOAR_ID' || !parentVertex.outEdges) {
      vscode.window.showErrorMessage('Could not find linked attribute to remove');
      return false;
    }

    const edgeIndex = parentVertex.outEdges.findIndex(
      edge => edge.name === edgeMetadata.edgeName && edge.toId === edgeMetadata.targetId
    );

    if (edgeIndex === -1) {
      vscode.window.showErrorMessage('Could not find linked attribute to remove');
      return false;
    }

    parentVertex.outEdges.splice(edgeIndex, 1);

    await this.saveProject(projectContext);
    vscode.window.showInformationMessage(
      `Removed link '^${edgeMetadata.edgeName}' → ${edgeMetadata.targetId}`
    );
    return true;
  }

  /**
   * Helper: Rename an attribute
   */
  private static async renameAttribute(
    parentVertex: SoarIdVertex,
    edge: OutEdge,
    projectContext: DatamapProjectContext
  ): Promise<boolean> {
    const newName = await vscode.window.showInputBox({
      prompt: 'Enter new attribute name',
      value: edge.name,
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'Attribute name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return 'Attribute name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        if (value !== edge.name && parentVertex.outEdges?.some((e: OutEdge) => e.name === value)) {
          return `Attribute '${value}' already exists`;
        }
        return null;
      },
    });

    if (!newName || newName === edge.name) {
      return false;
    }

    edge.name = newName;
    await this.saveProject(projectContext);
    vscode.window.showInformationMessage(`Renamed to '^${newName}'`);
    return true;
  }

  /**
   * Helper: Edit attribute comment
   */
  private static async editAttributeComment(
    edge: OutEdge,
    projectContext: DatamapProjectContext
  ): Promise<boolean> {
    const newComment = await vscode.window.showInputBox({
      prompt: 'Enter comment',
      value: edge.comment || '',
      placeHolder: 'Description of this attribute',
    });

    if (newComment === undefined) {
      return false;
    }

    edge.comment = newComment.trim().length > 0 ? newComment : undefined;
    await this.saveProject(projectContext);
    vscode.window.showInformationMessage('Comment updated');
    return true;
  }

  /**
   * Helper: Change attribute type
   */
  private static async changeAttributeType(
    vertex: DMVertex,
    edge: OutEdge,
    projectContext: DatamapProjectContext
  ): Promise<boolean> {
    const newType = await vscode.window.showQuickPick(
      [
        { label: 'SOAR_ID', description: 'Identifier (can have sub-attributes)' },
        { label: 'INTEGER', description: 'Integer number' },
        { label: 'FLOAT', description: 'Floating point number' },
        { label: 'STRING', description: 'Text string' },
        { label: 'ENUMERATION', description: 'Enumeration (predefined choices)' },
      ],
      {
        placeHolder: `Current type: ${vertex.type}`,
      }
    );

    if (!newType || newType.label === vertex.type) {
      return false;
    }

    // Warn about data loss
    if (vertex.type === 'SOAR_ID' && vertex.outEdges && vertex.outEdges.length > 0) {
      const confirm = await vscode.window.showWarningMessage(
        `Changing type from SOAR_ID will delete all ${vertex.outEdges.length} sub-attributes. Continue?`,
        { modal: true },
        'Change Type'
      );
      if (confirm !== 'Change Type') {
        return false;
      }
    }

    // Handle enumeration choices
    if (newType.label === 'ENUMERATION') {
      const choicesInput = await vscode.window.showInputBox({
        prompt: 'Enter enumeration choices (comma-separated)',
        placeHolder: 'e.g., success, failure, pending',
        value:
          vertex.type === 'ENUMERATION' ? (vertex as EnumerationVertex).choices?.join(', ') : '',
        validateInput: value => {
          if (!value || value.trim().length === 0) {
            return 'Enumeration must have at least one choice';
          }
          return null;
        },
      });

      if (!choicesInput) {
        return false;
      }

      (vertex as any).choices = choicesInput
        .split(',')
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 0);
    } else {
      delete (vertex as any).choices;
    }

    // Update type
    vertex.type = newType.label as any;

    // Handle outEdges based on new type
    if (newType.label === 'SOAR_ID') {
      const soarIdVertex = vertex as any as SoarIdVertex;
      if (!soarIdVertex.outEdges) {
        soarIdVertex.outEdges = [];
      }
    } else {
      // Remove all sub-vertices if changing from SOAR_ID
      if (vertex.type === 'SOAR_ID') {
        const soarIdVertex = vertex as SoarIdVertex;
        if (soarIdVertex.outEdges) {
          for (const subEdge of soarIdVertex.outEdges) {
            this.removeVertexRecursive(subEdge.toId, projectContext);
          }
        }
      }
      delete (vertex as any).outEdges;
    }

    await this.saveProject(projectContext);
    vscode.window.showInformationMessage(`Changed type to ${newType.label}`);
    return true;
  }

  /**
   * Helper: Edit enumeration values
   */
  private static async editEnumerationValues(
    vertex: DMVertex,
    edge: OutEdge,
    projectContext: DatamapProjectContext
  ): Promise<boolean> {
    if (vertex.type !== 'ENUMERATION') {
      vscode.window.showErrorMessage(`Attribute '^${edge.name}' is not an enumeration`);
      return false;
    }

    const currentChoices = (vertex as EnumerationVertex).choices || [];
    const choicesInput = await vscode.window.showInputBox({
      prompt: `Enter values for '^${edge.name}' (comma-separated)`,
      placeHolder: 'e.g., conflict, constraint-failure, no-change, tie',
      value: currentChoices.join(', '),
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'Enumeration must have at least one value';
        }
        const parsed = value
          .split(',')
          .map(choice => choice.trim())
          .filter(choice => choice.length > 0);
        if (parsed.length === 0) {
          return 'Enumeration must have at least one value';
        }
        return null;
      },
    });

    if (choicesInput === undefined) {
      return false;
    }

    const choices = choicesInput
      .split(',')
      .map(choice => choice.trim())
      .filter(choice => choice.length > 0);

    (vertex as EnumerationVertex).choices = choices;
    await this.saveProject(projectContext);
    vscode.window.showInformationMessage(`Updated values for '^${edge.name}'`);
    return true;
  }

  private static async changeParent(
    currentParent: SoarIdVertex,
    edge: OutEdge,
    targetVertex: DMVertex,
    projectContext: DatamapProjectContext
  ): Promise<boolean> {
    const newParent = await this.selectNewParent(
      projectContext,
      currentParent,
      edge,
      targetVertex,
      'Select the new parent for this attribute'
    );

    if (!newParent) {
      return false;
    }

    if (!currentParent.outEdges) {
      vscode.window.showErrorMessage('Current parent has no attributes to move');
      return false;
    }

    const edgeIndex = currentParent.outEdges.findIndex(
      candidate => candidate.name === edge.name && candidate.toId === edge.toId
    );

    if (edgeIndex === -1) {
      vscode.window.showErrorMessage('Could not find attribute edge to move');
      return false;
    }

    currentParent.outEdges.splice(edgeIndex, 1);

    if (!newParent.outEdges) {
      newParent.outEdges = [];
    }

    newParent.outEdges.push({
      name: edge.name,
      toId: edge.toId,
      comment: edge.comment,
    });

    await this.saveProject(projectContext);
    vscode.window.showInformationMessage(`Moved '^${edge.name}' to parent ${newParent.id}`);
    return true;
  }

  private static async changeParentAndLink(
    currentParent: SoarIdVertex,
    edge: OutEdge,
    targetVertex: DMVertex,
    projectContext: DatamapProjectContext
  ): Promise<boolean> {
    if (targetVertex.type !== 'SOAR_ID') {
      vscode.window.showErrorMessage('Change Parent + Link is only available for SOAR_ID targets');
      return false;
    }

    const newParent = await this.selectNewParent(
      projectContext,
      currentParent,
      edge,
      targetVertex,
      'Select the new owner parent (current parent keeps a link)'
    );

    if (!newParent) {
      return false;
    }

    if (!currentParent.outEdges) {
      vscode.window.showErrorMessage('Current parent has no attributes to move');
      return false;
    }

    const edgeIndex = currentParent.outEdges.findIndex(
      candidate => candidate.name === edge.name && candidate.toId === edge.toId
    );

    if (edgeIndex === -1) {
      vscode.window.showErrorMessage('Could not find attribute edge to move');
      return false;
    }

    currentParent.outEdges.splice(edgeIndex, 1);

    if (!newParent.outEdges) {
      newParent.outEdges = [];
    }

    newParent.outEdges.push({
      name: edge.name,
      toId: edge.toId,
      comment: edge.comment,
    });

    currentParent.outEdges.push({
      name: edge.name,
      toId: edge.toId,
      comment: edge.comment,
    });

    await this.saveProject(projectContext);
    vscode.window.showInformationMessage(
      `Moved '^${edge.name}' to parent ${newParent.id} and kept link on ${currentParent.id}`
    );
    return true;
  }

  private static async selectNewParent(
    projectContext: DatamapProjectContext,
    currentParent: SoarIdVertex,
    edge: OutEdge,
    targetVertex: DMVertex,
    placeHolder: string
  ): Promise<SoarIdVertex | undefined> {
    const parentOptions: Array<{ label: string; description: string; vertexId: string }> = [];

    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID') {
        continue;
      }

      const candidateParent = vertex as SoarIdVertex;

      if (candidateParent.id === currentParent.id) {
        continue;
      }

      if (candidateParent.outEdges?.some(candidate => candidate.name === edge.name)) {
        continue;
      }

      if (
        targetVertex.type === 'SOAR_ID' &&
        (candidateParent.id === targetVertex.id ||
          this.isReachableFrom(targetVertex.id, candidateParent.id, projectContext, new Set()))
      ) {
        continue;
      }

      parentOptions.push({
        label: this.getParentDisplayName(candidateParent.id, projectContext),
        description: candidateParent.id,
        vertexId: candidateParent.id,
      });
    }

    if (parentOptions.length === 0) {
      vscode.window.showWarningMessage('No valid parent candidates available for this move');
      return undefined;
    }

    const selectedParent = await vscode.window.showQuickPick(parentOptions, {
      placeHolder,
      matchOnDescription: true,
    });

    if (!selectedParent) {
      return undefined;
    }

    const parentVertex = projectContext.datamapIndex.get(selectedParent.vertexId);
    if (!parentVertex || parentVertex.type !== 'SOAR_ID') {
      vscode.window.showErrorMessage('Selected parent is not a valid SOAR_ID vertex');
      return undefined;
    }

    return parentVertex;
  }

  private static getParentDisplayName(
    vertexId: string,
    projectContext: DatamapProjectContext
  ): string {
    if (vertexId === projectContext.project.datamap.rootId) {
      return `${projectContext.project.layout.name || 'root'} (root)`;
    }

    const inboundEdges = projectContext.datamapMetadata.getInboundReferences(vertexId);
    if (inboundEdges.length > 0) {
      return `${inboundEdges[0].edgeName} (${vertexId})`;
    }

    return vertexId;
  }

  private static isReachableFrom(
    fromVertexId: string,
    targetVertexId: string,
    projectContext: DatamapProjectContext,
    visited: Set<string>
  ): boolean {
    if (fromVertexId === targetVertexId) {
      return true;
    }

    if (visited.has(fromVertexId)) {
      return false;
    }
    visited.add(fromVertexId);

    const vertex = projectContext.datamapIndex.get(fromVertexId);
    if (!vertex || vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
      return false;
    }

    for (const childEdge of vertex.outEdges) {
      if (this.isReachableFrom(childEdge.toId, targetVertexId, projectContext, visited)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Helper: Recursively remove a vertex and all its descendants
   */
  private static removeVertexRecursive(
    vertexId: string,
    projectContext: DatamapProjectContext
  ): void {
    const vertex = projectContext.datamapIndex.get(vertexId);
    if (!vertex) {
      return;
    }

    // Recursively remove children
    if (vertex.type === 'SOAR_ID') {
      const soarIdVertex = vertex as SoarIdVertex;
      if (soarIdVertex.outEdges) {
        for (const edge of soarIdVertex.outEdges) {
          this.removeVertexRecursive(edge.toId, projectContext);
        }
      }
    }

    // Remove from index
    projectContext.datamapIndex.delete(vertexId);

    // Remove from vertices array
    const index = projectContext.project.datamap.vertices.findIndex(v => v.id === vertexId);
    if (index !== -1) {
      projectContext.project.datamap.vertices.splice(index, 1);
    }
  }

  /**
   * Helper: Save project to file
   */
  private static async saveProject(projectContext: DatamapProjectContext): Promise<void> {
    try {
      const json = JSON.stringify(projectContext.project, null, 2);
      await fs.promises.writeFile(projectContext.projectFile, json, 'utf-8');
      console.log(`Successfully saved project to: ${projectContext.projectFile}`);

      projectContext.datamapMetadata = DatamapMetadataCache.build(
        projectContext.project,
        projectContext.datamapIndex
      );
    } catch (error: any) {
      const errorMsg = `Failed to save project: ${error.message}`;
      console.error(errorMsg);
      vscode.window.showErrorMessage(errorMsg);
      throw error;
    }
  }
}
