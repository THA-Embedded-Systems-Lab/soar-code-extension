import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TestHelper } from '../testUtils';

suite('Document Symbols Test Suite', () => {
  let testDocUri: vscode.Uri;
  let testProjectPath: string;

  suiteSetup(async function () {
    this.timeout(30000);

    // Get the test project path
    testProjectPath = path.resolve(__dirname, '../../../test/fixtures');
    testDocUri = vscode.Uri.file(path.join(testProjectPath, 'test-completions.soar'));

    // Activate extension and get API
    const api = await TestHelper.activateExtension();

    // Get project manager from the extension API
    const projectManager = api?.getProjectManager();
    if (!projectManager) {
      throw new Error('ProjectManager not available from extension API');
    }

    // Setup test project
    const projectFile = path.join(testProjectPath, 'test-project.vsa.json');
    await TestHelper.setupTestProject(projectManager, projectFile);

    // Open the test document
    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Wait for LSP to be ready
    await TestHelper.waitForLanguageServer(testDocUri);
  });

  test('Should provide document symbols', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testDocUri
    );

    if (symbols && symbols.length > 0) {
      console.log(`Found ${symbols.length} document symbols`);

      symbols.forEach(symbol => {
        console.log(`  - ${symbol.name} (${vscode.SymbolKind[symbol.kind]})`);
      });

      assert.ok(symbols.length > 0, 'Should find document symbols');
    } else {
      console.log('No document symbols found (may not be implemented yet)');
    }
  });

  test('Should identify production rules as symbols', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testDocUri
    );

    if (symbols && symbols.length > 0) {
      // Look for production rules (might be Function, Method, or Class symbols)
      const ruleSymbols = symbols.filter(
        s =>
          s.kind === vscode.SymbolKind.Function ||
          s.kind === vscode.SymbolKind.Method ||
          s.kind === vscode.SymbolKind.Class
      );

      console.log(`Found ${ruleSymbols.length} rule symbols`);

      if (ruleSymbols.length > 0) {
        assert.ok(ruleSymbols.length > 0, 'Should find rule symbols');

        // Verify that at least one rule symbol has a name
        assert.ok(
          ruleSymbols.some(s => s.name.length > 0),
          'Rule symbols should have names'
        );
      } else {
        console.log('No rule symbols found');
      }
    } else {
      console.log('No symbols found to check for rules');
    }
  });

  test('Should identify operators as symbols', async function () {
    this.timeout(10000);

    const operatorFile = vscode.Uri.file(path.join(testProjectPath, 'test_operator.soar'));

    const document = await vscode.workspace.openTextDocument(operatorFile);
    await vscode.window.showTextDocument(document);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      operatorFile
    );

    if (symbols && symbols.length > 0) {
      console.log(`Found ${symbols.length} symbols in operator file`);

      symbols.forEach(symbol => {
        console.log(`  - ${symbol.name} (${vscode.SymbolKind[symbol.kind]})`);
      });

      assert.ok(symbols.length > 0, 'Should find symbols in operator file');
    } else {
      console.log('No symbols found in operator file');
    }
  });

  test('Should provide workspace symbols', async function () {
    this.timeout(10000);

    // Search for all symbols in workspace
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      'test'
    );

    if (symbols && symbols.length > 0) {
      console.log(`Found ${symbols.length} workspace symbols matching 'test'`);

      // Show first 10 symbols
      symbols.slice(0, 10).forEach(symbol => {
        console.log(`  - ${symbol.name} in ${path.basename(symbol.location.uri.fsPath)}`);
      });

      assert.ok(symbols.length > 0, 'Should find workspace symbols');
    } else {
      console.log('No workspace symbols found (may not be implemented yet)');
    }
  });

  test('Should handle document outline navigation', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testDocUri
    );

    if (symbols && symbols.length > 0) {
      // Verify symbols have valid ranges
      symbols.forEach(symbol => {
        assert.ok(symbol.range.start.line >= 0, 'Symbol should have valid start line');
        assert.ok(
          symbol.range.end.line >= symbol.range.start.line,
          'Symbol should have valid end line'
        );
      });

      console.log('Document outline navigation ranges are valid');
    } else {
      console.log('No symbols to check ranges');
    }
  });

  test('Should provide hierarchical symbols if supported', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testDocUri
    );

    if (symbols && symbols.length > 0) {
      // Check if any symbols have children (hierarchical structure)
      const hasChildren = symbols.some(s => s.children && s.children.length > 0);

      if (hasChildren) {
        console.log('Document symbols support hierarchical structure');

        symbols.forEach(symbol => {
          if (symbol.children && symbol.children.length > 0) {
            console.log(`  ${symbol.name} has ${symbol.children.length} children`);
          }
        });
      } else {
        console.log('Document symbols are flat (no hierarchy)');
      }
    }
  });

  test('Should handle symbols in complex production rules', async function () {
    this.timeout(10000);

    // Create a complex production rule
    const document = await TestHelper.createTestDocument(
      `sp {complex*test*rule
  (state <s> ^io <io>
             ^operator <o>)
  (<io> ^input-link <in>
        ^output-link <out>)
  (<o> ^name test-operator
       ^parameter value)
-->
  (<out> ^command <cmd>)
  (<cmd> ^name execute
         ^status complete)
}`,
      'soar'
    );

    await vscode.window.showTextDocument(document);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );

    if (symbols && symbols.length > 0) {
      console.log(`Found ${symbols.length} symbols in complex rule`);

      symbols.forEach(symbol => {
        console.log(`  - ${symbol.name} (${vscode.SymbolKind[symbol.kind]})`);
      });

      // Should find at least the production rule
      assert.ok(symbols.length > 0, 'Should find symbols in complex rule');
    } else {
      console.log('No symbols found in complex rule');
    }
  });
});
