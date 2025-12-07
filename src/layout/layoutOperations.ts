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
  hasChildren,
} from '../server/visualSoarProject';
import { SoarTemplates } from './soarTemplates';
import { SourceScriptManager } from './sourceScriptManager';

export interface DeleteResult {
  success: boolean;
  filesDeleted?: string[];
  foldersDeleted?: string[];
}

interface SourceReference {
  absolutePath: string;
  folderPath: string;
  relativePath: string;
}

export class LayoutOperations {
  /**
   * Add a new operator (simple operator, not substate)
   */
  static async addOperator(projectContext: ProjectContext, parentNodeId: string): Promise<boolean> {
    let parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode) {
      vscode.window.showErrorMessage('Parent node not found');
      return false;
    }

    // If parent is a regular OPERATOR, convert it to HIGH_LEVEL_OPERATOR first
    if (parentNode.type === 'OPERATOR') {
      const converted = await this.convertOperatorToHighLevel(projectContext, parentNodeId);
      if (!converted) {
        return false;
      }
      // Re-fetch the parent node after conversion
      parentNode = projectContext.layoutIndex.get(parentNodeId);
      if (!parentNode) {
        vscode.window.showErrorMessage('Failed to convert operator to high-level operator');
        return false;
      }
    }

    if (!hasChildren(parentNode)) {
      vscode.window.showErrorMessage('Can only add operators to folder nodes');
      return false;
    }

    // Prompt for operator name
    const operatorName = await vscode.window.showInputBox({
      prompt: 'Enter operator name',
      placeHolder: 'e.g., initialize, move-forward, attack',
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'Operator name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return 'Operator name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        return null;
      },
    });

    if (!operatorName) {
      return false;
    }

    // Determine the parent state context (root or substate)
    const stateContext = this.findParentStateContext(projectContext, parentNodeId);

    // Create operator datamap vertex and add to parent state
    const operatorDmId = this.addOperatorToDatamap(
      projectContext,
      stateContext.datamapId,
      operatorName
    );
    if (!operatorDmId) {
      vscode.window.showWarningMessage(
        `Could not add operator '${operatorName}' to datamap. Continuing with file creation.`
      );
    }

    // Determine file path
    // File should be stored relative to the parent node's folder
    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    const operatorFile = `${operatorName}.soar`; // Just the filename, relative to parent
    const fullPath = path.join(workspaceFolder, parentFolderPath, operatorFile);

    // Check if file already exists
    if (fs.existsSync(fullPath)) {
      vscode.window.showErrorMessage(`File already exists: ${operatorFile}`);
      return false;
    }

    // Create the operator node with dmId
    const newNodeId = this.generateNodeId(projectContext.project);
    const newNode: OperatorNode = {
      type: 'OPERATOR',
      id: newNodeId,
      name: operatorName,
      file: operatorFile,
      dmId: operatorDmId,
    };

    // Add to parent's children
    if (!parentNode.children) {
      parentNode.children = [];
    }
    parentNode.children.push(newNode);
    projectContext.layoutIndex.set(newNodeId, newNode);

    // Generate file content with proper state name
    const content = SoarTemplates.generateOperatorFile(operatorName, stateContext.stateName);

    // Create file
    await fs.promises.writeFile(fullPath, content, 'utf-8');

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, operatorFile);

    // Save project
    await this.saveProject(projectContext);

    vscode.window.showInformationMessage(`Created operator '${operatorName}'`);

    // Open the file
    const doc = await vscode.workspace.openTextDocument(fullPath);
    await vscode.window.showTextDocument(doc);

    return true;
  }

  /**
   * Add a new file to a folder
   */
  static async addFile(
    projectContext: ProjectContext,
    parentNodeId: string,
    parentNodeOverride?: LayoutNode,
    folderPathOverride?: string
  ): Promise<boolean> {
    const parentNode = parentNodeOverride ?? projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode || !hasChildren(parentNode)) {
      vscode.window.showErrorMessage('Can only add files to folder nodes');
      return false;
    }

    // Prompt for file name
    const fileName = await vscode.window.showInputBox({
      prompt: 'Enter file name (without .soar extension)',
      placeHolder: 'e.g., utilities, helpers, common',
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'File name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return 'File name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        return null;
      },
    });

    if (!fileName) {
      return false;
    }

    // Determine file path (relative to parent)
    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath =
      folderPathOverride ?? this.getNodeFolderPath(projectContext, parentNodeId, parentNode);
    const filePath = `${fileName}.soar`; // Just the filename, relative to parent
    const fullPath = path.join(workspaceFolder, parentFolderPath, filePath);

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
      file: filePath, // Relative to parent
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

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, filePath);

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
  static async addFolder(projectContext: ProjectContext, parentNodeId: string): Promise<boolean> {
    const parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode || !hasChildren(parentNode)) {
      vscode.window.showErrorMessage('Can only add folders to folder nodes');
      return false;
    }

    // Prompt for folder name
    const folderName = await vscode.window.showInputBox({
      prompt: 'Enter folder name',
      placeHolder: 'e.g., operators, substates, utilities',
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'Folder name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return 'Folder name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        return null;
      },
    });

    if (!folderName) {
      return false;
    }

    // Determine folder path (relative to parent)
    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    const folderPath = folderName; // Just the folder name, relative to parent
    const fullPath = path.join(workspaceFolder, parentFolderPath, folderPath);

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
      folder: folderPath, // Relative to parent
      children: [],
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
  static async renameNode(projectContext: ProjectContext, nodeId: string): Promise<boolean> {
    const node = projectContext.layoutIndex.get(nodeId);

    if (!node) {
      vscode.window.showErrorMessage('Node not found');
      return false;
    }

    const newName = await vscode.window.showInputBox({
      prompt: 'Enter new name',
      value: node.name,
      validateInput: value => {
        if (!value || value.trim().length === 0) {
          return 'Name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return 'Name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        return null;
      },
    });

    if (!newName || newName === node.name) {
      return false;
    }

    // Update the node name
    node.name = newName;

    // If it has a file or folder, we should also rename the physical file/folder
    // but that's complex and risky, so we'll just update the logical name for now
    vscode.window.showWarningMessage(
      'Note: Physical file/folder not renamed. Only logical name updated.'
    );

    await this.saveProject(projectContext);
    vscode.window.showInformationMessage(`Renamed to '${newName}'`);
    return true;
  }

  /**
   * Delete a node (operator, file, folder, or substate)
   * @param skipConfirmation - If true, skips the UI confirmation dialog (useful for testing)
   * @returns boolean for success when called with confirmation, or DeleteResult object when skipConfirmation is true
   */
  static async deleteNode(
    projectContext: ProjectContext,
    nodeId: string,
    parentNodeId: string,
    skipConfirmation: boolean = false
  ): Promise<boolean | DeleteResult> {
    const node = projectContext.layoutIndex.get(nodeId);
    const parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!node || !parentNode || !hasChildren(parentNode)) {
      if (skipConfirmation) {
        return { success: false };
      }
      vscode.window.showErrorMessage('Cannot delete node');
      return false;
    }

    // Collect all files and folders that will be deleted
    const workspaceFolder = path.dirname(projectContext.projectFile);
    const filesToDelete: string[] = [];
    const foldersToDelete: string[] = [];
    const sourceReferences: SourceReference[] = [];

    // Get the parent's folder path to properly resolve file paths
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    this.collectFilesAndFolders(
      node,
      workspaceFolder,
      filesToDelete,
      foldersToDelete,
      parentFolderPath,
      sourceReferences
    );

    const sourceReferenceMap = new Map<string, SourceReference>();
    for (const reference of sourceReferences) {
      sourceReferenceMap.set(path.normalize(reference.absolutePath), reference);
    }

    // Show confirmation dialog unless skipped
    if (!skipConfirmation) {
      let message = `Are you sure you want to delete '${node.name}'?\n\n`;
      message += 'This will delete from the project structure AND the file system:\n';
      if (filesToDelete.length > 0) {
        message += `- ${filesToDelete.length} file(s)\n`;
      }
      if (foldersToDelete.length > 0) {
        message += `- ${foldersToDelete.length} folder(s)\n`;
      }

      const confirm = await vscode.window.showWarningMessage(message, { modal: true }, 'Delete');
      if (confirm !== 'Delete') {
        return false;
      }
    }

    // Delete files first
    for (const file of filesToDelete) {
      const normalizedFile = path.normalize(file);
      const reference = sourceReferenceMap.get(normalizedFile);
      let removedOrMissing = false;
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file);
        }
        removedOrMissing = true;
      } catch (error: any) {
        console.error(`Failed to delete file ${file}:`, error);
        if (skipConfirmation) {
          return { success: false };
        }
      }

      if (removedOrMissing && reference) {
        await SourceScriptManager.removeReference(reference.folderPath, reference.relativePath);
        sourceReferenceMap.delete(normalizedFile);
      }
    }

    // Delete folders (in reverse order to delete children first)
    for (let i = foldersToDelete.length - 1; i >= 0; i--) {
      try {
        if (fs.existsSync(foldersToDelete[i])) {
          await fs.promises.rmdir(foldersToDelete[i]);
        }
      } catch (error: any) {
        console.error(`Failed to delete folder ${foldersToDelete[i]}:`, error);
        if (skipConfirmation) {
          return { success: false };
        }
      }
    }

    // Remove from parent's children
    const index = parentNode.children!.findIndex((n: LayoutNode) => n.id === nodeId);
    if (index !== -1) {
      parentNode.children!.splice(index, 1);
    }

    // Remove from index recursively
    this.removeNodeRecursive(node, projectContext.layoutIndex);

    // Clean up datamap entries for operators
    if (node.type === 'OPERATOR' || node.type === 'HIGH_LEVEL_OPERATOR') {
      // Remove operator vertex and its name enumeration from parent state's datamap
      this.removeOperatorFromDatamap(projectContext, parentNode, node.name);

      // If it's a high-level operator, recursively remove its entire substate datamap
      if ('dmId' in node && node.dmId) {
        this.removeSubstateDatamap(projectContext, node.dmId);
      }
    }

    await this.saveProject(projectContext);

    if (skipConfirmation) {
      return {
        success: true,
        filesDeleted: filesToDelete,
        foldersDeleted: foldersToDelete,
      };
    }

    vscode.window.showInformationMessage(
      `Deleted '${node.name}' from project structure and file system`
    );
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
   * Helper: Collect all files and folders associated with a node and its children
   */
  private static collectFilesAndFolders(
    node: LayoutNode,
    workspaceFolder: string,
    files: string[],
    folders: string[],
    parentFolderPath: string = '',
    sourceRefs?: SourceReference[]
  ): void {
    // Determine the current folder path for this node
    let currentFolderPath = parentFolderPath;
    if ('folder' in node && node.folder) {
      currentFolderPath = parentFolderPath ? path.join(parentFolderPath, node.folder) : node.folder;
    }

    // Add this node's file if it has one
    if ('file' in node && node.file) {
      const fullPath = path.join(workspaceFolder, currentFolderPath, node.file);
      files.push(fullPath);

      if (sourceRefs && node.file.toLowerCase().endsWith('.soar')) {
        const folderAbsolute = this.resolveFolderAbsolute(workspaceFolder, currentFolderPath);
        sourceRefs.push({
          absolutePath: fullPath,
          folderPath: folderAbsolute,
          relativePath: node.file,
        });
      }
    }

    // Add this node's folder if it has one (and it's a HIGH_LEVEL_OPERATOR)
    if ('folder' in node && node.folder && node.type === 'HIGH_LEVEL_OPERATOR') {
      const fullPath = path.join(workspaceFolder, currentFolderPath);
      folders.push(fullPath);

      // Add the source file which is not in the layout tree
      const sourceFile = path.join(fullPath, `${node.name}_source.soar`);
      files.push(sourceFile);
    }

    // For regular FOLDER nodes, collect its folder path
    if (node.type === 'FOLDER' && 'folder' in node && node.folder) {
      const fullPath = path.join(workspaceFolder, currentFolderPath);
      folders.push(fullPath);
    }

    // Recursively collect from children
    if (hasChildren(node) && node.children) {
      for (const child of node.children) {
        this.collectFilesAndFolders(
          child,
          workspaceFolder,
          files,
          folders,
          currentFolderPath,
          sourceRefs
        );
      }
    }
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
   * Convert a regular OPERATOR to a HIGH_LEVEL_OPERATOR
   * Creates folder structure and moves the operator file
   */
  private static async convertOperatorToHighLevel(
    projectContext: ProjectContext,
    operatorNodeId: string
  ): Promise<boolean> {
    const operatorNode = projectContext.layoutIndex.get(operatorNodeId);

    if (!operatorNode || operatorNode.type !== 'OPERATOR') {
      return false;
    }

    const workspaceFolder = path.dirname(projectContext.projectFile);
    const operatorName = operatorNode.name;

    // Get the parent folder path to know where to create the new folder
    const parentId = this.findParentId(projectContext, operatorNodeId);
    if (!parentId) {
      vscode.window.showErrorMessage('Cannot find parent node');
      return false;
    }
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentId);
    const oldFile = operatorNode.file; // This is relative to parent
    const oldFullPath = path.join(workspaceFolder, parentFolderPath, oldFile);

    // New folder and file paths (relative to parent)
    const newFolderRelative = operatorName; // Just the folder name
    const newFullFolderPath = path.join(workspaceFolder, parentFolderPath, newFolderRelative);

    // Check if folder already exists
    if (fs.existsSync(newFullFolderPath)) {
      vscode.window.showErrorMessage(`Folder already exists: ${newFolderRelative}`);
      return false;
    }

    // Create folder structure
    await fs.promises.mkdir(newFullFolderPath, { recursive: true });

    // Move the operator file to the new folder location
    const newFile = `${operatorName}.soar`; // Relative to the new folder
    const newFullPath = path.join(newFullFolderPath, newFile);

    if (fs.existsSync(oldFullPath)) {
      await fs.promises.rename(oldFullPath, newFullPath);
    }

    // Create elaborations file (matching VisualSoar's behavior)
    const elabFile = 'elaborations.soar'; // Relative to the operator folder
    const elabContent = ''; // Empty file like VisualSoar
    await fs.promises.writeFile(path.join(newFullFolderPath, elabFile), elabContent, 'utf-8');

    // Create source file for loading
    const sourceFile = `${operatorName}_source.soar`;
    const sourceContent = `source elaborations.soar\n`;
    await fs.promises.writeFile(path.join(newFullFolderPath, sourceFile), sourceContent, 'utf-8');

    // Create or reuse datamap vertex for this operator
    let dmId = 'dmId' in operatorNode ? operatorNode.dmId : undefined;
    let dmVertex: any;

    if (!dmId) {
      // If no dmId exists, create a new datamap vertex
      dmId = this.generateVertexId(projectContext.project);
      dmVertex = {
        id: dmId,
        type: 'SOAR_ID',
        outEdges: [],
      };
      projectContext.project.datamap.vertices.push(dmVertex);
      projectContext.datamapIndex.set(dmId, dmVertex);
    } else {
      dmVertex = projectContext.datamapIndex.get(dmId);
    }

    // Ensure the datamap has complete substate structure
    if (dmVertex && dmVertex.type === 'SOAR_ID') {
      if (!dmVertex.outEdges) {
        dmVertex.outEdges = [];
      }

      // Helper to check if edge exists
      const hasEdge = (name: string) => dmVertex.outEdges?.some((e: any) => e.name === name);

      // Add ^name edge
      if (!hasEdge('name')) {
        const nameEnumId = this.generateVertexId(projectContext.project);
        const nameEnum: any = {
          id: nameEnumId,
          type: 'ENUMERATION',
          choices: [operatorName],
        };
        projectContext.project.datamap.vertices.push(nameEnum);
        projectContext.datamapIndex.set(nameEnumId, nameEnum);
        dmVertex.outEdges.push({ name: 'name', toId: nameEnumId });
      }

      // Add ^type state
      if (!hasEdge('type')) {
        let stateEnumVertex = projectContext.project.datamap.vertices.find(
          (v: any) =>
            v.type === 'ENUMERATION' && v.choices?.length === 1 && v.choices[0] === 'state'
        );
        if (!stateEnumVertex) {
          const stateEnumId = this.generateVertexId(projectContext.project);
          stateEnumVertex = {
            id: stateEnumId,
            type: 'ENUMERATION',
            choices: ['state'],
          };
          projectContext.project.datamap.vertices.push(stateEnumVertex);
          projectContext.datamapIndex.set(stateEnumId, stateEnumVertex);
        }
        dmVertex.outEdges.push({ name: 'type', toId: stateEnumVertex.id });
      }

      // Add ^superstate pointing to root
      if (!hasEdge('superstate')) {
        const rootId = projectContext.project.datamap.rootId;
        dmVertex.outEdges.push({ name: 'superstate', toId: rootId });
      }

      // Add ^top-state pointing to root
      if (!hasEdge('top-state')) {
        const rootId = projectContext.project.datamap.rootId;
        dmVertex.outEdges.push({ name: 'top-state', toId: rootId });
      }
    }

    // Convert to HIGH_LEVEL_OPERATOR (matching VisualSoar's structure)
    // All paths are relative to the parent
    const highLevelNode: HighLevelOperatorNode = {
      type: 'HIGH_LEVEL_OPERATOR',
      id: operatorNode.id,
      name: operatorName,
      file: newFile, // Relative to parent: operator-name.soar
      dmId: dmId!,
      folder: newFolderRelative, // Relative to parent: operator-name/
      children: [
        {
          type: 'FILE_OPERATOR',
          id: this.generateNodeId(projectContext.project),
          name: 'elaborations',
          file: elabFile, // Relative to this node's folder: elaborations.soar
        },
      ],
    };

    // Replace the node in the parent's children
    const parent = this.findParentNode(projectContext.project.layout, operatorNodeId);
    if (parent && hasChildren(parent) && parent.children) {
      const index = parent.children.findIndex((n: LayoutNode) => n.id === operatorNodeId);
      if (index !== -1) {
        parent.children[index] = highLevelNode;
      }
    }

    // Update in the index
    projectContext.layoutIndex.set(operatorNodeId, highLevelNode);

    // Save project
    await this.saveProject(projectContext);

    vscode.window.showInformationMessage(`Converted '${operatorName}' to high-level operator`);
    return true;
  }

  /**
   * Helper: Find the parent state context for adding an operator
   * Traverses up the layout tree to find the nearest HIGH_LEVEL_OPERATOR or root
   */
  private static findParentStateContext(
    projectContext: ProjectContext,
    nodeId: string
  ): { stateName: string; datamapId: string } {
    let currentNodeId = nodeId;
    let currentNode = projectContext.layoutIndex.get(currentNodeId);

    // Traverse up the tree to find a HIGH_LEVEL_OPERATOR or root
    while (currentNode) {
      if (currentNode.type === 'HIGH_LEVEL_OPERATOR' && 'dmId' in currentNode && currentNode.dmId) {
        // We're in a substate - use the substate's name and datamap ID
        return {
          stateName: currentNode.name,
          datamapId: currentNode.dmId,
        };
      }

      // Try to find parent by searching the entire layout tree
      const parent = this.findParentNode(projectContext.project.layout, currentNodeId);
      if (!parent) {
        break;
      }
      currentNodeId = parent.id;
      currentNode = parent;
    }

    // Default to root state
    return {
      stateName: projectContext.project.layout.name || 'root',
      datamapId: projectContext.project.datamap.rootId,
    };
  }

  /**
   * Helper: Find the parent node of a given node ID
   */
  private static findParentNode(node: LayoutNode, targetId: string): LayoutNode | null {
    if (hasChildren(node) && node.children) {
      for (const child of node.children) {
        if (child.id === targetId) {
          return node;
        }
        const found = this.findParentNode(child, targetId);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /**
   * Add a file programmatically (for testing)
   */
  static async addFileProgrammatic(
    projectContext: ProjectContext,
    parentNodeId: string,
    fileName: string
  ): Promise<{ success: boolean; nodeId?: string }> {
    const parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode || !hasChildren(parentNode)) {
      return { success: false };
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(fileName)) {
      return { success: false };
    }

    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    const filePath = `${fileName}.soar`;
    const fullPath = path.join(workspaceFolder, parentFolderPath, filePath);

    if (fs.existsSync(fullPath)) {
      return { success: false };
    }

    const newNodeId = this.generateNodeId(projectContext.project);
    const newNode: FileNode = {
      type: 'FILE',
      id: newNodeId,
      name: fileName,
      file: filePath,
    };

    if (!parentNode.children) {
      parentNode.children = [];
    }
    parentNode.children.push(newNode);
    projectContext.layoutIndex.set(newNodeId, newNode);

    const content = SoarTemplates.generateProductionFile(fileName);
    await fs.promises.writeFile(fullPath, content, 'utf-8');

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, filePath);

    await this.saveProject(projectContext);

    return { success: true, nodeId: newNodeId };
  }

  /**
   * Add an operator programmatically (for testing)
   * Same as addOperator but takes operatorName as parameter instead of prompting
   */
  static async addOperatorProgrammatic(
    projectContext: ProjectContext,
    parentNodeId: string,
    operatorName: string
  ): Promise<{ success: boolean; nodeId?: string }> {
    let parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode) {
      return { success: false };
    }

    // If parent is a regular OPERATOR, convert it to HIGH_LEVEL_OPERATOR first
    if (parentNode.type === 'OPERATOR') {
      const converted = await this.convertOperatorToHighLevel(projectContext, parentNodeId);
      if (!converted) {
        return { success: false };
      }
      // Re-fetch the parent node after conversion
      parentNode = projectContext.layoutIndex.get(parentNodeId);
      if (!parentNode) {
        return { success: false };
      }
    }

    if (!hasChildren(parentNode)) {
      return { success: false };
    }

    // Determine the parent state context (root or substate)
    const stateContext = this.findParentStateContext(projectContext, parentNodeId);

    // Create operator datamap vertex and add to parent state
    const operatorDmId = this.addOperatorToDatamap(
      projectContext,
      stateContext.datamapId,
      operatorName
    );

    // Determine file path
    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    const operatorFile = `${operatorName}.soar`;
    const fullPath = path.join(workspaceFolder, parentFolderPath, operatorFile);

    // Check if file already exists
    if (fs.existsSync(fullPath)) {
      return { success: false };
    }

    // Create the operator node with dmId
    const newNodeId = this.generateNodeId(projectContext.project);
    const newNode: OperatorNode = {
      type: 'OPERATOR',
      id: newNodeId,
      name: operatorName,
      file: operatorFile,
      dmId: operatorDmId,
    };

    // Add to parent's children
    if (!parentNode.children) {
      parentNode.children = [];
    }
    parentNode.children.push(newNode);
    projectContext.layoutIndex.set(newNodeId, newNode);

    // Generate file content with proper state name
    const content = SoarTemplates.generateOperatorFile(operatorName, stateContext.stateName);

    // Create file
    await fs.promises.writeFile(fullPath, content, 'utf-8');

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, operatorFile);

    // Save project
    await this.saveProject(projectContext);

    return { success: true, nodeId: newNodeId };
  }

  /**
   * Helper: Add an operator to the datamap
   * Creates a new operator vertex with ^name enumeration and adds ^operator edge from parent state
   * Returns the operator vertex ID
   */
  private static addOperatorToDatamap(
    projectContext: ProjectContext,
    stateVertexId: string,
    operatorName: string
  ): string | undefined {
    const stateVertex = projectContext.datamapIndex.get(stateVertexId);
    if (!stateVertex || stateVertex.type !== 'SOAR_ID') {
      return undefined;
    }

    // Check if an operator with this name already exists in this state
    if (stateVertex.outEdges) {
      for (const edge of stateVertex.outEdges) {
        if (edge.name === 'operator') {
          const existingOpVertex = projectContext.datamapIndex.get(edge.toId);
          if (
            existingOpVertex &&
            existingOpVertex.type === 'SOAR_ID' &&
            existingOpVertex.outEdges
          ) {
            const nameEdge = existingOpVertex.outEdges.find((e: any) => e.name === 'name');
            if (nameEdge) {
              const nameVertex = projectContext.datamapIndex.get(nameEdge.toId);
              if (
                nameVertex &&
                nameVertex.type === 'ENUMERATION' &&
                nameVertex.choices?.includes(operatorName)
              ) {
                // Operator with this name already exists, return its ID
                return existingOpVertex.id;
              }
            }
          }
        }
      }
    }

    // Create operator vertex (SOAR_ID)
    const operatorVertexId = this.generateVertexId(projectContext.project);
    const operatorVertex: any = {
      id: operatorVertexId,
      type: 'SOAR_ID',
      outEdges: [],
    };
    projectContext.project.datamap.vertices.push(operatorVertex);
    projectContext.datamapIndex.set(operatorVertexId, operatorVertex);

    // Create name enumeration vertex for this operator
    const nameVertexId = this.generateVertexId(projectContext.project);
    const nameVertex: any = {
      id: nameVertexId,
      type: 'ENUMERATION',
      choices: [operatorName],
    };
    projectContext.project.datamap.vertices.push(nameVertex);
    projectContext.datamapIndex.set(nameVertexId, nameVertex);

    // Add ^name edge from operator vertex to name enumeration
    operatorVertex.outEdges.push({
      name: 'name',
      toId: nameVertexId,
    });

    // Add ^operator edge from state vertex to operator vertex
    // Check if this exact edge already exists to prevent duplicates
    if (!stateVertex.outEdges) {
      stateVertex.outEdges = [];
    }

    const edgeExists = stateVertex.outEdges.some(
      (edge: any) => edge.name === 'operator' && edge.toId === operatorVertexId
    );

    if (!edgeExists) {
      stateVertex.outEdges.push({
        name: 'operator',
        toId: operatorVertexId,
      });
    }

    return operatorVertexId;
  }

  /**
   * Helper: Remove an operator and its name enumeration from the datamap
   * Finds the operator vertex by name in the parent state and removes it along with its name vertex
   */
  private static removeOperatorFromDatamap(
    projectContext: ProjectContext,
    parentNode: LayoutNode,
    operatorName: string
  ): void {
    // Get the parent state's datamap vertex ID
    let stateVertexId: string;

    if (parentNode.type === 'OPERATOR_ROOT') {
      // For root operators, use the root state
      stateVertexId = projectContext.project.datamap.rootId;
    } else if (
      parentNode.type === 'HIGH_LEVEL_OPERATOR' &&
      'dmId' in parentNode &&
      parentNode.dmId
    ) {
      // For operators under a high-level operator, use its substate
      stateVertexId = parentNode.dmId;
    } else {
      // Can't determine state vertex
      return;
    }

    const stateVertex = projectContext.datamapIndex.get(stateVertexId);
    if (!stateVertex || stateVertex.type !== 'SOAR_ID' || !stateVertex.outEdges) {
      return;
    }

    // Find the operator vertex with this name
    let operatorVertexId: string | null = null;
    let nameVertexId: string | null = null;

    for (const edge of stateVertex.outEdges) {
      if (edge.name === 'operator') {
        const opVertex = projectContext.datamapIndex.get(edge.toId);
        if (opVertex && opVertex.type === 'SOAR_ID' && opVertex.outEdges) {
          const nameEdge = opVertex.outEdges.find((e: any) => e.name === 'name');
          if (nameEdge) {
            const nameVertex = projectContext.datamapIndex.get(nameEdge.toId);
            if (
              nameVertex &&
              nameVertex.type === 'ENUMERATION' &&
              nameVertex.choices?.includes(operatorName) &&
              nameVertex.choices.length === 1 // Only remove if this is the only choice
            ) {
              operatorVertexId = edge.toId;
              nameVertexId = nameEdge.toId;
              break;
            }
          }
        }
      }
    }

    if (!operatorVertexId || !nameVertexId) {
      return; // Operator not found or shared with other operators
    }

    // Remove the ^operator edge from state to operator vertex
    const edgeIndex = stateVertex.outEdges.findIndex(
      (e: any) => e.name === 'operator' && e.toId === operatorVertexId
    );
    if (edgeIndex !== -1) {
      stateVertex.outEdges.splice(edgeIndex, 1);
    }

    // Remove the name vertex from datamap
    const nameIndex = projectContext.project.datamap.vertices.findIndex(
      (v: any) => v.id === nameVertexId
    );
    if (nameIndex !== -1) {
      projectContext.project.datamap.vertices.splice(nameIndex, 1);
      projectContext.datamapIndex.delete(nameVertexId);
    }

    // Remove the operator vertex from datamap
    const opIndex = projectContext.project.datamap.vertices.findIndex(
      (v: any) => v.id === operatorVertexId
    );
    if (opIndex !== -1) {
      projectContext.project.datamap.vertices.splice(opIndex, 1);
      projectContext.datamapIndex.delete(operatorVertexId);
    }
  }

  /**
   * Helper: Recursively remove a substate's datamap vertex and all connected vertices
   */
  private static removeSubstateDatamap(
    projectContext: ProjectContext,
    substateVertexId: string
  ): void {
    const substateVertex = projectContext.datamapIndex.get(substateVertexId);
    if (!substateVertex || substateVertex.type !== 'SOAR_ID') {
      return;
    }

    const verticesToRemove = new Set<string>();
    verticesToRemove.add(substateVertexId);

    // Recursively collect all vertices reachable from this substate
    // Only collect vertices that are uniquely owned by this substate (not shared enums)
    const collectReachableVertices = (vertexId: string, isRoot: boolean = true) => {
      const vertex = projectContext.datamapIndex.get(vertexId);
      if (!vertex || verticesToRemove.has(vertexId)) {
        return;
      }

      verticesToRemove.add(vertexId);

      // For SOAR_ID vertices, traverse outgoing edges
      if (vertex.type === 'SOAR_ID' && (vertex as any).outEdges) {
        for (const edge of (vertex as any).outEdges) {
          // Don't follow superstate or top-state edges (they point to parent/root)
          // Also don't follow type edges (shared enum like 'state')
          if (edge.name !== 'superstate' && edge.name !== 'top-state' && edge.name !== 'type') {
            collectReachableVertices(edge.toId, false);
          }
        }
      }
      // For ENUMERATION vertices, only include if we're not at root level
      // Root-level enums like 'state' type are shared and shouldn't be deleted
      else if (vertex.type === 'ENUMERATION' && !isRoot) {
        // This enumeration is uniquely owned by a SOAR_ID, keep it
      }
    };

    collectReachableVertices(substateVertexId);

    // Remove all collected vertices
    for (const vertexId of verticesToRemove) {
      const index = projectContext.project.datamap.vertices.findIndex(
        (v: any) => v.id === vertexId
      );
      if (index !== -1) {
        projectContext.project.datamap.vertices.splice(index, 1);
        projectContext.datamapIndex.delete(vertexId);
      }
    }
  }

  /**
   * Helper: Get the full folder path for a node by traversing up to the root
   */
  private static getNodeFolderPath(
    projectContext: ProjectContext,
    nodeId: string,
    nodeOverride?: LayoutNode
  ): string {
    const pathParts: string[] = [];
    let currentId: string | null = nodeId;
    let currentNode: LayoutNode | undefined =
      nodeOverride ?? projectContext.layoutIndex.get(nodeId);

    while (currentId && currentNode) {
      const node = currentNode;

      // Add this node's folder to the path
      if ('folder' in node && node.folder) {
        pathParts.unshift(node.folder);
      }

      // Move to parent
      const parentId = this.findParentId(projectContext, currentId);
      currentId = parentId;
      currentNode = parentId ? projectContext.layoutIndex.get(parentId) : undefined;
    }

    return path.join(...pathParts);
  }

  /**
   * Helper: Resolve an absolute folder path from workspace + relative folder segments
   */
  private static resolveFolderAbsolute(
    workspaceFolder: string,
    relativeFolderPath: string
  ): string {
    if (!relativeFolderPath) {
      return workspaceFolder;
    }
    return path.join(workspaceFolder, relativeFolderPath);
  }

  /**
   * Helper: Find the parent ID of a node
   */
  private static findParentId(projectContext: ProjectContext, nodeId: string): string | null {
    const findParent = (
      node: LayoutNode,
      targetId: string,
      parentId: string | null = null
    ): string | null => {
      if (node.id === targetId) {
        return parentId;
      }
      if (hasChildren(node) && node.children) {
        for (const child of node.children) {
          const found = findParent(child, targetId, node.id);
          if (found !== null) {
            return found;
          }
        }
      }
      return null;
    };

    return findParent(projectContext.project.layout, nodeId, null);
  }

  /**
   * Helper: Save project to file
   */
  private static async saveProject(projectContext: ProjectContext): Promise<void> {
    const json = JSON.stringify(projectContext.project, null, 2);
    await fs.promises.writeFile(projectContext.projectFile, json, 'utf-8');
  }
}
