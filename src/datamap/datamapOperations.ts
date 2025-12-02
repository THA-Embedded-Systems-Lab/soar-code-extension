/**
 * Datamap Operations
 * 
 * Handles CRUD operations on the datamap structure
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { VisualSoarProject, DMVertex, OutEdge, SoarIdVertex, EnumerationVertex, ProjectContext } from '../server/visualSoarProject';

export class DatamapOperations {

    /**
     * Add a new attribute to a SOAR_ID vertex
     */
    static async addAttribute(
        projectContext: ProjectContext,
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
            validateInput: (value) => {
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
            }
        });

        if (!attributeName) {
            return false;
        }

        // Prompt for attribute type
        const attributeType = await vscode.window.showQuickPick([
            { label: 'SOAR_ID', description: 'Identifier (can have sub-attributes)' },
            { label: 'INTEGER', description: 'Integer number' },
            { label: 'FLOAT', description: 'Floating point number' },
            { label: 'STRING', description: 'Text string' },
            { label: 'ENUMERATION', description: 'Enumeration (predefined choices)' }
        ], {
            placeHolder: 'Select attribute type'
        });

        if (!attributeType) {
            return false;
        }

        // Handle enumeration - prompt for choices
        let choices: string[] = [];
        if (attributeType.label === 'ENUMERATION') {
            const choicesInput = await vscode.window.showInputBox({
                prompt: 'Enter enumeration choices (comma-separated)',
                placeHolder: 'e.g., success, failure, pending',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Enumeration must have at least one choice';
                    }
                    return null;
                }
            });

            if (!choicesInput) {
                return false;
            }

            choices = choicesInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
        }

        // Optional: prompt for comment
        const comment = await vscode.window.showInputBox({
            prompt: 'Enter comment (optional)',
            placeHolder: 'Description of this attribute'
        });

        // Generate new vertex ID
        const newVertexId = this.generateVertexId(projectContext.project);

        // Create new vertex
        const newVertex: DMVertex = {
            id: newVertexId,
            type: attributeType.label as any,
            outEdges: attributeType.label === 'SOAR_ID' ? [] : undefined,
            choices: attributeType.label === 'ENUMERATION' ? choices : undefined
        };

        // Create new edge
        const newEdge: OutEdge = {
            name: attributeName,
            toId: newVertexId,
            comment: comment || undefined
        };

        // Add vertex to project
        projectContext.project.datamap.vertices.push(newVertex);
        projectContext.datamapIndex.set(newVertexId, newVertex);

        // Add edge to parent
        if (!parentVertex.outEdges) {
            parentVertex.outEdges = [];
        }
        parentVertex.outEdges.push(newEdge);

        // Save project
        await this.saveProject(projectContext);

        vscode.window.showInformationMessage(`Added attribute '^${attributeName}' (${attributeType.label})`);
        return true;
    }

    /**
     * Edit an attribute's properties
     */
    static async editAttribute(
        projectContext: ProjectContext,
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
                    const foundEdge = soarIdVertex.outEdges.find((e: OutEdge) => e.toId === vertexId && e.name === edgeName);
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
        const editChoice = await vscode.window.showQuickPick([
            { label: 'Rename', description: 'Change attribute name' },
            { label: 'Edit Comment', description: 'Change or add a comment' },
            { label: 'Change Type', description: 'Change the attribute type (careful!)' }
        ], {
            placeHolder: 'What would you like to edit?'
        });

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
        }

        return false;
    }

    /**
     * Delete an attribute
     */
    static async deleteAttribute(
        projectContext: ProjectContext,
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
                    edgeIndex = soarIdVertex.outEdges.findIndex((e: OutEdge) => e.toId === vertexId && e.name === edgeName);
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
     * Helper: Rename an attribute
     */
    private static async renameAttribute(
        parentVertex: SoarIdVertex,
        edge: OutEdge,
        projectContext: ProjectContext
    ): Promise<boolean> {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new attribute name',
            value: edge.name,
            validateInput: (value) => {
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
            }
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
        projectContext: ProjectContext
    ): Promise<boolean> {
        const newComment = await vscode.window.showInputBox({
            prompt: 'Enter comment',
            value: edge.comment || '',
            placeHolder: 'Description of this attribute'
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
        projectContext: ProjectContext
    ): Promise<boolean> {
        const newType = await vscode.window.showQuickPick([
            { label: 'SOAR_ID', description: 'Identifier (can have sub-attributes)' },
            { label: 'INTEGER', description: 'Integer number' },
            { label: 'FLOAT', description: 'Floating point number' },
            { label: 'STRING', description: 'Text string' },
            { label: 'ENUMERATION', description: 'Enumeration (predefined choices)' }
        ], {
            placeHolder: `Current type: ${vertex.type}`
        });

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
                value: vertex.type === 'ENUMERATION' ? (vertex as EnumerationVertex).choices?.join(', ') : '',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Enumeration must have at least one choice';
                    }
                    return null;
                }
            });

            if (!choicesInput) {
                return false;
            }

            (vertex as any).choices = choicesInput.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
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
     * Helper: Generate a unique vertex ID
     */
    private static generateVertexId(project: VisualSoarProject): string {
        const existingIds = new Set(project.datamap.vertices.map(v => parseInt(v.id, 10)));
        let id = 1;
        while (existingIds.has(id)) {
            id++;
        }
        return id.toString();
    }

    /**
     * Helper: Recursively remove a vertex and all its descendants
     */
    private static removeVertexRecursive(vertexId: string, projectContext: ProjectContext): void {
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
    private static async saveProject(projectContext: ProjectContext): Promise<void> {
        const json = JSON.stringify(projectContext.project, null, 2);
        await fs.promises.writeFile(projectContext.projectFile, json, 'utf-8');
    }
}
