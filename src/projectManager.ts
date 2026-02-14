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
  private diagnosticCollection: vscode.DiagnosticCollection;
  private readonly activeProjectEmitter = new vscode.EventEmitter<SoarProjectInfo | null>();
  readonly onDidChangeActiveProject = this.activeProjectEmitter.event;
  private projectFileWatcher: vscode.FileSystemWatcher | null = null;

  private constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'soar.selectProject';
    this.statusBarItem.tooltip = 'Click to select active Soar project';
    this.context.subscriptions.push(this.statusBarItem);

    // Create diagnostic collection for project validation issues
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection('soar-project-validation');
    this.context.subscriptions.push(this.diagnosticCollection);
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
    console.log(`Setting active project: ${project.projectFile}`);
    this.activeProject = project;

    // Save to workspace state
    await this.context.workspaceState.update(this.ACTIVE_PROJECT_KEY, project.projectFile);
    console.log('Workspace state updated');

    this.updateStatusBar();
    console.log('Status bar updated');

    // Set up file system watcher for the project file
    this.setupProjectWatcher(project.projectFile);
    console.log('Project file watcher set up');

    // Notify LSP server of project change
    const lspClient = await import('./client/lspClient');
    await lspClient.notifyProjectChanged(project.projectFile);
    console.log('LSP server notified');

    this.activeProjectEmitter.fire(project);
    console.log('Active project event fired');

    // Validate project files and report issues (don't await - run in background)
    // This prevents blocking the project activation
    console.log('Starting project file validation in background...');
    this.validateProjectFiles(project).catch(error => {
      console.error('Project validation failed:', error);
    });
  }

  /**
   * Find the line number in the project file where a specific file path is referenced
   */
  private async findFileReferenceLine(projectFile: string, filePath: string): Promise<number> {
    try {
      const content = await fs.promises.readFile(projectFile, 'utf-8');
      const lines = content.split('\n');

      // Search for the file reference in the JSON
      // Look for "file": "path" pattern
      const searchPattern = `"file": "${filePath.replace(/\\/g, '/')}"`; // Normalize path separators

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchPattern) || lines[i].includes(`"file": "${filePath}"`)) {
          return i;
        }
      }

      // If exact match not found, try to find just the filename
      const fileName = path.basename(filePath);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`"file"`) && lines[i].includes(fileName)) {
          return i;
        }
      }
    } catch (error) {
      console.error('Error finding file reference line:', error);
    }

    return 0; // Default to first line if not found
  }

  /**
   * Validate project files and report orphaned/missing files as warnings
   */
  private async validateProjectFiles(project: SoarProjectInfo): Promise<void> {
    try {
      // Load the project using ProjectLoader to get full context
      const { ProjectLoader } = await import('./server/projectLoader');
      const projectLoader = new ProjectLoader();
      const projectContext = await projectLoader.loadProject(project.projectFile);

      // Import ProjectSync
      const { ProjectSync } = await import('./layout/projectSync');

      // Check for orphaned and missing files in parallel
      const [orphanedFiles, missingFiles] = await Promise.all([
        ProjectSync.findOrphanedFiles(projectContext),
        ProjectSync.findMissingFiles(projectContext),
      ]);

      // Create diagnostics for the Problems window
      const diagnostics: vscode.Diagnostic[] = [];
      const projectUri = vscode.Uri.file(project.projectFile);

      // Add diagnostics for orphaned files
      for (const orphaned of orphanedFiles) {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `Orphaned file not in project: ${orphaned.relativePath}`,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'Soar Project Validation';
        diagnostic.code = 'orphaned-file';
        diagnostics.push(diagnostic);
      }

      // Add diagnostics for missing files with actual line numbers
      for (const missing of missingFiles) {
        const lineNumber = await this.findFileReferenceLine(
          project.projectFile,
          missing.relativePath
        );
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(lineNumber, 0, lineNumber, 1000),
          `Missing file referenced in project: ${missing.relativePath} (referenced in ${missing.referencedIn})`,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'Soar Project Validation';
        diagnostic.code = 'missing-file';
        diagnostics.push(diagnostic);
      }

      // Update diagnostics in Problems window
      this.diagnosticCollection.set(projectUri, diagnostics);

      // Report warnings
      const warnings: string[] = [];

      if (orphanedFiles.length > 0) {
        warnings.push(`${orphanedFiles.length} orphaned file(s) not in project`);
      }

      if (missingFiles.length > 0) {
        warnings.push(`${missingFiles.length} missing file(s) referenced but not found`);
      }

      // Show warning message if there are any issues
      if (warnings.length > 0) {
        const message = `Project validation: ${warnings.join(', ')}`;
        const actions: string[] = [];

        if (orphanedFiles.length > 0) {
          actions.push('View Orphaned Files');
        }
        if (missingFiles.length > 0) {
          actions.push('View Missing Files');
        }
        actions.push('Dismiss');

        const choice = await vscode.window.showWarningMessage(message, ...actions);

        if (choice === 'View Orphaned Files') {
          await vscode.commands.executeCommand('soar.findOrphanedFiles');
        } else if (choice === 'View Missing Files') {
          await vscode.commands.executeCommand('soar.findMissingFiles');
        }
      }
    } catch (error) {
      console.error('Error validating project files:', error);
      // Don't show error to user - this is a background validation
    }
  }

  /**
   * Set up file system watcher for the active project's .vsa.json file
   * When the file changes externally, reload the project
   */
  private setupProjectWatcher(projectFile: string): void {
    // Dispose of existing watcher if any
    if (this.projectFileWatcher) {
      this.projectFileWatcher.dispose();
      this.projectFileWatcher = null;
    }

    // Create a watcher specifically for this project file using a RelativePattern
    // This ensures we watch the specific file, not a glob pattern
    const fileDir = path.dirname(projectFile);
    const fileName = path.basename(projectFile);
    const pattern = new vscode.RelativePattern(fileDir, fileName);

    console.log(`Setting up watcher for: ${projectFile}`);
    console.log(`  Directory: ${fileDir}`);
    console.log(`  File: ${fileName}`);

    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.projectFileWatcher = watcher;

    // Watch for changes to the .vsa.json file
    watcher.onDidChange(async (uri: vscode.Uri) => {
      console.log(`Project file changed: ${uri.fsPath}`);

      // Reload the project by firing the active project changed event
      // This will trigger all the registered listeners (datamap, layout, etc.)
      if (this.activeProject) {
        console.log('Reloading project due to external file change...');
        this.activeProjectEmitter.fire(this.activeProject);

        // Re-validate project files after external changes
        await this.validateProjectFiles(this.activeProject);
      }
    });

    // Watch for deletion of the .vsa.json file
    watcher.onDidDelete(async (uri: vscode.Uri) => {
      console.log(`Project file deleted: ${uri.fsPath}`);
      vscode.window.showWarningMessage(
        `Active project file was deleted: ${path.basename(uri.fsPath)}`
      );
      await this.clearActiveProject();
    });

    // Register for cleanup
    this.context.subscriptions.push(watcher);
  }

  /**
   * Clear the active project
   */
  async clearActiveProject(): Promise<void> {
    this.activeProject = null;
    await this.context.workspaceState.update(this.ACTIVE_PROJECT_KEY, undefined);
    this.updateStatusBar();

    // Dispose of project file watcher
    if (this.projectFileWatcher) {
      this.projectFileWatcher.dispose();
      this.projectFileWatcher = null;
    }

    // Clear project validation diagnostics
    this.diagnosticCollection.clear();

    this.activeProjectEmitter.fire(null);
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
        await this.setActiveProject(project);
      } else {
        // Project file exists but not in discovered projects, create minimal info
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          vscode.Uri.file(savedProjectFile)
        );
        if (workspaceFolder) {
          const relativePath = path.relative(workspaceFolder.uri.fsPath, savedProjectFile);
          const projectName = path.basename(savedProjectFile, '.vsa.json');
          const parentFolder = path.basename(path.dirname(savedProjectFile));

          await this.setActiveProject({
            projectFile: savedProjectFile,
            displayName: `${projectName} (${parentFolder})`,
            relativePath,
            workspaceFolder,
          });
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
    if (this.projectFileWatcher) {
      this.projectFileWatcher.dispose();
      this.projectFileWatcher = null;
    }
    this.statusBarItem.dispose();
  }
}
