import * as vscode from 'vscode';
import * as lspClient from './client/lspClient';
import { DatamapTreeProvider } from './datamap/datamapTreeProvider';
import { DatamapValidator } from './datamap/datamapValidator';
import { DatamapOperations } from './datamap/datamapOperations';
import { LayoutTreeProvider } from './layout/layoutTreeProvider';
import { LayoutOperations } from './layout/layoutOperations';
import { ProjectSync } from './layout/projectSync';
import { SoarParser } from './server/soarParser';

// Global validator and diagnostics collection
let validator: DatamapValidator;
let diagnosticsCollection: vscode.DiagnosticCollection;
let datamapProviderGlobal: DatamapTreeProvider;
let layoutProviderGlobal: LayoutTreeProvider;
let parser: SoarParser;

/**
 * Extension activation function
 * Called when the extension is activated (when a .soar file is opened)
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Soar extension is now active');

    // Initialize validator and parser
    validator = new DatamapValidator();
    parser = new SoarParser();
    diagnosticsCollection = vscode.languages.createDiagnosticCollection('soar-datamap');
    context.subscriptions.push(diagnosticsCollection);

    // Register a simple command to verify the extension works
    const disposable = vscode.commands.registerCommand('soar.helloWorld', () => {
        vscode.window.showInformationMessage('Hello from Soar Extension!');
    });
    context.subscriptions.push(disposable);

    // Initialize LSP client (Phase 3)
    lspClient.activate(context);

    // Initialize Datamap Tree View
    const datamapProvider = new DatamapTreeProvider();
    datamapProviderGlobal = datamapProvider;
    const datamapTreeView = vscode.window.createTreeView('soarDatamap', {
        treeDataProvider: datamapProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(datamapTreeView);

    // Register commands for datamap tree
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.refreshDatamap', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                await datamapProvider.loadProject(workspaceFolders[0].uri);
            } else {
                vscode.window.showWarningMessage('No workspace folder open');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('soar.loadDatamap', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                await datamapProvider.loadProject(workspaceFolders[0].uri);
            } else {
                vscode.window.showWarningMessage('No workspace folder open');
            }
        })
    );

    // Register datamap CRUD commands
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.addAttribute', async (treeItem) => {
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
        vscode.commands.registerCommand('soar.editAttribute', async (treeItem) => {
            const projectContext = datamapProvider.getProjectContext();
            if (!projectContext || !treeItem?.edgeName) {
                vscode.window.showWarningMessage('No attribute selected');
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
        vscode.commands.registerCommand('soar.deleteAttribute', async (treeItem) => {
            const projectContext = datamapProvider.getProjectContext();
            if (!projectContext || !treeItem?.edgeName) {
                vscode.window.showWarningMessage('No attribute selected');
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

    // Initialize Layout Tree View
    const layoutProvider = new LayoutTreeProvider();
    layoutProviderGlobal = layoutProvider;
    const layoutTreeView = vscode.window.createTreeView('soarLayout', {
        treeDataProvider: layoutProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(layoutTreeView);

    // Register commands for layout tree
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.refreshLayout', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                await layoutProvider.loadProject(workspaceFolders[0].uri);
            } else {
                vscode.window.showWarningMessage('No workspace folder open');
            }
        })
    );

    // Register layout CRUD commands
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.addOperator', async (treeItem) => {
            const projectContext = layoutProvider.getProjectContext();
            if (!projectContext) {
                vscode.window.showWarningMessage('No project loaded');
                return;
            }

            const nodeId = treeItem?.node?.id || projectContext.project.layout.id;
            const success = await LayoutOperations.addOperator(projectContext, nodeId);
            if (success) {
                layoutProvider.refresh();
                datamapProvider.refresh(); // Refresh both views
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('soar.addSubstate', async (treeItem) => {
            const projectContext = layoutProvider.getProjectContext();
            if (!projectContext) {
                vscode.window.showWarningMessage('No project loaded');
                return;
            }

            const nodeId = treeItem?.node?.id || projectContext.project.layout.id;
            const success = await LayoutOperations.addSubstate(projectContext, nodeId);
            if (success) {
                layoutProvider.refresh();
                datamapProvider.refresh(); // Refresh both views
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('soar.addFile', async (treeItem) => {
            const projectContext = layoutProvider.getProjectContext();
            if (!projectContext) {
                vscode.window.showWarningMessage('No project loaded');
                return;
            }

            const nodeId = treeItem?.node?.id || projectContext.project.layout.id;
            const success = await LayoutOperations.addFile(projectContext, nodeId);
            if (success) {
                layoutProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('soar.addFolder', async (treeItem) => {
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
        vscode.commands.registerCommand('soar.renameNode', async (treeItem) => {
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
        vscode.commands.registerCommand('soar.deleteNode', async (treeItem) => {
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

            const success = await LayoutOperations.deleteNode(projectContext, treeItem.node.id, parentNode.id);
            if (success) {
                layoutProvider.refresh();
                datamapProvider.refresh(); // Refresh both views
            }
        })
    );

    // Auto-load layout if project file exists
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        layoutProvider.loadProject(vscode.workspace.workspaceFolders[0].uri);
    }

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
        vscode.commands.registerCommand('soar.syncProjectFiles', async () => {
            const projectContext = layoutProvider.getProjectContext();
            if (!projectContext) {
                vscode.window.showWarningMessage('No project loaded');
                return;
            }

            const orphanedFiles = await ProjectSync.findOrphanedFiles(projectContext);

            if (orphanedFiles.length === 0) {
                vscode.window.showInformationMessage('No orphaned .soar files found. All files are in the project!');
                return;
            }

            // Show selection dialog
            const selectedFiles = await ProjectSync.showOrphanedFilesDialog(projectContext, orphanedFiles);

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

    // Register validate workspace command
    context.subscriptions.push(
        vscode.commands.registerCommand('soar.validateWorkspaceAgainstDatamap', async () => {
            await validateWorkspace();
        })
    );

    // Auto-validate on file save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId === 'soar') {
                await validateDocument(document);
            }
        })
    );

    // Auto-validate on file open
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId === 'soar') {
                await validateDocument(document);
            }
        })
    );

    // Auto-load datamap if project file exists
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        datamapProvider.loadProject(vscode.workspace.workspaceFolders[0].uri);
    }

    // Validate all open Soar documents
    vscode.workspace.textDocuments.forEach(doc => {
        if (doc.languageId === 'soar') {
            validateDocument(doc);
        }
    });
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
        const soarDoc = parser.parse(document.uri.toString(), document.getText(), document.version);

        // Validate against datamap
        const errors = validator.validateDocument(soarDoc, projectContext);

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
 * Validate all Soar files in the workspace
 */
async function validateWorkspace(): Promise<void> {
    const projectContext = datamapProviderGlobal.getProjectContext();
    if (!projectContext) {
        vscode.window.showWarningMessage('No datamap loaded. Load a project file first.');
        return;
    }

    const soarFiles = await vscode.workspace.findFiles('**/*.soar', '**/node_modules/**');

    if (soarFiles.length === 0) {
        vscode.window.showInformationMessage('No Soar files found in workspace');
        return;
    }

    let totalErrors = 0;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Validating Soar files against datamap',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < soarFiles.length; i++) {
            const file = soarFiles[i];
            progress.report({
                increment: (100 / soarFiles.length),
                message: `${i + 1}/${soarFiles.length}: ${file.fsPath.split('/').pop()}`
            });

            const document = await vscode.workspace.openTextDocument(file);
            await validateDocument(document);

            const diagnostics = diagnosticsCollection.get(document.uri);
            totalErrors += diagnostics?.length || 0;
        }
    });

    if (totalErrors === 0) {
        vscode.window.showInformationMessage(
            `✓ Validated ${soarFiles.length} file(s). No datamap issues found.`
        );
    } else {
        vscode.window.showWarningMessage(
            `Validated ${soarFiles.length} file(s). Found ${totalErrors} datamap issue(s). Check the Problems panel.`
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
