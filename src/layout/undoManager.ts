/**
 * Undo Manager
 *
 * Manages undo/redo functionality for project structure operations
 * Tracks operations like adding/deleting operators, files, and folders
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
} from '../server/visualSoarProject';

/**
 * Represents a reversible operation on the project structure
 */
export interface UndoableOperation {
  /** Description of the operation for display */
  description: string;
  /** Execute the undo operation */
  undo(): Promise<void>;
  /** Execute the redo operation */
  redo(): Promise<void>;
}

/**
 * Snapshot of a file's state
 */
interface FileSnapshot {
  path: string;
  content: string | null; // null if file didn't exist
}

/**
 * Snapshot of the project state
 */
interface ProjectSnapshot {
  projectJson: string;
  files: FileSnapshot[];
}

/**
 * Manages undo/redo stack for project operations
 */
export class UndoManager {
  private undoStack: UndoableOperation[] = [];
  private redoStack: UndoableOperation[] = [];
  private maxStackSize = 50;
  private readonly onDidChangeStackEmitter = new vscode.EventEmitter<void>();

  /** Fires when the undo/redo stack changes (for updating UI) */
  readonly onDidChangeStack = this.onDidChangeStackEmitter.event;

  /**
   * Record an operation in the undo stack
   */
  pushOperation(operation: UndoableOperation): void {
    this.undoStack.push(operation);

    // Limit stack size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    // Clear redo stack when a new operation is performed
    this.redoStack = [];

    this.onDidChangeStackEmitter.fire();
    this.updateContextKeys();
  }

  /**
   * Undo the last operation
   */
  async undo(): Promise<boolean> {
    const operation = this.undoStack.pop();
    if (!operation) {
      return false;
    }

    try {
      await operation.undo();
      this.redoStack.push(operation);
      this.onDidChangeStackEmitter.fire();
      this.updateContextKeys();
      return true;
    } catch (error: any) {
      // If undo fails, put it back on the stack
      this.undoStack.push(operation);
      this.onDidChangeStackEmitter.fire();
      this.updateContextKeys();
      throw error;
    }
  }

  /**
   * Redo the last undone operation
   */
  async redo(): Promise<boolean> {
    const operation = this.redoStack.pop();
    if (!operation) {
      return false;
    }

    try {
      await operation.redo();
      this.undoStack.push(operation);
      this.onDidChangeStackEmitter.fire();
      this.updateContextKeys();
      return true;
    } catch (error: any) {
      // If redo fails, put it back on the redo stack
      this.redoStack.push(operation);
      this.onDidChangeStackEmitter.fire();
      this.updateContextKeys();
      throw error;
    }
  }

  /**
   * Update VS Code context keys for toolbar button enablement
   */
  private updateContextKeys(): void {
    // Only update context keys in VS Code environment (not in tests)
    if (vscode.commands) {
      void vscode.commands.executeCommand('setContext', 'soar.canUndo', this.canUndo());
      void vscode.commands.executeCommand('setContext', 'soar.canRedo', this.canRedo());
    }
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get the description of the next undo operation
   */
  getUndoDescription(): string | null {
    if (this.undoStack.length === 0) {
      return null;
    }
    return this.undoStack[this.undoStack.length - 1].description;
  }

  /**
   * Get the description of the next redo operation
   */
  getRedoDescription(): string | null {
    if (this.redoStack.length === 0) {
      return null;
    }
    return this.redoStack[this.redoStack.length - 1].description;
  }

  /**
   * Clear all undo/redo history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onDidChangeStackEmitter.fire();
    this.updateContextKeys();
  }

  /**
   * Create a snapshot-based undoable operation
   * This captures the entire project state before and after an operation
   */
  static createSnapshotOperation(
    description: string,
    projectContext: ProjectContext,
    beforeSnapshot: ProjectSnapshot,
    afterSnapshot: ProjectSnapshot,
    reloadCallback: () => Promise<void>
  ): UndoableOperation {
    return {
      description,
      undo: async () => {
        await UndoManager.restoreSnapshot(beforeSnapshot, projectContext);
        await reloadCallback();
      },
      redo: async () => {
        await UndoManager.restoreSnapshot(afterSnapshot, projectContext);
        await reloadCallback();
      },
    };
  }

  /**
   * Capture the current state of the project
   */
  static async captureSnapshot(projectContext: ProjectContext): Promise<ProjectSnapshot> {
    // Read the current project JSON
    const projectJson = await fs.promises.readFile(projectContext.projectFile, 'utf-8');

    // Collect all files referenced in the project
    const files: FileSnapshot[] = [];
    const workspaceFolder = path.dirname(projectContext.projectFile);

    const collectFiles = async (node: LayoutNode, currentPath: string) => {
      if (node.type === 'OPERATOR' || node.type === 'FILE') {
        // File path is stored in node.file
        const absolutePath = path.join(currentPath, node.file);

        let content: string | null = null;
        try {
          if (fs.existsSync(absolutePath)) {
            content = await fs.promises.readFile(absolutePath, 'utf-8');
          }
        } catch (error) {
          console.error(`Failed to read file ${absolutePath}:`, error);
        }

        files.push({ path: absolutePath, content });
      }

      // Recurse into children with updated path
      if (node.type === 'FOLDER' && 'folder' in node && node.folder) {
        const folderPath = path.join(currentPath, node.folder);
        if (node.children) {
          for (const child of node.children) {
            await collectFiles(child, folderPath);
          }
        }
      } else if (
        node.type === 'HIGH_LEVEL_OPERATOR' ||
        node.type === 'HIGH_LEVEL_FILE_OPERATOR' ||
        node.type === 'HIGH_LEVEL_IMPASSE_OPERATOR'
      ) {
        // High level operators have their own folder
        const folderPath = path.join(currentPath, node.name);
        if ('children' in node && node.children) {
          for (const child of node.children) {
            await collectFiles(child, folderPath);
          }
        }
      } else if (node.type === 'OPERATOR_ROOT' && 'folder' in node && node.folder) {
        // Root node has a folder property
        const folderPath = path.join(currentPath, node.folder);
        if ('children' in node && node.children) {
          for (const child of node.children) {
            await collectFiles(child, folderPath);
          }
        }
      }
    };

    // Start from workspace folder
    await collectFiles(projectContext.project.layout, workspaceFolder);

    return { projectJson, files };
  }

  /**
   * Restore a project snapshot
   */
  private static async restoreSnapshot(
    snapshot: ProjectSnapshot,
    projectContext: ProjectContext
  ): Promise<void> {
    // Restore the project JSON file
    await fs.promises.writeFile(projectContext.projectFile, snapshot.projectJson, 'utf-8');

    // Restore all files
    for (const fileSnapshot of snapshot.files) {
      if (fileSnapshot.content !== null) {
        // File should exist with this content
        const dir = path.dirname(fileSnapshot.path);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(fileSnapshot.path, fileSnapshot.content, 'utf-8');
      } else {
        // File should not exist, delete it if it does
        try {
          if (fs.existsSync(fileSnapshot.path)) {
            await fs.promises.unlink(fileSnapshot.path);
          }
        } catch (error) {
          console.error(`Failed to delete file ${fileSnapshot.path}:`, error);
        }
      }
    }
  }
}

/**
 * Global undo manager instance
 */
let globalUndoManager: UndoManager | null = null;

/**
 * Get or create the global undo manager instance
 */
export function getUndoManager(): UndoManager {
  if (!globalUndoManager) {
    globalUndoManager = new UndoManager();
  }
  return globalUndoManager;
}

/**
 * Reset the global undo manager (useful when changing projects)
 */
export function resetUndoManager(): void {
  if (globalUndoManager) {
    globalUndoManager.clear();
  }
  globalUndoManager = new UndoManager();
}
