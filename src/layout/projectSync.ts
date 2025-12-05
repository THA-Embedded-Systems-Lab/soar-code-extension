/**
 * Project Sync Utilities
 *
 * Utilities for scanning and synchronizing .soar files with the project structure
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectContext, LayoutNode, hasChildren } from '../server/visualSoarProject';

export interface OrphanedFile {
  absolutePath: string;
  relativePath: string;
  fileName: string;
}

export interface MissingFile {
  relativePath: string;
  fileName: string;
  referencedIn: string; // Which node references this file
}

export class ProjectSync {
  /**
   * Find all .soar files that exist in the file system but are not in the project
   */
  static async findOrphanedFiles(projectContext: ProjectContext): Promise<OrphanedFile[]> {
    const projectDir = path.dirname(projectContext.projectFile);

    // Get all .soar files in the directory and subdirectories
    const allSoarFiles = await this.scanForSoarFiles(projectDir);

    // Get all files referenced in the project
    const projectFiles = this.collectProjectFiles(projectContext.project.layout);

    // Convert project files to absolute paths
    const projectFilesAbsolute = new Set(projectFiles.map(f => path.resolve(projectDir, f)));

    // Find orphaned files
    const orphaned: OrphanedFile[] = [];

    for (const soarFile of allSoarFiles) {
      if (!projectFilesAbsolute.has(soarFile)) {
        const relativePath = path.relative(projectDir, soarFile);
        const fileName = path.basename(soarFile, '.soar');

        orphaned.push({
          absolutePath: soarFile,
          relativePath,
          fileName,
        });
      }
    }

    return orphaned;
  }

  /**
   * Find all files referenced in the project that don't exist on disk
   */
  static async findMissingFiles(projectContext: ProjectContext): Promise<MissingFile[]> {
    const projectDir = path.dirname(projectContext.projectFile);
    const missing: MissingFile[] = [];

    // Collect all files with their context (which node references them)
    const referencedFiles = this.collectProjectFilesWithContext(projectContext.project.layout);

    for (const fileRef of referencedFiles) {
      const absolutePath = path.resolve(projectDir, fileRef.relativePath);

      try {
        await fs.promises.access(absolutePath, fs.constants.F_OK);
        // File exists, continue
      } catch {
        // File doesn't exist
        missing.push({
          relativePath: fileRef.relativePath,
          fileName: path.basename(fileRef.relativePath),
          referencedIn: fileRef.nodeName,
        });
      }
    }

    return missing;
  }

  /**
   * Collect all file paths with context about which node references them
   */
  private static collectProjectFilesWithContext(
    node: LayoutNode,
    parentFolder: string = '',
    nodePath: string = 'root'
  ): Array<{ relativePath: string; nodeName: string }> {
    const files: Array<{ relativePath: string; nodeName: string }> = [];

    // Determine the current folder path
    let currentFolder = parentFolder;

    if ('folder' in node && node.folder) {
      currentFolder = parentFolder ? path.join(parentFolder, node.folder) : node.folder;
    }

    // Build node name for context
    const currentNodePath = 'name' in node && node.name ? `${nodePath}/${node.name}` : nodePath;

    // If this node has a file, add it with full path and context
    if ('file' in node && node.file) {
      let filePath: string;

      // For HIGH_LEVEL_OPERATOR and HIGH_LEVEL_FILE_OPERATOR, the file is in the parent folder
      if (node.type === 'HIGH_LEVEL_OPERATOR' || node.type === 'HIGH_LEVEL_FILE_OPERATOR') {
        filePath = parentFolder ? path.join(parentFolder, node.file) : node.file;
      } else {
        filePath = currentFolder ? path.join(currentFolder, node.file) : node.file;
      }

      files.push({
        relativePath: filePath,
        nodeName: currentNodePath,
      });
    }

    // Recursively collect from children
    if (hasChildren(node) && node.children) {
      for (const child of node.children) {
        files.push(...this.collectProjectFilesWithContext(child, currentFolder, currentNodePath));
      }
    }

    return files;
  }

  /**
   * Recursively scan for all .soar files in a directory
   */
  private static async scanForSoarFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules, .git, and other common directories
          if (!['node_modules', '.git', '.vscode', 'out', 'dist', 'build'].includes(entry.name)) {
            const subFiles = await this.scanForSoarFiles(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile() && entry.name.endsWith('.soar')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }

    return files;
  }

  /**
   * Collect all file paths referenced in the project layout
   */
  private static collectProjectFiles(node: LayoutNode, parentFolder: string = ''): string[] {
    const files: string[] = [];

    // Determine the current folder path
    let currentFolder = parentFolder;

    if ('folder' in node && node.folder) {
      // Build full path: parent + current folder
      currentFolder = parentFolder ? path.join(parentFolder, node.folder) : node.folder;
    }

    // If this node has a file, add it with full path
    if ('file' in node && node.file) {
      let filePath: string;

      // For HIGH_LEVEL_OPERATOR and HIGH_LEVEL_FILE_OPERATOR, the file is in the parent folder
      // but the folder field points to a subfolder for children
      if (node.type === 'HIGH_LEVEL_OPERATOR' || node.type === 'HIGH_LEVEL_FILE_OPERATOR') {
        filePath = parentFolder ? path.join(parentFolder, node.file) : node.file;
      } else {
        filePath = currentFolder ? path.join(currentFolder, node.file) : node.file;
      }

      files.push(filePath);
    }

    // Recursively collect from children, passing down the current folder as parent
    if (hasChildren(node) && node.children) {
      for (const child of node.children) {
        files.push(...this.collectProjectFiles(child, currentFolder));
      }
    }

    return files;
  }

  /**
   * Show missing files to the user
   */
  static async showMissingFilesDialog(
    projectContext: ProjectContext,
    missingFiles: MissingFile[]
  ): Promise<void> {
    if (missingFiles.length === 0) {
      vscode.window.showInformationMessage(
        'No missing files found. All files referenced in the project exist on disk!'
      );
      return;
    }

    // Create quick pick items for information display
    const items = missingFiles.map(file => ({
      label: `$(warning) ${file.fileName}`,
      description: file.relativePath,
      detail: `Referenced in: ${file.referencedIn}`,
    }));

    const message = `Found ${missingFiles.length} missing file(s) referenced in ${path.basename(
      projectContext.projectFile
    )}`;

    const choice = await vscode.window.showWarningMessage(
      message,
      'View Details',
      'Open Project File',
      'Dismiss'
    );

    if (choice === 'View Details') {
      await vscode.window.showQuickPick(items, {
        canPickMany: false,
        placeHolder: 'Missing files referenced in project but not found on disk:',
        title: 'Missing Project Files',
      });
    } else if (choice === 'Open Project File') {
      const doc = await vscode.workspace.openTextDocument(projectContext.projectFile);
      await vscode.window.showTextDocument(doc);
    }
  }

  /**
   * Show orphaned files to the user and offer to add them to the project
   */
  static async showOrphanedFilesDialog(
    projectContext: ProjectContext,
    orphanedFiles: OrphanedFile[]
  ): Promise<OrphanedFile[]> {
    if (orphanedFiles.length === 0) {
      vscode.window.showInformationMessage(
        'No orphaned .soar files found. All files are in the project!'
      );
      return [];
    }

    // Create quick pick items
    const items = orphanedFiles.map(file => ({
      label: file.fileName,
      description: file.relativePath,
      detail: `File not in project: ${file.relativePath}`,
      picked: true, // Pre-select all by default
      file,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: `Found ${orphanedFiles.length} orphaned .soar file(s). Select files to add to project:`,
      title: 'Orphaned Soar Files',
    });

    if (!selected || selected.length === 0) {
      return [];
    }

    return selected.map(item => item.file);
  }

  /**
   * Add orphaned files to the project structure
   */
  static async addOrphanedFilesToProject(
    projectContext: ProjectContext,
    orphanedFiles: OrphanedFile[]
  ): Promise<number> {
    if (orphanedFiles.length === 0) {
      return 0;
    }

    const projectDir = path.dirname(projectContext.projectFile);
    let addedCount = 0;

    // Group files by directory
    const filesByDir = new Map<string, OrphanedFile[]>();

    for (const file of orphanedFiles) {
      const dir = path.dirname(file.relativePath);
      if (!filesByDir.has(dir)) {
        filesByDir.set(dir, []);
      }
      filesByDir.get(dir)!.push(file);
    }

    // For each directory, find or create the corresponding layout node
    for (const [dir, files] of filesByDir.entries()) {
      const targetNode = this.findOrCreateFolderNode(projectContext, dir, projectDir);

      if (!targetNode) {
        vscode.window.showWarningMessage(`Could not find/create folder node for: ${dir}`);
        continue;
      }

      // Add each file to this node
      for (const file of files) {
        const fileNode = {
          type: 'FILE' as const,
          id: this.generateNodeId(projectContext),
          name: file.fileName,
          file: file.relativePath,
        };

        if (!targetNode.children) {
          targetNode.children = [];
        }

        targetNode.children.push(fileNode);
        projectContext.layoutIndex.set(fileNode.id, fileNode);
        addedCount++;
      }
    }

    // Save the project
    await this.saveProject(projectContext);

    return addedCount;
  }

  /**
   * Find or create a folder node for the given path
   */
  private static findOrCreateFolderNode(
    projectContext: ProjectContext,
    targetPath: string,
    projectDir: string
  ): any {
    const root = projectContext.project.layout;

    // If target is current directory, return root
    if (targetPath === '.' || targetPath === '') {
      return root;
    }

    // Split path into parts
    const parts = targetPath.split(path.sep);
    let currentNode: any = root;
    let currentPath = '';

    // Navigate/create the path
    for (const part of parts) {
      currentPath = currentPath ? path.join(currentPath, part) : part;

      // Look for existing child with this name
      let childNode: any = null;

      if (hasChildren(currentNode) && currentNode.children) {
        childNode = currentNode.children.find(
          (child: LayoutNode) =>
            child.name === part &&
            (child.type === 'FOLDER' ||
              child.type === 'HIGH_LEVEL_OPERATOR' ||
              child.type === 'HIGH_LEVEL_FILE_OPERATOR')
        );
      }

      // If not found, create it
      if (!childNode) {
        childNode = {
          type: 'FOLDER',
          id: this.generateNodeId(projectContext),
          name: part,
          folder: currentPath,
          children: [],
        };

        if (!currentNode.children) {
          currentNode.children = [];
        }

        currentNode.children.push(childNode);
        projectContext.layoutIndex.set(childNode.id, childNode);
      }

      currentNode = childNode;
    }

    return currentNode;
  }

  /**
   * Generate a unique node ID
   */
  private static generateNodeId(projectContext: ProjectContext): string {
    const existingIds = new Set<string>();

    const collectIds = (node: LayoutNode) => {
      existingIds.add(node.id);
      if (hasChildren(node) && node.children) {
        for (const child of node.children) {
          collectIds(child);
        }
      }
    };

    collectIds(projectContext.project.layout);

    let id = 1;
    while (existingIds.has(id.toString())) {
      id++;
    }
    return id.toString();
  }

  /**
   * Save project to file
   */
  private static async saveProject(projectContext: ProjectContext): Promise<void> {
    const json = JSON.stringify(projectContext.project, null, 2);
    await fs.promises.writeFile(projectContext.projectFile, json, 'utf-8');
  }

  /**
   * Generate a report of orphaned files
   */
  static generateOrphanedFilesReport(orphanedFiles: OrphanedFile[]): string {
    if (orphanedFiles.length === 0) {
      return 'All .soar files are included in the project!';
    }

    const lines = [`Found ${orphanedFiles.length} orphaned .soar file(s):`, ''];

    // Sort by relative path
    const sortedFiles = orphanedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const file of sortedFiles) {
      lines.push(`  ${file.relativePath}`);
    }

    lines.push('');
    lines.push('Use "Sync Project Files" to add these files to the project.');

    return lines.join('\n');
  }
}
