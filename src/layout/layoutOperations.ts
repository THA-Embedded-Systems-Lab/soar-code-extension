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
  ImpasseOperatorNode,
  HighLevelImpasseOperatorNode,
  ImpasseName,
  FileNode,
  FolderNode,
  hasChildren,
  DMVertex,
} from '../server/visualSoarProject';
import { SoarTemplates } from './soarTemplates';
import { SourceScriptManager } from './sourceScriptManager';
import { UndoManager, getUndoManager } from './undoManager';

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
   * Rename a node (operator, file, or folder)
   */
  static async renameNode(
    projectContext: ProjectContext,
    nodeId: string,
    reloadCallback?: () => Promise<void>
  ): Promise<boolean> {
    const undoManager = reloadCallback ? getUndoManager() : null;
    const beforeSnapshot = undoManager ? await UndoManager.captureSnapshot(projectContext) : null;

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

    // Capture undo operation if callback provided
    if (undoManager && beforeSnapshot && reloadCallback) {
      const afterSnapshot = await UndoManager.captureSnapshot(projectContext);
      const operation = UndoManager.createSnapshotOperation(
        'Rename Node',
        projectContext,
        beforeSnapshot,
        afterSnapshot,
        reloadCallback
      );
      undoManager.pushOperation(operation);
    }

    return true;
  }

  /**
   * Delete a node (operator, file, folder, or substate)
   * @param skipConfirmation - If true, skips the UI confirmation dialog (useful for testing)
   * @param reloadCallback - Optional callback to reload the project after deletion (enables undo)
   * @returns boolean for success when called with confirmation, or DeleteResult object when skipConfirmation is true
   */
  static async deleteNode(
    projectContext: ProjectContext,
    nodeId: string,
    parentNodeId: string,
    skipConfirmation: boolean = false,
    reloadCallback?: () => Promise<void>
  ): Promise<boolean | DeleteResult> {
    const undoManager = reloadCallback ? getUndoManager() : null;
    const beforeSnapshot = undoManager ? await UndoManager.captureSnapshot(projectContext) : null;

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

    // Capture undo operation if callback provided
    if (undoManager && beforeSnapshot && reloadCallback) {
      const afterSnapshot = await UndoManager.captureSnapshot(projectContext);
      const nodeName = node ? node.name : 'Node';
      const operation = UndoManager.createSnapshotOperation(
        `Delete ${nodeName}`,
        projectContext,
        beforeSnapshot,
        afterSnapshot,
        reloadCallback
      );
      undoManager.pushOperation(operation);
    }

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

  private static generateVertexId(project: VisualSoarProject): string {
    // Generate a unique hex ID matching VisualSoar/ProjectCreator format
    // Keep generating until we get a unique one (collision is extremely unlikely with hex IDs)
    const crypto = require('crypto');
    let id: string;
    const existingIds = new Set(project.datamap.vertices.map((v: any) => v.id));

    do {
      id = crypto.randomBytes(16).toString('hex');
    } while (existingIds.has(id));

    return id;
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
      // For HIGH_LEVEL_OPERATOR and HIGH_LEVEL_IMPASSE_OPERATOR, the file stays at parent level
      const fileFolder =
        node.type === 'HIGH_LEVEL_OPERATOR' || node.type === 'HIGH_LEVEL_IMPASSE_OPERATOR'
          ? parentFolderPath
          : currentFolderPath;
      const fullPath = path.join(workspaceFolder, fileFolder, node.file);
      files.push(fullPath);

      if (sourceRefs && node.file.toLowerCase().endsWith('.soar')) {
        const folderAbsolute = this.resolveFolderAbsolute(workspaceFolder, fileFolder);
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

    // Add folder for HIGH_LEVEL_IMPASSE_OPERATOR
    if ('folder' in node && node.folder && node.type === 'HIGH_LEVEL_IMPASSE_OPERATOR') {
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
      if (vscode.window) {
        vscode.window.showErrorMessage('Cannot find parent node');
      }
      return false;
    }
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentId);
    const oldFile = operatorNode.file; // This is relative to parent

    // New folder path (relative to parent)
    const newFolderRelative = operatorName; // Just the folder name
    const newFullFolderPath = path.join(workspaceFolder, parentFolderPath, newFolderRelative);

    // Check if folder already exists
    if (fs.existsSync(newFullFolderPath)) {
      if (vscode.window) {
        vscode.window.showErrorMessage(`Folder already exists: ${newFolderRelative}`);
      }
      return false;
    }

    // Create folder structure
    await fs.promises.mkdir(newFullFolderPath, { recursive: true });

    // DO NOT move the original operator file - it stays at the parent level
    // The original file contains propose/apply rules that fire on the parent state
    // The folder contains substate-specific files

    // Update source references:
    // Remove reference to the plain .soar file
    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.removeReference(parentFolderAbsolute, oldFile);

    // Add reference to the operator file (keep it) AND the _source file in the folder
    await SourceScriptManager.appendReference(parentFolderAbsolute, oldFile);
    const newSourceReference = path.join(newFolderRelative, `${operatorName}_source.soar`);
    await SourceScriptManager.appendReference(parentFolderAbsolute, newSourceReference);

    // Create elaborations file (matching VisualSoar's behavior)
    const elabFile = 'elaborations.soar'; // Relative to the operator folder
    const elabContent = ''; // Empty file like VisualSoar
    await fs.promises.writeFile(path.join(newFullFolderPath, elabFile), elabContent, 'utf-8');

    // Create source file for loading
    const sourceFile = `${operatorName}_source.soar`;
    const sourceContent = `source elaborations.soar\n`;
    await fs.promises.writeFile(path.join(newFullFolderPath, sourceFile), sourceContent, 'utf-8');

    // Create a NEW datamap vertex for the substate (don't reuse the operator's dmId)
    // The operator vertex stays connected to the parent state via ^operator edge
    // The substate vertex is the state that is selected when the operator applies
    const dmId = this.generateVertexId(projectContext.project);
    const dmVertex: any = {
      id: dmId,
      type: 'SOAR_ID',
      outEdges: [],
    };
    projectContext.project.datamap.vertices.push(dmVertex);
    projectContext.datamapIndex.set(dmId, dmVertex);

    // Ensure the datamap has complete substate structure
    if (!dmVertex.outEdges) {
      dmVertex.outEdges = [];
    }

    // Helper to check if edge exists
    const hasEdge = (name: string) => dmVertex.outEdges?.some((e: any) => e.name === name);

    // Add ^name edge (create new enumeration for each state/operator)
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

    // Add ^type state (create new enumeration for each state, don't reuse)
    if (!hasEdge('type')) {
      const stateEnumId = this.generateVertexId(projectContext.project);
      const stateEnumVertex: any = {
        id: stateEnumId,
        type: 'ENUMERATION',
        choices: ['state'],
      };
      projectContext.project.datamap.vertices.push(stateEnumVertex);
      projectContext.datamapIndex.set(stateEnumId, stateEnumVertex);
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

    // Add ^impasse
    if (!hasEdge('impasse')) {
      const impasseEnumId = this.generateVertexId(projectContext.project);
      const impasseEnum: any = {
        id: impasseEnumId,
        type: 'ENUMERATION',
        choices: ['conflict', 'constraint-failure', 'no-change', 'tie'],
      };
      projectContext.project.datamap.vertices.push(impasseEnum);
      projectContext.datamapIndex.set(impasseEnumId, impasseEnum);
      dmVertex.outEdges.push({ name: 'impasse', toId: impasseEnumId });
    }

    // Add ^choices
    if (!hasEdge('choices')) {
      const choicesEnumId = this.generateVertexId(projectContext.project);
      const choicesEnum: any = {
        id: choicesEnumId,
        type: 'ENUMERATION',
        choices: ['constraint-failure', 'multiple', 'none'],
      };
      projectContext.project.datamap.vertices.push(choicesEnum);
      projectContext.datamapIndex.set(choicesEnumId, choicesEnum);
      dmVertex.outEdges.push({ name: 'choices', toId: choicesEnumId });
    }

    // Add ^quiescence
    if (!hasEdge('quiescence')) {
      const quiescenceEnumId = this.generateVertexId(projectContext.project);
      const quiescenceEnum: any = {
        id: quiescenceEnumId,
        type: 'ENUMERATION',
        choices: ['t'],
      };
      projectContext.project.datamap.vertices.push(quiescenceEnum);
      projectContext.datamapIndex.set(quiescenceEnumId, quiescenceEnum);
      dmVertex.outEdges.push({ name: 'quiescence', toId: quiescenceEnumId });
    }

    // Add ^epmem
    if (!hasEdge('epmem')) {
      const epmemId = this.generateVertexId(projectContext.project);
      const epmemCommandId = this.generateVertexId(projectContext.project);
      const epmemPresentIdId = this.generateVertexId(projectContext.project);
      const epmemResultId = this.generateVertexId(projectContext.project);

      const epmemVertex: any = {
        id: epmemId,
        type: 'SOAR_ID',
        outEdges: [
          { name: 'command', toId: epmemCommandId },
          { name: 'present-id', toId: epmemPresentIdId },
          { name: 'result', toId: epmemResultId },
        ],
      };
      const epmemCommandVertex: any = { id: epmemCommandId, type: 'SOAR_ID', outEdges: [] };
      const epmemPresentIdVertex: any = { id: epmemPresentIdId, type: 'INTEGER' };
      const epmemResultVertex: any = { id: epmemResultId, type: 'SOAR_ID', outEdges: [] };

      projectContext.project.datamap.vertices.push(epmemVertex);
      projectContext.project.datamap.vertices.push(epmemCommandVertex);
      projectContext.project.datamap.vertices.push(epmemPresentIdVertex);
      projectContext.project.datamap.vertices.push(epmemResultVertex);
      projectContext.datamapIndex.set(epmemId, epmemVertex);
      projectContext.datamapIndex.set(epmemCommandId, epmemCommandVertex);
      projectContext.datamapIndex.set(epmemPresentIdId, epmemPresentIdVertex);
      projectContext.datamapIndex.set(epmemResultId, epmemResultVertex);

      dmVertex.outEdges.push({ name: 'epmem', toId: epmemId });
    }

    // Add ^smem
    if (!hasEdge('smem')) {
      const smemId = this.generateVertexId(projectContext.project);
      const smemCommandId = this.generateVertexId(projectContext.project);
      const smemResultId = this.generateVertexId(projectContext.project);

      const smemVertex: any = {
        id: smemId,
        type: 'SOAR_ID',
        outEdges: [
          { name: 'command', toId: smemCommandId },
          { name: 'result', toId: smemResultId },
        ],
      };
      const smemCommandVertex: any = { id: smemCommandId, type: 'SOAR_ID', outEdges: [] };
      const smemResultVertex: any = { id: smemResultId, type: 'SOAR_ID', outEdges: [] };

      projectContext.project.datamap.vertices.push(smemVertex);
      projectContext.project.datamap.vertices.push(smemCommandVertex);
      projectContext.project.datamap.vertices.push(smemResultVertex);
      projectContext.datamapIndex.set(smemId, smemVertex);
      projectContext.datamapIndex.set(smemCommandId, smemCommandVertex);
      projectContext.datamapIndex.set(smemResultId, smemResultVertex);

      dmVertex.outEdges.push({ name: 'smem', toId: smemId });
    }

    // Add ^reward-link
    if (!hasEdge('reward-link')) {
      const rewardLinkId = this.generateVertexId(projectContext.project);
      const rewardId = this.generateVertexId(projectContext.project);
      const rewardValueId = this.generateVertexId(projectContext.project);

      const rewardLinkVertex: any = {
        id: rewardLinkId,
        type: 'SOAR_ID',
        outEdges: [{ name: 'reward', toId: rewardId }],
      };
      const rewardVertex: any = {
        id: rewardId,
        type: 'SOAR_ID',
        outEdges: [{ name: 'value', toId: rewardValueId }],
      };
      const rewardValueVertex: any = { id: rewardValueId, type: 'FLOAT' };

      projectContext.project.datamap.vertices.push(rewardLinkVertex);
      projectContext.project.datamap.vertices.push(rewardVertex);
      projectContext.project.datamap.vertices.push(rewardValueVertex);
      projectContext.datamapIndex.set(rewardLinkId, rewardLinkVertex);
      projectContext.datamapIndex.set(rewardId, rewardVertex);
      projectContext.datamapIndex.set(rewardValueId, rewardValueVertex);

      dmVertex.outEdges.push({ name: 'reward-link', toId: rewardLinkId });
    }

    // Convert to HIGH_LEVEL_OPERATOR (matching VisualSoar's structure)
    // The operator .soar file stays at parent level with propose/apply rules
    // The folder contains substate-specific files
    const highLevelNode: HighLevelOperatorNode = {
      type: 'HIGH_LEVEL_OPERATOR',
      id: operatorNode.id,
      name: operatorName,
      file: oldFile, // Keep the original file reference (stays at parent level)
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

    // Show message only if vscode window is available (not in tests)
    if (vscode.window) {
      vscode.window.showInformationMessage(`Converted '${operatorName}' to high-level operator`);
    }
    return true;
  }

  /**
   * Convert a regular IMPASSE_OPERATOR to a HIGH_LEVEL_IMPASSE_OPERATOR
   * Creates folder structure and moves the impasse operator file
   */
  private static async convertImpasseOperatorToHighLevel(
    projectContext: ProjectContext,
    operatorNodeId: string
  ): Promise<boolean> {
    const operatorNode = projectContext.layoutIndex.get(operatorNodeId);

    if (!operatorNode || operatorNode.type !== 'IMPASSE_OPERATOR') {
      return false;
    }

    const workspaceFolder = path.dirname(projectContext.projectFile);
    const impasseName = operatorNode.name;

    // Get the parent folder path to know where to create the new folder
    const parentId = this.findParentId(projectContext, operatorNodeId);
    if (!parentId) {
      if (vscode.window) {
        vscode.window.showErrorMessage('Cannot find parent node');
      }
      return false;
    }
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentId);
    const oldFile = operatorNode.file; // This is relative to parent

    // New folder path (relative to parent)
    const newFolderRelative = impasseName; // Just the folder name
    const newFullFolderPath = path.join(workspaceFolder, parentFolderPath, newFolderRelative);

    // Check if folder already exists
    if (fs.existsSync(newFullFolderPath)) {
      if (vscode.window) {
        vscode.window.showErrorMessage(`Folder already exists: ${newFolderRelative}`);
      }
      return false;
    }

    // Create folder structure
    await fs.promises.mkdir(newFullFolderPath, { recursive: true });

    // Create elaborations file
    const elabFile = 'elaborations.soar';
    const elabContent = ''; // Empty file like VisualSoar
    await fs.promises.writeFile(path.join(newFullFolderPath, elabFile), elabContent, 'utf-8');

    // Create source file for loading
    const sourceFile = `${impasseName}_source.soar`;
    const sourceContent = `source elaborations.soar\n`;
    await fs.promises.writeFile(path.join(newFullFolderPath, sourceFile), sourceContent, 'utf-8');

    // Create a NEW datamap vertex for the impasse substate
    const dmId = this.generateVertexId(projectContext.project);
    const dmVertex: any = {
      id: dmId,
      type: 'SOAR_ID',
      outEdges: [],
    };
    projectContext.project.datamap.vertices.push(dmVertex);
    projectContext.datamapIndex.set(dmId, dmVertex);

    // Ensure the datamap has complete substate structure
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
        choices: [impasseName],
      };
      projectContext.project.datamap.vertices.push(nameEnum);
      projectContext.datamapIndex.set(nameEnumId, nameEnum);
      dmVertex.outEdges.push({ name: 'name', toId: nameEnumId });
    }

    // Add ^type state
    if (!hasEdge('type')) {
      const stateEnumId = this.generateVertexId(projectContext.project);
      const stateEnumVertex: any = {
        id: stateEnumId,
        type: 'ENUMERATION',
        choices: ['state'],
      };
      projectContext.project.datamap.vertices.push(stateEnumVertex);
      projectContext.datamapIndex.set(stateEnumId, stateEnumVertex);
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

    // Add ^impasse attribute
    if (!hasEdge('impasse')) {
      const impasseEnumId = this.generateVertexId(projectContext.project);
      const impasseEnum: any = {
        id: impasseEnumId,
        type: 'ENUMERATION',
        choices: ['conflict', 'constraint-failure', 'no-change', 'tie'],
      };
      projectContext.project.datamap.vertices.push(impasseEnum);
      projectContext.datamapIndex.set(impasseEnumId, impasseEnum);
      dmVertex.outEdges.push({ name: 'impasse', toId: impasseEnumId });
    }

    // Add ^attribute
    if (!hasEdge('attribute')) {
      const attributeEnumId = this.generateVertexId(projectContext.project);
      const attributeEnum: any = {
        id: attributeEnumId,
        type: 'ENUMERATION',
        choices: ['operator', 'state'],
      };
      projectContext.project.datamap.vertices.push(attributeEnum);
      projectContext.datamapIndex.set(attributeEnumId, attributeEnum);
      dmVertex.outEdges.push({ name: 'attribute', toId: attributeEnumId });
    }

    // Convert to HIGH_LEVEL_IMPASSE_OPERATOR
    const highLevelNode: HighLevelImpasseOperatorNode = {
      type: 'HIGH_LEVEL_IMPASSE_OPERATOR',
      id: operatorNode.id,
      name: impasseName,
      file: oldFile, // Keep the original file reference
      dmId: dmId!,
      folder: newFolderRelative,
      children: [
        {
          type: 'FILE_OPERATOR',
          id: this.generateNodeId(projectContext.project),
          name: 'elaborations',
          file: elabFile,
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

    // Show message only if vscode window is available (not in tests)
    if (vscode.window) {
      vscode.window.showInformationMessage(
        `Converted '${impasseName}' to high-level impasse operator`
      );
    }
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

    // Traverse up the tree to find a HIGH_LEVEL_OPERATOR, HIGH_LEVEL_IMPASSE_OPERATOR, or root
    while (currentNode) {
      if (
        (currentNode.type === 'HIGH_LEVEL_OPERATOR' ||
          currentNode.type === 'HIGH_LEVEL_IMPASSE_OPERATOR') &&
        'dmId' in currentNode &&
        currentNode.dmId
      ) {
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
   * Internal implementation for adding a file
   * Shared by both UI and programmatic methods
   */
  static async addFileInternal(
    projectContext: ProjectContext,
    parentNodeId: string,
    fileName: string,
    options: {
      showMessages?: boolean;
      openFile?: boolean;
      reloadCallback?: () => Promise<void>;
    } = {}
  ): Promise<{ success: boolean; nodeId?: string; error?: string }> {
    const undoManager = options.reloadCallback ? getUndoManager() : null;
    const beforeSnapshot = undoManager ? await UndoManager.captureSnapshot(projectContext) : null;
    const parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode || !hasChildren(parentNode)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Can only add files to folder nodes');
      }
      return { success: false, error: 'Parent node not valid' };
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(fileName)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Invalid file name');
      }
      return { success: false, error: 'Invalid file name' };
    }

    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    const filePath = `${fileName}.soar`;
    const fullPath = path.join(workspaceFolder, parentFolderPath, filePath);

    if (fs.existsSync(fullPath)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage(`File already exists: ${filePath}`);
      }
      return { success: false, error: 'File already exists' };
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
    // Ensure the directory exists before writing the file
    const fileDir = path.dirname(fullPath);
    await fs.promises.mkdir(fileDir, { recursive: true });
    await fs.promises.writeFile(fullPath, content, 'utf-8');

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, filePath);

    await this.saveProject(projectContext);

    if (options.showMessages) {
      vscode.window.showInformationMessage(`Created file '${fileName}.soar'`);
    }

    if (options.openFile) {
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);
    }

    // Capture undo operation if callback provided
    if (undoManager && beforeSnapshot && options.reloadCallback) {
      const afterSnapshot = await UndoManager.captureSnapshot(projectContext);
      const operation = UndoManager.createSnapshotOperation(
        'Add File',
        projectContext,
        beforeSnapshot,
        afterSnapshot,
        options.reloadCallback
      );
      undoManager.pushOperation(operation);
    }

    return { success: true, nodeId: newNodeId };
  }

  /**
   * Internal implementation for adding an operator
   * Shared by both UI and programmatic methods
   */
  static async addOperatorInternal(
    projectContext: ProjectContext,
    parentNodeId: string,
    operatorName: string,
    options: {
      showMessages?: boolean;
      openFile?: boolean;
      reloadCallback?: () => Promise<void>;
    } = {}
  ): Promise<{ success: boolean; nodeId?: string; error?: string }> {
    const undoManager = options.reloadCallback ? getUndoManager() : null;
    const beforeSnapshot = undoManager ? await UndoManager.captureSnapshot(projectContext) : null;
    let parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Parent node not found');
      }
      return { success: false, error: 'Parent node not found' };
    }

    // If parent is a regular OPERATOR, convert it to HIGH_LEVEL_OPERATOR first
    if (parentNode.type === 'OPERATOR') {
      const converted = await this.convertOperatorToHighLevel(projectContext, parentNodeId);
      if (!converted) {
        return { success: false, error: 'Failed to convert to high-level operator' };
      }
      // Re-fetch the parent node after conversion
      parentNode = projectContext.layoutIndex.get(parentNodeId);
      if (!parentNode) {
        if (options.showMessages) {
          vscode.window.showErrorMessage('Failed to convert operator to high-level operator');
        }
        return { success: false, error: 'Failed to re-fetch parent after conversion' };
      }
    }

    if (!hasChildren(parentNode)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Can only add operators to folder nodes');
      }
      return { success: false, error: 'Parent cannot have children' };
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
      if (options.showMessages) {
        vscode.window.showErrorMessage(`File already exists: ${operatorFile}`);
      }
      return { success: false, error: 'File already exists' };
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

    if (options.showMessages) {
      vscode.window.showInformationMessage(`Created operator '${operatorName}'`);
    }

    if (options.openFile) {
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);
    }

    // Capture undo operation if callback provided
    if (undoManager && beforeSnapshot && options.reloadCallback) {
      const afterSnapshot = await UndoManager.captureSnapshot(projectContext);
      const operation = UndoManager.createSnapshotOperation(
        'Add Operator',
        projectContext,
        beforeSnapshot,
        afterSnapshot,
        options.reloadCallback
      );
      undoManager.pushOperation(operation);
    }

    return { success: true, nodeId: newNodeId };
  }

  /**
   * Internal implementation for adding an impasse operator
   * Shared by both UI and programmatic methods
   */
  static async addImpasseOperatorInternal(
    projectContext: ProjectContext,
    parentNodeId: string,
    impasseName: ImpasseName,
    options: {
      showMessages?: boolean;
      openFile?: boolean;
      reloadCallback?: () => Promise<void>;
    } = {}
  ): Promise<{ success: boolean; nodeId?: string; error?: string }> {
    const undoManager = options.reloadCallback ? getUndoManager() : null;
    const beforeSnapshot = undoManager ? await UndoManager.captureSnapshot(projectContext) : null;
    let parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Parent node not found');
      }
      return { success: false, error: 'Parent node not found' };
    }

    // If parent is a regular IMPASSE_OPERATOR, convert it to HIGH_LEVEL_IMPASSE_OPERATOR first
    if (parentNode.type === 'IMPASSE_OPERATOR') {
      const converted = await this.convertImpasseOperatorToHighLevel(projectContext, parentNodeId);
      if (!converted) {
        return { success: false, error: 'Failed to convert to high-level impasse operator' };
      }
      // Re-fetch the parent node after conversion
      parentNode = projectContext.layoutIndex.get(parentNodeId);
      if (!parentNode) {
        if (options.showMessages) {
          vscode.window.showErrorMessage(
            'Failed to convert impasse operator to high-level impasse operator'
          );
        }
        return { success: false, error: 'Failed to re-fetch parent after conversion' };
      }
    }

    if (!hasChildren(parentNode)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Can only add impasse operators to folder nodes');
      }
      return { success: false, error: 'Parent cannot have children' };
    }

    // Determine the parent state context (root or substate)
    const stateContext = this.findParentStateContext(projectContext, parentNodeId);

    // Note: Unlike regular operators, impasse operators don't modify the datamap
    // They generate empty files for users to fill in, similar to VisualSoar

    // Determine file path
    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    const operatorFile = `${impasseName}.soar`;
    const fullPath = path.join(workspaceFolder, parentFolderPath, operatorFile);

    // Check if file already exists
    if (fs.existsSync(fullPath)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage(`File already exists: ${operatorFile}`);
      }
      return { success: false, error: 'File already exists' };
    }

    // Create the impasse operator node
    const newNodeId = this.generateNodeId(projectContext.project);
    const newNode: ImpasseOperatorNode = {
      type: 'IMPASSE_OPERATOR',
      id: newNodeId,
      name: impasseName,
      file: operatorFile,
    };

    // Add to parent's children
    if (!parentNode.children) {
      parentNode.children = [];
    }
    parentNode.children.push(newNode);
    projectContext.layoutIndex.set(newNodeId, newNode);

    // Generate file content with proper state name
    const content = SoarTemplates.generateImpasseOperatorFile(impasseName, stateContext.stateName);

    // Create file
    await fs.promises.writeFile(fullPath, content, 'utf-8');

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, operatorFile);

    // Save project
    await this.saveProject(projectContext);

    if (options.showMessages) {
      vscode.window.showInformationMessage(`Created impasse operator '${impasseName}'`);
    }

    if (options.openFile) {
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);
    }

    // Capture undo operation if callback provided
    if (undoManager && beforeSnapshot && options.reloadCallback) {
      const afterSnapshot = await UndoManager.captureSnapshot(projectContext);
      const operation = UndoManager.createSnapshotOperation(
        'Add Impasse Operator',
        projectContext,
        beforeSnapshot,
        afterSnapshot,
        options.reloadCallback
      );
      undoManager.pushOperation(operation);
    }

    return { success: true, nodeId: newNodeId };
  }

  /**
   * Internal implementation for adding a folder
   * Shared by both UI and programmatic methods
   */
  static async addFolderInternal(
    projectContext: ProjectContext,
    parentNodeId: string,
    folderName: string,
    options: {
      showMessages?: boolean;
      reloadCallback?: () => Promise<void>;
    } = {}
  ): Promise<{ success: boolean; nodeId?: string; error?: string }> {
    const undoManager = options.reloadCallback ? getUndoManager() : null;
    const beforeSnapshot = undoManager ? await UndoManager.captureSnapshot(projectContext) : null;
    const parentNode = projectContext.layoutIndex.get(parentNodeId);

    if (!parentNode || !hasChildren(parentNode)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Can only add folders to folder nodes');
      }
      return { success: false, error: 'Parent node not valid' };
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(folderName)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage('Invalid folder name');
      }
      return { success: false, error: 'Invalid folder name' };
    }

    const workspaceFolder = path.dirname(projectContext.projectFile);
    const parentFolderPath = this.getNodeFolderPath(projectContext, parentNodeId);
    const folderPath = folderName;
    const fullPath = path.join(workspaceFolder, parentFolderPath, folderPath);

    if (fs.existsSync(fullPath)) {
      if (options.showMessages) {
        vscode.window.showErrorMessage(`Folder already exists: ${folderPath}`);
      }
      return { success: false, error: 'Folder already exists' };
    }

    // Create folder
    await fs.promises.mkdir(fullPath, { recursive: true });

    // Create folder node
    const newNodeId = this.generateNodeId(projectContext.project);
    const newNode: FolderNode = {
      type: 'FOLDER',
      id: newNodeId,
      name: folderName,
      folder: folderName,
      children: [],
    };

    if (!parentNode.children) {
      parentNode.children = [];
    }
    parentNode.children.push(newNode);
    projectContext.layoutIndex.set(newNodeId, newNode);

    await this.saveProject(projectContext);

    if (options.showMessages) {
      vscode.window.showInformationMessage(`Created folder '${folderName}'`);
    }

    // Capture undo operation if callback provided
    if (undoManager && beforeSnapshot && options.reloadCallback) {
      const afterSnapshot = await UndoManager.captureSnapshot(projectContext);
      const operation = UndoManager.createSnapshotOperation(
        'Add Folder',
        projectContext,
        beforeSnapshot,
        afterSnapshot,
        options.reloadCallback
      );
      undoManager.pushOperation(operation);
    }

    return { success: true, nodeId: newNodeId };
  }

  /**
   * Add operator programmatically with undo support (for testing)
   */
  static async addOperatorProgrammaticWithUndo(
    projectContext: ProjectContext,
    parentNodeId: string,
    operatorName: string,
    reloadCallback: () => Promise<void>
  ): Promise<{ success: boolean; nodeId?: string }> {
    return await this.addOperatorInternal(projectContext, parentNodeId, operatorName, {
      reloadCallback,
    });
  }

  /**
   * Add impasse operator programmatically with undo support (for testing)
   */
  static async addImpasseOperatorProgrammaticWithUndo(
    projectContext: ProjectContext,
    parentNodeId: string,
    impasseName: ImpasseName,
    reloadCallback: () => Promise<void>
  ): Promise<{ success: boolean; nodeId?: string }> {
    return await this.addImpasseOperatorInternal(projectContext, parentNodeId, impasseName, {
      reloadCallback,
    });
  }

  /**
   * Add file programmatically with undo support (for testing)
   */
  static async addFileProgrammaticWithUndo(
    projectContext: ProjectContext,
    parentNodeId: string,
    fileName: string,
    reloadCallback: () => Promise<void>
  ): Promise<{ success: boolean; nodeId?: string }> {
    return await this.addFileInternal(projectContext, parentNodeId, fileName, {
      reloadCallback,
    });
  }

  /**
   * Add folder programmatically with undo support (for testing)
   */
  static async addFolderProgrammaticWithUndo(
    projectContext: ProjectContext,
    parentNodeId: string,
    folderName: string,
    reloadCallback: () => Promise<void>
  ): Promise<{ success: boolean; nodeId?: string }> {
    return await this.addFolderInternal(projectContext, parentNodeId, folderName, {
      reloadCallback,
    });
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
