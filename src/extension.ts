import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as lspClient from './client/lspClient';
import { DatamapTreeProvider, DatamapTreeItem } from './datamap/datamapTreeProvider';
import { DatamapValidator } from './datamap/datamapValidator';
import { DatamapOperations } from './datamap/datamapOperations';
import { LayoutTreeProvider, LayoutTreeItem } from './layout/layoutTreeProvider';
import { LayoutOperations } from './layout/layoutOperations';
import { ProjectSync } from './layout/projectSync';
import { SoarParser } from './server/soarParser';
import { ProjectManager } from './projectManager';
import { SourceScriptAnalyzer } from './server/sourceScriptParser';

// Global validator and diagnostics collection
let validator: DatamapValidator;
let diagnosticsCollection: vscode.DiagnosticCollection;
let datamapProviderGlobal: DatamapTreeProvider;
let layoutProviderGlobal: LayoutTreeProvider;
let parser: SoarParser;
let projectManager: ProjectManager;
let sourceScriptAnalyzer: SourceScriptAnalyzer;

/**
 * Get the project manager instance (for testing)
 */
export function getProjectManager(): ProjectManager {
  return projectManager;
}

/**
 * Extension activation function
 * Called when the extension is activated (when a .soar file is opened)
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Soar extension is now active');

  // Initialize project manager
  projectManager = ProjectManager.getInstance(context);
  context.subscriptions.push(projectManager);

  // Initialize validator and parser
  validator = new DatamapValidator();
  parser = new SoarParser();
  sourceScriptAnalyzer = new SourceScriptAnalyzer();
  diagnosticsCollection = vscode.languages.createDiagnosticCollection('soar-datamap');
  context.subscriptions.push(diagnosticsCollection);

  // Register a simple command to verify the extension works
  const disposable = vscode.commands.registerCommand('soar.helloWorld', () => {
    vscode.window.showInformationMessage('Hello from Soar Extension!');
  });
  context.subscriptions.push(disposable);

  // Initialize LSP client (Phase 3)
  lspClient.activate(context);

  // Register restart language server command
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.restartLanguageServer', async () => {
      vscode.window.showInformationMessage('Restarting Soar Language Server...');
      await lspClient.restart();
      vscode.window.showInformationMessage('Soar Language Server restarted');
    })
  );

  // Register create project command
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.createProject', async () => {
      const { ProjectCreator } = await import('./layout/projectCreator');

      // Get directory from user
      const directoryUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Directory',
        title: 'Select Directory for New Soar Project',
      });

      if (!directoryUri || directoryUri.length === 0) {
        return;
      }

      const directory = directoryUri[0].fsPath;

      // Get agent name from user
      const agentName = await vscode.window.showInputBox({
        prompt: 'Enter agent name',
        placeHolder: 'MyAgent',
        validateInput: value => {
          if (!value || value.trim().length === 0) {
            return 'Agent name cannot be empty';
          }
          if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
            return 'Agent name must start with a letter and contain only letters, numbers, hyphens, and underscores';
          }
          return null;
        },
      });

      if (!agentName) {
        return;
      }

      try {
        const projectFilePath = await ProjectCreator.createProject({
          directory,
          agentName,
        });

        vscode.window.showInformationMessage(`Successfully created Soar project: ${agentName}`);

        // Ask if user wants to open the project
        const openProject = await vscode.window.showInformationMessage(
          'Would you like to open the new project?',
          'Yes',
          'No'
        );

        if (openProject === 'Yes') {
          const projectFolder = path.dirname(projectFilePath);
          await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(projectFolder),
            false
          );
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
      }
    })
  );

  // Initialize Datamap Tree View
  const datamapProvider = new DatamapTreeProvider();
  datamapProviderGlobal = datamapProvider;
  const datamapTreeView = vscode.window.createTreeView('soarDatamap', {
    treeDataProvider: datamapProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(datamapTreeView);

  // Register project selection command
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.selectProject', async () => {
      const project = await projectManager.showProjectSelector();
    })
  );

  // Register commands for datamap tree
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.refreshDatamap', async () => {
      const activeProject = projectManager.getActiveProject();
      if (activeProject) {
        await datamapProvider.loadProjectFromFile(activeProject.projectFile);
      } else {
        // Fall back to old behavior
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          await datamapProvider.loadProject(workspaceFolders[0].uri);
        } else {
          vscode.window.showWarningMessage(
            'No workspace folder open. Use "Select Soar Project" command to choose a project.'
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.loadDatamap', async () => {
      const activeProject = projectManager.getActiveProject();
      if (activeProject) {
        await datamapProvider.loadProjectFromFile(activeProject.projectFile);
      } else {
        // Trigger project selection
        await vscode.commands.executeCommand('soar.selectProject');
      }
    })
  );

  // Register datamap CRUD commands
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.addAttribute', async treeItem => {
      const projectContext = datamapProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No datamap loaded');
        return;
      }

      const vertexId = treeItem?.vertexId || projectContext.project.datamap.rootId;
      const success = await DatamapOperations.addAttribute(projectContext, vertexId);
      if (success) {
        datamapProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.editAttribute', async (treeItem: DatamapTreeItem) => {
      const projectContext = datamapProvider.getProjectContext();
      if (!projectContext || !treeItem?.edgeName) {
        vscode.window.showWarningMessage('No attribute selected');
        return;
      }

      if (treeItem.edgeMetadata?.isLink) {
        vscode.window.showInformationMessage(
          'Linked attributes are read-only. Use "Reveal Link Owner" or "Remove Linked Attribute" instead.'
        );
        return;
      }

      const success = await DatamapOperations.editAttribute(
        projectContext,
        treeItem.vertexId,
        treeItem.edgeName
      );
      if (success) {
        datamapProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.deleteAttribute', async (treeItem: DatamapTreeItem) => {
      const projectContext = datamapProvider.getProjectContext();
      if (!projectContext || !treeItem?.edgeName) {
        vscode.window.showWarningMessage('No attribute selected');
        return;
      }

      if (treeItem.edgeMetadata?.isLink) {
        vscode.window.showInformationMessage(
          'Use "Remove Linked Attribute" to delete a link without affecting the shared vertex.'
        );
        return;
      }

      const success = await DatamapOperations.deleteAttribute(
        projectContext,
        treeItem.vertexId,
        treeItem.edgeName
      );
      if (success) {
        datamapProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.addLinkedAttribute', async treeItem => {
      const projectContext = datamapProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No datamap loaded');
        return;
      }

      const vertexId = treeItem?.vertexId || projectContext.project.datamap.rootId;
      const success = await DatamapOperations.addLinkedAttribute(projectContext, vertexId);
      if (success) {
        datamapProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.revealLinkedOwner', async (treeItem: DatamapTreeItem) => {
      const projectContext = datamapProvider.getProjectContext();
      if (!projectContext || !treeItem?.edgeMetadata) {
        vscode.window.showWarningMessage('No datamap loaded');
        return;
      }

      if (!treeItem.edgeMetadata.isLink) {
        vscode.window.showInformationMessage('Selected attribute is not a linked reference.');
        return;
      }

      const ownerId = treeItem.edgeMetadata.ownerParentId;
      if (!ownerId) {
        vscode.window.showWarningMessage('Could not determine owner for this link.');
        return;
      }

      datamapProvider.setDatamapRoot(ownerId);
      vscode.window.showInformationMessage(
        `Showing owner '${ownerId}' for '^${treeItem.edgeMetadata.edgeName}'`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'soar.deleteLinkedAttribute',
      async (treeItem: DatamapTreeItem) => {
        const projectContext = datamapProvider.getProjectContext();
        if (!projectContext || !treeItem?.edgeMetadata || !treeItem.edgeName) {
          vscode.window.showWarningMessage('No linked attribute selected');
          return;
        }

        if (!treeItem.edgeMetadata.isLink) {
          vscode.window.showInformationMessage(
            'Only linked attributes can be removed with this command.'
          );
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Remove link '^${treeItem.edgeMetadata.edgeName}' referencing ${treeItem.edgeMetadata.targetId}?`,
          { modal: true },
          'Remove Link'
        );

        if (confirm !== 'Remove Link') {
          return;
        }

        const success = await DatamapOperations.removeLinkedAttribute(
          projectContext,
          treeItem.edgeMetadata
        );
        if (success) {
          datamapProvider.refresh();
        }
      }
    )
  );

  // Initialize Layout Tree View
  const layoutProvider = new LayoutTreeProvider();
  layoutProviderGlobal = layoutProvider;
  const layoutTreeView = vscode.window.createTreeView('soarLayout', {
    treeDataProvider: layoutProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(layoutTreeView);

  const projectChangeDisposable = projectManager.onDidChangeActiveProject(project => {
    if (project) {
      void Promise.all([
        datamapProvider.loadProjectFromFile(project.projectFile),
        layoutProvider.loadProjectFromFile(project.projectFile),
      ]);
    }
  });
  context.subscriptions.push(projectChangeDisposable);

  // Register commands for layout tree
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.refreshLayout', async () => {
      const activeProject = projectManager.getActiveProject();
      if (activeProject) {
        await layoutProvider.loadProjectFromFile(activeProject.projectFile);
      } else {
        // Fall back to old behavior
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          await layoutProvider.loadProject(workspaceFolders[0].uri);
        } else {
          vscode.window.showWarningMessage(
            'No workspace folder open. Use "Select Soar Project" command to choose a project.'
          );
        }
      }
    })
  );

  // Register layout CRUD commands
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.addOperator', async treeItem => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No project loaded');
        return;
      }

      const nodeId = treeItem?.node?.id || projectContext.project.layout.id;
      const success = await LayoutOperations.addOperator(projectContext, nodeId);
      if (success) {
        // Reload both providers from the updated project file
        await layoutProvider.loadProjectFromFile(projectContext.projectFile);
        await datamapProvider.loadProjectFromFile(projectContext.projectFile);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.addFile', async (treeItem?: LayoutTreeItem) => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No project loaded');
        return;
      }

      const nodeId = treeItem?.node?.id || projectContext.project.layout.id;
      const folderPath = treeItem?.getFolderPath();
      const success = await LayoutOperations.addFile(
        projectContext,
        nodeId,
        treeItem?.node,
        folderPath
      );
      if (success) {
        layoutProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.addFolder', async treeItem => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No project loaded');
        return;
      }

      const nodeId = treeItem?.node?.id || projectContext.project.layout.id;
      const success = await LayoutOperations.addFolder(projectContext, nodeId);
      if (success) {
        layoutProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.renameNode', async treeItem => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext || !treeItem?.node) {
        vscode.window.showWarningMessage('No node selected');
        return;
      }

      const success = await LayoutOperations.renameNode(projectContext, treeItem.node.id);
      if (success) {
        layoutProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.deleteNode', async treeItem => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext || !treeItem?.node) {
        vscode.window.showWarningMessage('No node selected');
        return;
      }

      const parentNode = layoutProvider.getParentNode(treeItem.node.id);
      if (!parentNode) {
        vscode.window.showErrorMessage('Cannot delete root node');
        return;
      }

      const success = await LayoutOperations.deleteNode(
        projectContext,
        treeItem.node.id,
        parentNode.id
      );
      if (success) {
        layoutProvider.refresh();
        datamapProvider.refresh(); // Refresh both views
      }
    })
  );

  // Register view datamap command for layout nodes
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.viewDatamap', async treeItem => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext || !treeItem?.node) {
        vscode.window.showWarningMessage('No node selected');
        return;
      }

      // Get datamap ID - use null for root node (OPERATOR_ROOT)
      const datamapId =
        treeItem.node.type === 'OPERATOR_ROOT'
          ? null
          : 'dmId' in treeItem.node
            ? treeItem.node.dmId
            : null;

      // Check if node has a datamap (all nodes should, including root)
      if (datamapId === null && treeItem.node.type !== 'OPERATOR_ROOT') {
        vscode.window.showInformationMessage('This node does not have an associated datamap');
        return;
      }

      // Switch datamap view to this node's datamap
      datamapProvider.setDatamapRoot(datamapId);

      // Update layout view to highlight this node
      layoutProvider.setCurrentDatamap(datamapId);

      // Show success message
      const displayName = datamapId === null ? `${treeItem.node.name} (root)` : treeItem.node.name;
      vscode.window.showInformationMessage(`Viewing datamap for: ${displayName}`);
    })
  );

  // Register view root datamap command
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.viewRootDatamap', async () => {
      const projectContext = datamapProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No project loaded');
        return;
      }

      // Switch back to root datamap
      datamapProvider.setDatamapRoot(null);

      // Update layout view to highlight the root
      layoutProvider.setCurrentDatamap(null);

      vscode.window.showInformationMessage('Viewing root datamap');
    })
  );

  // Auto-discover and load projects
  (async () => {
    await projectManager.discoverProjects();
    await projectManager.restoreActiveProject();

    const activeProject = projectManager.getActiveProject();
    if (!activeProject) {
      // Try to auto-load from first workspace folder for backward compatibility
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        await layoutProvider.loadProject(vscode.workspace.workspaceFolders[0].uri);
        await datamapProvider.loadProject(vscode.workspace.workspaceFolders[0].uri);
      }
    }
  })();

  // Register project sync commands
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.findOrphanedFiles', async () => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No project loaded');
        return;
      }

      vscode.window.showInformationMessage('Scanning for orphaned .soar files...');

      const orphanedFiles = await ProjectSync.findOrphanedFiles(projectContext);
      const report = ProjectSync.generateOrphanedFilesReport(orphanedFiles);

      // Show report in output channel
      const outputChannel = vscode.window.createOutputChannel('Soar Project Sync');
      outputChannel.clear();
      outputChannel.appendLine(report);
      outputChannel.show();

      if (orphanedFiles.length > 0) {
        const action = await vscode.window.showInformationMessage(
          `Found ${orphanedFiles.length} orphaned .soar file(s). Would you like to add them to the project?`,
          'Add Files',
          'Cancel'
        );

        if (action === 'Add Files') {
          vscode.commands.executeCommand('soar.syncProjectFiles');
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.findMissingFiles', async () => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No project loaded');
        return;
      }

      vscode.window.showInformationMessage('Checking for missing files referenced in project...');

      const missingFiles = await ProjectSync.findMissingFiles(projectContext);

      // Show report in output channel
      const outputChannel = vscode.window.createOutputChannel('Soar Project Validation');
      outputChannel.clear();
      outputChannel.appendLine('=== Missing Files Report ===\n');
      outputChannel.appendLine(`Project: ${path.basename(projectContext.projectFile)}\n`);

      if (missingFiles.length === 0) {
        outputChannel.appendLine('✓ All files referenced in the project exist on disk.');
      } else {
        outputChannel.appendLine(`✗ Found ${missingFiles.length} missing file(s):\n`);
        for (const file of missingFiles) {
          outputChannel.appendLine(`  • ${file.relativePath}`);
          outputChannel.appendLine(`    Referenced in: ${file.referencedIn}\n`);
        }
      }

      outputChannel.show();

      // Show interactive dialog
      await ProjectSync.showMissingFilesDialog(projectContext, missingFiles);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('soar.syncProjectFiles', async () => {
      const projectContext = layoutProvider.getProjectContext();
      if (!projectContext) {
        vscode.window.showWarningMessage('No project loaded');
        return;
      }

      const orphanedFiles = await ProjectSync.findOrphanedFiles(projectContext);

      if (orphanedFiles.length === 0) {
        vscode.window.showInformationMessage(
          'No orphaned .soar files found. All files are in the project!'
        );
        return;
      }

      // Show selection dialog
      const selectedFiles = await ProjectSync.showOrphanedFilesDialog(
        projectContext,
        orphanedFiles
      );

      if (selectedFiles.length === 0) {
        return;
      }

      // Add files to project
      const addedCount = await ProjectSync.addOrphanedFilesToProject(projectContext, selectedFiles);

      if (addedCount > 0) {
        layoutProvider.refresh();
        vscode.window.showInformationMessage(`Added ${addedCount} file(s) to the project`);
      }
    })
  );

  // Register validate command
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.validateAgainstDatamap', async () => {
      await validateCurrentDocument();
    })
  );

  // Register validate selected project command
  context.subscriptions.push(
    vscode.commands.registerCommand('soar.validateSelectedProjectAgainstDatamap', async () => {
      await validateSelectedProject();
    })
  );

  // Auto-validate on file save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async document => {
      if (document.languageId === 'soar') {
        await validateDocument(document);
      }
    })
  );

  // Auto-validate on file open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async document => {
      if (document.languageId === 'soar') {
        await validateDocument(document);
      }
    })
  );

  // Validate all open Soar documents
  vscode.workspace.textDocuments.forEach(doc => {
    if (doc.languageId === 'soar') {
      validateDocument(doc);
    }
  });

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider('soar', {
      provideDefinition(document, position) {
        if (!isSourceScript(document.fileName)) {
          return null;
        }

        const result = sourceScriptAnalyzer.resolveDefinition(
          document.getText(),
          document.fileName,
          { line: position.line, character: position.character }
        );

        if (!result) {
          return null;
        }

        const targetUri = vscode.Uri.file(result.targetPath);
        return new vscode.Location(targetUri, new vscode.Position(0, 0));
      },
    })
  );

  // Return API for testing
  return {
    getProjectManager: () => projectManager,
  };
}

/**
 * Validate a single document against the datamap
 */
async function validateDocument(document: vscode.TextDocument): Promise<void> {
  const projectContext = datamapProviderGlobal.getProjectContext();

  if (!projectContext) {
    // No project loaded, clear diagnostics
    diagnosticsCollection.delete(document.uri);
    return;
  }

  try {
    // Parse the document
    const documentText = document.getText();

    if (isSourceScript(document.fileName)) {
      const sourceDiagnostics = sourceScriptAnalyzer.analyze(documentText, document.fileName);
      const diagnostics = sourceDiagnostics.map(diag => {
        const range = new vscode.Range(
          diag.range.start.line,
          diag.range.start.character,
          diag.range.end.line,
          diag.range.end.character
        );
        const vscodeDiag = new vscode.Diagnostic(
          range,
          diag.message,
          diag.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning
        );
        vscodeDiag.source = 'soar-source-script';
        return vscodeDiag;
      });

      diagnosticsCollection.set(document.uri, diagnostics);
      return;
    }

    const soarDoc = parser.parse(document.uri.toString(), documentText, document.version);

    // Validate against datamap
    const errors = validator.validateDocument(soarDoc, projectContext, documentText);

    // Create diagnostics
    const diagnostics = validator.createDiagnostics(errors, document);

    // Update diagnostics collection
    diagnosticsCollection.set(document.uri, diagnostics);

    // Show status message
    if (errors.length > 0) {
      vscode.window.setStatusBarMessage(
        `$(warning) ${errors.length} datamap validation issue(s) found`,
        3000
      );
    }
  } catch (error: any) {
    console.error('Validation error:', error);
  }
}

function isSourceScript(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('_source.soar');
}

/**
 * Validate the currently active document
 */
async function validateCurrentDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'soar') {
    vscode.window.showWarningMessage('No active Soar file');
    return;
  }

  const projectContext = datamapProviderGlobal.getProjectContext();
  if (!projectContext) {
    vscode.window.showWarningMessage('No datamap loaded. Load a project file first.');
    return;
  }

  await validateDocument(editor.document);

  const diagnostics = diagnosticsCollection.get(editor.document.uri);
  const errorCount = diagnostics?.length || 0;

  if (errorCount === 0) {
    vscode.window.showInformationMessage('✓ No datamap validation issues found');
  } else {
    vscode.window.showWarningMessage(
      `Found ${errorCount} datamap validation issue(s). Check the Problems panel.`
    );
  }
}

/**
 * Validate all Soar files in the selected/active project
 */
async function validateSelectedProject(): Promise<void> {
  const projectContext = datamapProviderGlobal.getProjectContext();
  if (!projectContext) {
    vscode.window.showWarningMessage('No project loaded. Load a project file first.');
    return;
  }

  // Get the project directory
  const projectDir = path.dirname(projectContext.projectFile);

  // Collect all files referenced in the project layout
  const projectFiles = ProjectSync['collectProjectFiles'](projectContext.project.layout);

  if (projectFiles.length === 0) {
    vscode.window.showInformationMessage('No Soar files found in project');
    return;
  }

  // Convert relative paths to absolute URIs
  const soarFileUris: vscode.Uri[] = [];
  for (const relPath of projectFiles) {
    if (relPath.endsWith('.soar')) {
      const absPath = path.resolve(projectDir, relPath);
      try {
        // Check if file exists before adding
        await fs.promises.access(absPath);
        soarFileUris.push(vscode.Uri.file(absPath));
      } catch (error) {
        console.warn(`Project file not found: ${absPath}`);
      }
    }
  }

  if (soarFileUris.length === 0) {
    vscode.window.showInformationMessage('No Soar files found in project');
    return;
  }

  let totalErrors = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Validating project files against datamap',
      cancellable: false,
    },
    async progress => {
      for (let i = 0; i < soarFileUris.length; i++) {
        const fileUri = soarFileUris[i];
        progress.report({
          increment: 100 / soarFileUris.length,
          message: `${i + 1}/${soarFileUris.length}: ${path.basename(fileUri.fsPath)}`,
        });

        const document = await vscode.workspace.openTextDocument(fileUri);
        await validateDocument(document);

        const diagnostics = diagnosticsCollection.get(document.uri);
        totalErrors += diagnostics?.length || 0;
      }
    }
  );

  const projectName = path.basename(projectContext.projectFile, '.vsa.json');

  if (totalErrors === 0) {
    vscode.window.showInformationMessage(
      `✓ Validated ${soarFileUris.length} file(s) in project "${projectName}". No datamap issues found.`
    );
  } else {
    vscode.window.showWarningMessage(
      `Validated ${soarFileUris.length} file(s) in project "${projectName}". Found ${totalErrors} datamap issue(s). Check the Problems panel.`
    );
  }
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export function deactivate() {
  console.log('Soar extension is now deactivated');
  // Cleanup LSP client (Phase 3)
  return lspClient.deactivate();
}
