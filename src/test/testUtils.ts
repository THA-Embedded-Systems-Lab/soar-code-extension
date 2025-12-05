import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Test utilities for VS Code LSP extension testing
 */
export class TestHelper {
  /**
   * Wait for the language server to be ready by attempting test requests
   */
  static async waitForLanguageServer(
    testUri: vscode.Uri,
    maxWaitMs: number = 10000
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Try a simple completion request to check if server is ready
        const testPos = new vscode.Position(0, 0);
        await vscode.commands.executeCommand(
          'vscode.executeCompletionItemProvider',
          testUri,
          testPos
        );
        return; // Success!
      } catch {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error('Language server did not become ready in time');
  }

  /**
   * Wait for diagnostics to be published for a document
   */
  static async waitForDiagnostics(
    uri: vscode.Uri,
    timeout: number = 5000
  ): Promise<vscode.Diagnostic[]> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      if (diagnostics.length > 0) {
        return diagnostics;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return vscode.languages.getDiagnostics(uri);
  }

  /**
   * Activate the extension and get the API
   */
  static async activateExtension(): Promise<any> {
    const extension = vscode.extensions.getExtension('tha-embedded-systems-lab.soar');
    if (!extension) {
      throw new Error('Extension not found');
    }

    let api: any;
    if (!extension.isActive) {
      api = await extension.activate();
    } else {
      api = extension.exports;
    }

    // Wait for extension activation
    await new Promise(resolve => setTimeout(resolve, 1000));

    return api;
  }

  /**
   * Setup a test project by discovering and activating it
   */
  static async setupTestProject(projectManager: any, projectFilePath: string): Promise<void> {
    // Discover projects first
    await projectManager.discoverProjects();

    // Find and set our test project
    const projects = projectManager.getDiscoveredProjects();
    const testProject = projects.find((p: any) => p.projectFile === projectFilePath);

    if (testProject) {
      await projectManager.setActiveProject(testProject);
    } else {
      // If not discovered, manually create a project info and set it
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      const manualProject: any = {
        projectFile: projectFilePath,
        displayName: path.basename(projectFilePath, '.vsa.json'),
        relativePath: path.relative(workspaceFolder.uri.fsPath, projectFilePath),
        workspaceFolder,
      };
      await projectManager.setActiveProject(manualProject);
    }
  }

  /**
   * Create an in-memory test document with the given content
   */
  static async createTestDocument(
    content: string,
    language: string = 'soar'
  ): Promise<vscode.TextDocument> {
    const doc = await vscode.workspace.openTextDocument({
      language: language,
      content: content,
    });
    return doc;
  }

  /**
   * Get completions at a specific position
   */
  static async getCompletionsAt(
    uri: vscode.Uri,
    position: vscode.Position
  ): Promise<vscode.CompletionList | vscode.CompletionItem[]> {
    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      uri,
      position
    );
    return result || [];
  }

  /**
   * Extract completion labels from completion results
   */
  static getCompletionLabels(
    completions: vscode.CompletionList | vscode.CompletionItem[]
  ): string[] {
    const items = Array.isArray(completions) ? completions : completions.items;
    return items.map(item => (typeof item.label === 'string' ? item.label : item.label.label));
  }

  /**
   * Get only datamap property completions (from LSP, not text-based)
   */
  static getDatamapCompletions(
    completions: vscode.CompletionList | vscode.CompletionItem[]
  ): string[] {
    const items = Array.isArray(completions) ? completions : completions.items;
    // Filter for Property kind completions (datamap attributes from LSP)
    return items
      .filter(item => item.kind === vscode.CompletionItemKind.Property)
      .map(item => (typeof item.label === 'string' ? item.label : item.label.label));
  }

  /**
   * Assert that completions contain expected items
   */
  static assertCompletionContains(
    completions: vscode.CompletionList | vscode.CompletionItem[],
    expected: string[],
    message?: string
  ): void {
    const labels = TestHelper.getCompletionLabels(completions);
    const missing = expected.filter(e => !labels.includes(e));

    if (missing.length > 0) {
      const errorMsg =
        message ||
        `Missing completions: ${missing.join(', ')}. Got: ${labels.slice(0, 20).join(', ')}`;
      throw new Error(errorMsg);
    }
  }

  /**
   * Assert that completions do not contain unexpected items
   */
  static assertCompletionExcludes(
    completions: vscode.CompletionList | vscode.CompletionItem[],
    excluded: string[],
    message?: string
  ): void {
    const labels = TestHelper.getCompletionLabels(completions);
    const found = excluded.filter(e => labels.includes(e));

    if (found.length > 0) {
      const errorMsg =
        message ||
        `Unexpected completions found: ${found.join(', ')}. All: ${labels.slice(0, 20).join(', ')}`;
      throw new Error(errorMsg);
    }
  }

  /**
   * Insert test content at a specific line and wait for processing
   */
  static async insertTestContent(
    uri: vscode.Uri,
    line: number,
    content: string,
    waitMs: number = 500
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(line, 0), content);
    await vscode.workspace.applyEdit(edit);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  /**
   * Delete content at a specific line range
   */
  static async deleteTestContent(
    uri: vscode.Uri,
    startLine: number,
    endLine: number
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    edit.delete(
      uri,
      new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, 0))
    );
    await vscode.workspace.applyEdit(edit);
  }

  /**
   * Save document and wait for LSP processing
   */
  static async saveAndWait(document: vscode.TextDocument, waitMs: number = 1500): Promise<void> {
    await document.save();
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}
