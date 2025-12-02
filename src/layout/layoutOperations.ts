/**
 * Layout Operations
 * 
 * Handles CRUD operations on the project layout structure (operators, substates, files, folders)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    VisualSoarProject,
    LayoutNode,
    ProjectContext,
    OperatorNode,
    HighLevelOperatorNode,
    FileNode,
    FolderNode,
    hasChildren
} from '../server/visualSoarProject';
import { SoarTemplates } from './soarTemplates';

export class LayoutOperations {

    /**
     * Add a new operator (simple operator, not substate)
     */
    static async addOperator(
        projectContext: ProjectContext,
        parentNodeId: string
    ): Promise<boolean> {
        const parentNode = projectContext.layoutIndex.get(parentNodeId);

        if (!parentNode || !hasChildren(parentNode)) {
            vscode.window.showErrorMessage('Can only add operators to folder nodes');
            return false;
        }

        // Prompt for operator name
        const operatorName = await vscode.window.showInputBox({
            prompt: 'Enter operator name',
            placeHolder: 'e.g., initialize, move-forward, attack',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Operator name cannot be empty';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
                    return 'Operator name must start with a letter and contain only letters, numbers, hyphens, and underscores';
                }
                return null;
            }
        });

        if (!operatorName) {
            return false;
        }

        // Determine file path
        const workspaceFolder = path.dirname(projectContext.projectFile);
        const parentFolder = 'folder' in parentNode ? parentNode.folder : '';
        const operatorFile = path.join(parentFolder, `${operatorName}.soar`);
        const fullPath = path.join(workspaceFolder, operatorFile);

        // Check if file already exists
        if (fs.existsSync(fullPath)) {
            vscode.window.showErrorMessage(`File already exists: ${operatorFile}`);
            return false;
        }

        // Create the operator node
        const newNodeId = this.generateNodeId(projectContext.project);
        const newNode: OperatorNode = {
            type: 'OPERATOR',
            id: newNodeId,
            name: operatorName,
            file: operatorFile
        };

        // Add to parent's children
        if (!parentNode.children) {
            parentNode.children = [];
        }
        parentNode.children.push(newNode);
        projectContext.layoutIndex.set(newNodeId, newNode);

        // Generate file content
        const content = SoarTemplates.generateOperatorFile(operatorName);

        // Create file
        await fs.promises.writeFile(fullPath, content, 'utf-8');

        // Save project
        await this.saveProject(projectContext);

        vscode.window.showInformationMessage(`Created operator '${operatorName}'`);

        // Open the file
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc);

        return true;
    }

    /**
     * Add a new substate (high-level operator with datamap)
     */
    static async addSubstate(
        projectContext: ProjectContext,
        parentNodeId: string
    ): Promise<boolean> {
        const parentNode = projectContext.layoutIndex.get(parentNodeId);

        if (!parentNode || !hasChildren(parentNode)) {
            vscode.window.showErrorMessage('Can only add substates to folder nodes');
            return false;
        }

        // Prompt for substate name
        const substateName = await vscode.window.showInputBox({
            prompt: 'Enter substate name',
            placeHolder: 'e.g., plan-route, execute-mission, handle-error',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Substate name cannot be empty';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
                    return 'Substate name must start with a letter and contain only letters, numbers, hyphens, and underscores';
                }
                return null;
            }
        });

        if (!substateName) {
            return false;
        }

        // Create datamap vertex for this substate
        const dmVertexId = this.generateVertexId(projectContext.project);
        const dmVertex: any = {
            id: dmVertexId,
            type: 'SOAR_ID',
            outEdges: []
        };
        projectContext.project.datamap.vertices.push(dmVertex);
        projectContext.datamapIndex.set(dmVertexId, dmVertex);

        // Determine folder path
        const workspaceFolder = path.dirname(projectContext.projectFile);
        const parentFolder = 'folder' in parentNode ? parentNode.folder : '';
        const substateFolder = path.join(parentFolder, substateName);
        const fullFolderPath = path.join(workspaceFolder, substateFolder);

        // Create folder structure
        await fs.promises.mkdir(fullFolderPath, { recursive: true });
        await fs.promises.mkdir(path.join(fullFolderPath, 'elaborations'), { recursive: true });

        // Create files
        const initFile = path.join(substateFolder, 'elaborations', '_all.soar');
        const initContent = SoarTemplates.generateSubstateInit(substateName);
        await fs.promises.writeFile(path.join(workspaceFolder, initFile), initContent, 'utf-8');

        const proposeFile = path.join(substateFolder, 'propose.soar');
        const proposeContent = SoarTemplates.generateSubstatePropose(substateName);
        await fs.promises.writeFile(path.join(workspaceFolder, proposeFile), proposeContent, 'utf-8');

        // Create the substate node
        const newNodeId = this.generateNodeId(projectContext.project);
        const newNode: HighLevelOperatorNode = {
            type: 'HIGH_LEVEL_OPERATOR',
            id: newNodeId,
            name: substateName,
            file: proposeFile,
            dmId: dmVertexId,
            folder: substateFolder,
            children: [
                {
                    type: 'FOLDER',
                    id: this.generateNodeId(projectContext.project),
                    name: 'elaborations',
                    folder: path.join(substateFolder, 'elaborations'),
                    children: [
                        {
                            type: 'FILE',
                            id: this.generateNodeId(projectContext.project),
                            name: '_all',
                            file: initFile
                        }
                    ]
                }
            ]
        };

        // Add to parent's children
        if (!parentNode.children) {
            parentNode.children = [];
        }
        parentNode.children.push(newNode);
        projectContext.layoutIndex.set(newNodeId, newNode);

        // Save project
        await this.saveProject(projectContext);

        vscode.window.showInformationMessage(`Created substate '${substateName}'`);

        // Open the propose file
        const doc = await vscode.workspace.openTextDocument(path.join(workspaceFolder, proposeFile));
        await vscode.window.showTextDocument(doc);

        return true;
    }

    /**
     * Add a new file to a folder
     */
    static async addFile(
        projectContext: ProjectContext,
        parentNodeId: string
    ): Promise<boolean> {
        const parentNode = projectContext.layoutIndex.get(parentNodeId);

        if (!parentNode || !hasChildren(parentNode)) {
            vscode.window.showErrorMessage('Can only add files to folder nodes');
            return false;
        }

        // Prompt for file name
        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter file name (without .soar extension)',
            placeHolder: 'e.g., utilities, helpers, common',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'File name cannot be empty';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
                    return 'File name must start with a letter and contain only letters, numbers, hyphens, and underscores';
                }
                return null;
            }
        });

        if (!fileName) {
            return false;
        }

        // Determine file path
        const workspaceFolder = path.dirname(projectContext.projectFile);
        const parentFolder = 'folder' in parentNode ? parentNode.folder : '';
        const filePath = path.join(parentFolder, `${fileName}.soar`);
        const fullPath = path.join(workspaceFolder, filePath);

        // Check if file already exists
        if (fs.existsSync(fullPath)) {
            vscode.window.showErrorMessage(`File already exists: ${filePath}`);
            return false;
        }

        // Create the file node
        const newNodeId = this.generateNodeId(projectContext.project);
        const newNode: FileNode = {
            type: 'FILE',
            id: newNodeId,
            name: fileName,
            file: filePath
        };

        // Add to parent's children
        if (!parentNode.children) {
            parentNode.children = [];
        }
        parentNode.children.push(newNode);
        projectContext.layoutIndex.set(newNodeId, newNode);

        // Generate file content
        const content = SoarTemplates.generateProductionFile(fileName);

        // Create file
        await fs.promises.writeFile(fullPath, content, 'utf-8');

        // Save project
        await this.saveProject(projectContext);

        vscode.window.showInformationMessage(`Created file '${fileName}.soar'`);

        // Open the file
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc);

        return true;
    }

    /**
     * Add a new folder
     */
    static async addFolder(
        projectContext: ProjectContext,
        parentNodeId: string
    ): Promise<boolean> {
        const parentNode = projectContext.layoutIndex.get(parentNodeId);

        if (!parentNode || !hasChildren(parentNode)) {
            vscode.window.showErrorMessage('Can only add folders to folder nodes');
            return false;
        }

        // Prompt for folder name
        const folderName = await vscode.window.showInputBox({
            prompt: 'Enter folder name',
            placeHolder: 'e.g., operators, substates, utilities',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Folder name cannot be empty';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
                    return 'Folder name must start with a letter and contain only letters, numbers, hyphens, and underscores';
                }
                return null;
            }
        });

        if (!folderName) {
            return false;
        }

        // Determine folder path
        const workspaceFolder = path.dirname(projectContext.projectFile);
        const parentFolder = 'folder' in parentNode ? parentNode.folder : '';
        const folderPath = path.join(parentFolder, folderName);
        const fullPath = path.join(workspaceFolder, folderPath);

        // Check if folder already exists
        if (fs.existsSync(fullPath)) {
            vscode.window.showErrorMessage(`Folder already exists: ${folderPath}`);
            return false;
        }

        // Create folder
        await fs.promises.mkdir(fullPath, { recursive: true });

        // Create the folder node
        const newNodeId = this.generateNodeId(projectContext.project);
        const newNode: FolderNode = {
            type: 'FOLDER',
            id: newNodeId,
            name: folderName,
            folder: folderPath,
            children: []
        };

        // Add to parent's children
        if (!parentNode.children) {
            parentNode.children = [];
        }
        parentNode.children.push(newNode);
        projectContext.layoutIndex.set(newNodeId, newNode);

        // Save project
        await this.saveProject(projectContext);

        vscode.window.showInformationMessage(`Created folder '${folderName}'`);
        return true;
    }

    /**
     * Rename a node (operator, file, or folder)
     */
    static async renameNode(
        projectContext: ProjectContext,
        nodeId: string
    ): Promise<boolean> {
        const node = projectContext.layoutIndex.get(nodeId);

        if (!node) {
            vscode.window.showErrorMessage('Node not found');
            return false;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new name',
            value: node.name,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Name cannot be empty';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
                    return 'Name must start with a letter and contain only letters, numbers, hyphens, and underscores';
                }
                return null;
            }
        });

        if (!newName || newName === node.name) {
            return false;
        }

        // Update the node name
        node.name = newName;

        // If it has a file or folder, we should also rename the physical file/folder
        // but that's complex and risky, so we'll just update the logical name for now
        vscode.window.showWarningMessage('Note: Physical file/folder not renamed. Only logical name updated.');

        await this.saveProject(projectContext);
        vscode.window.showInformationMessage(`Renamed to '${newName}'`);
        return true;
    }

    /**
     * Delete a node (operator, file, folder, or substate)
     */
    static async deleteNode(
        projectContext: ProjectContext,
        nodeId: string,
        parentNodeId: string
    ): Promise<boolean> {
        const node = projectContext.layoutIndex.get(nodeId);
        const parentNode = projectContext.layoutIndex.get(parentNodeId);

        if (!node || !parentNode || !hasChildren(parentNode)) {
            vscode.window.showErrorMessage('Cannot delete node');
            return false;
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete '${node.name}'? This will remove it from the project structure (files will not be deleted).`,
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') {
            return false;
        }

        // Remove from parent's children
        const index = parentNode.children!.findIndex((n: LayoutNode) => n.id === nodeId);
        if (index !== -1) {
            parentNode.children!.splice(index, 1);
        }

        // Remove from index recursively
        this.removeNodeRecursive(node, projectContext.layoutIndex);

        // If it's a high-level operator, also remove its datamap vertex
        if ('dmId' in node && node.dmId) {
            const dmIndex = projectContext.project.datamap.vertices.findIndex((v: any) => v.id === node.dmId);
            if (dmIndex !== -1) {
                projectContext.project.datamap.vertices.splice(dmIndex, 1);
                projectContext.datamapIndex.delete(node.dmId);
            }
        }

        await this.saveProject(projectContext);
        vscode.window.showInformationMessage(`Deleted '${node.name}' from project structure`);
        return true;
    }

    /**
     * Helper: Generate a unique node ID
     */
    private static generateNodeId(project: VisualSoarProject): string {
        const existingIds = new Set<string>();

        const collectIds = (node: LayoutNode) => {
            existingIds.add(node.id);
            if (hasChildren(node) && node.children) {
                for (const child of node.children) {
                    collectIds(child);
                }
            }
        };

        collectIds(project.layout);

        let id = 1;
        while (existingIds.has(id.toString())) {
            id++;
        }
        return id.toString();
    }

    /**
     * Helper: Generate a unique vertex ID
     */
    private static generateVertexId(project: VisualSoarProject): string {
        const existingIds = new Set(project.datamap.vertices.map((v: any) => parseInt(v.id, 10)));
        let id = 1;
        while (existingIds.has(id)) {
            id++;
        }
        return id.toString();
    }

    /**
     * Helper: Recursively remove a node and all its descendants from the index
     */
    private static removeNodeRecursive(node: LayoutNode, index: Map<string, LayoutNode>): void {
        index.delete(node.id);

        if (hasChildren(node) && node.children) {
            for (const child of node.children) {
                this.removeNodeRecursive(child, index);
            }
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
