/**
 * Soar Project Manager
 *
 * Handles discovering, selecting, and managing multiple Soar projects within a workspace
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface SoarProjectInfo {
  /** Absolute path to the project file */
  projectFile: string;
  /** Display name (derived from filename or parent folder) */
  displayName: string;
  /** Relative path from workspace root */
  relativePath: string;
  /** Workspace folder this project belongs to */
  workspaceFolder: vscode.WorkspaceFolder;
}

export class ProjectManager {
  private static instance: ProjectManager;
  private activeProject: SoarProjectInfo | null = null;
  private discoveredProjects: SoarProjectInfo[] = [];
  private statusBarItem: vscode.StatusBarItem;
  private readonly ACTIVE_PROJECT_KEY = 'soar.activeProject';

  private constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'soar.selectProject';
    this.statusBarItem.tooltip = 'Click to select active Soar project';
    this.context.subscriptions.push(this.statusBarItem);
  }

  static getInstance(context: vscode.ExtensionContext): ProjectManager {
    if (!ProjectManager.instance) {
      ProjectManager.instance = new ProjectManager(context);
    }
    return ProjectManager.instance;
  }

  /**
   * Discover all Soar projects in the workspace
   */
  async discoverProjects(): Promise<SoarProjectInfo[]> {
    this.discoveredProjects = [];

    if (!vscode.workspace.workspaceFolders) {
      return [];
    }

    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      const projects = await this.findProjectFilesRecursive(
        workspaceFolder.uri.fsPath,
        workspaceFolder
      );
      this.discoveredProjects.push(...projects);
    }

    return this.discoveredProjects;
  }

  /**
   * Recursively find all .vsa.json files in a directory
   */
  private async findProjectFilesRecursive(
    dir: string,
    workspaceFolder: vscode.WorkspaceFolder,
    relativePath: string = ''
  ): Promise<SoarProjectInfo[]> {
    const projects: SoarProjectInfo[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        // Skip common directories
        if (entry.isDirectory()) {
          if (['node_modules', '.git', '.vscode', 'out', 'dist', 'build'].includes(entry.name)) {
            continue;
          }
          const subProjects = await this.findProjectFilesRecursive(
            fullPath,
            workspaceFolder,
            relPath
          );
          projects.push(...subProjects);
        } else if (entry.isFile() && entry.name.endsWith('.vsa.json')) {
          const projectName = path.basename(entry.name, '.vsa.json');
          const parentFolder = path.basename(path.dirname(fullPath));

          projects.push({
            projectFile: fullPath,
            displayName: `${projectName} (${parentFolder})`,
            relativePath: relPath,
            workspaceFolder,
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }

    return projects;
  }

  /**
   * Get all discovered projects
   */
  getDiscoveredProjects(): SoarProjectInfo[] {
    return this.discoveredProjects;
  }

  /**
   * Get the currently active project
   */
  getActiveProject(): SoarProjectInfo | null {
    return this.activeProject;
  }

  /**
   * Set the active project
   */
  async setActiveProject(project: SoarProjectInfo): Promise<void> {
    this.activeProject = project;

    // Save to workspace state
    await this.context.workspaceState.update(this.ACTIVE_PROJECT_KEY, project.projectFile);

    this.updateStatusBar();

    // Notify LSP server of project change
    const lspClient = await import('./client/lspClient');
    await lspClient.notifyProjectChanged(project.projectFile);
  }

  /**
   * Clear the active project
   */
  async clearActiveProject(): Promise<void> {
    this.activeProject = null;
    await this.context.workspaceState.update(this.ACTIVE_PROJECT_KEY, undefined);
    this.updateStatusBar();
  }

  /**
   * Restore the previously active project from workspace state
   */
  async restoreActiveProject(): Promise<void> {
    const savedProjectFile = this.context.workspaceState.get<string>(this.ACTIVE_PROJECT_KEY);

    if (!savedProjectFile) {
      return;
    }

    // Check if the saved project still exists
    try {
      await fs.promises.access(savedProjectFile);

      // Find the project info
      await this.discoverProjects();
      const project = this.discoveredProjects.find(p => p.projectFile === savedProjectFile);

      if (project) {
        this.activeProject = project;
        this.updateStatusBar();

        // Notify LSP server of restored project
        const lspClient = await import('./client/lspClient');
        await lspClient.notifyProjectChanged(project.projectFile);
      } else {
        // Project file exists but not in discovered projects, create minimal info
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          vscode.Uri.file(savedProjectFile)
        );
        if (workspaceFolder) {
          const relativePath = path.relative(workspaceFolder.uri.fsPath, savedProjectFile);
          const projectName = path.basename(savedProjectFile, '.vsa.json');
          const parentFolder = path.basename(path.dirname(savedProjectFile));

          this.activeProject = {
            projectFile: savedProjectFile,
            displayName: `${projectName} (${parentFolder})`,
            relativePath,
            workspaceFolder,
          };
          this.updateStatusBar();

          // Notify LSP server of restored project
          const lspClient = await import('./client/lspClient');
          await lspClient.notifyProjectChanged(savedProjectFile);
        }
      }
    } catch {
      // Project file no longer exists, clear it
      await this.clearActiveProject();
    }
  }

  /**
   * Show project selection QuickPick
   */
  async showProjectSelector(): Promise<SoarProjectInfo | undefined> {
    await this.discoverProjects();

    if (this.discoveredProjects.length === 0) {
      vscode.window.showInformationMessage('No Soar projects (.vsa.json files) found in workspace');
      return undefined;
    }

    if (this.discoveredProjects.length === 1) {
      // Only one project, select it automatically
      const project = this.discoveredProjects[0];
      await this.setActiveProject(project);
      vscode.window.showInformationMessage(`Active project: ${project.displayName}`);
      return project;
    }

    // Multiple projects, show selection dialog
    const items = this.discoveredProjects.map(project => ({
      label: project.displayName,
      description: project.relativePath,
      detail: project.projectFile,
      project,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a Soar project to work with',
      title: 'Soar Project Selection',
    });

    if (selected) {
      await this.setActiveProject(selected.project);
      return selected.project;
    }

    return undefined;
  }

  /**
   * Update the status bar item
   */
  private updateStatusBar(): void {
    if (this.activeProject) {
      this.statusBarItem.text = `$(circuit-board) ${this.activeProject.displayName}`;
      this.statusBarItem.show();
    } else {
      this.statusBarItem.text = '$(circuit-board) No Soar project';
      this.statusBarItem.hide();
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
