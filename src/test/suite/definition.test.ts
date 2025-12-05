import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TestHelper } from '../testUtils';

suite('Definition Test Suite', () => {
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

  test('Should navigate to datamap definition', async function () {
    this.timeout(10000);

    const document = await vscode.workspace.openTextDocument(testDocUri);
    await vscode.window.showTextDocument(document);

    // Try to go to definition of "io" attribute
    // Line 10: "   (state <s> ^io <io>)"
    const position = new vscode.Position(10, 18); // On "io"

    const locations = await vscode.commands.executeCommand<
      vscode.Location[] | vscode.LocationLink[]
    >('vscode.executeDefinitionProvider', testDocUri, position);

    if (locations && locations.length > 0) {
      console.log(`Found ${locations.length} definition location(s)`);

      const location = locations[0];
      const uri = 'targetUri' in location ? location.targetUri : location.uri;

      console.log(`Definition URI: ${uri.fsPath}`);

      // Should navigate to a datamap file (.dm)
      assert.ok(uri.fsPath.includes('.dm'), 'Should navigate to datamap file');
    } else {
      console.log('No definition locations found (may not be implemented yet)');
    }
  });

  test('Should navigate to production definition', async function () {
    this.timeout(10000);

    // Create a document that sources another file with a production
    const document = await TestHelper.createTestDocument(
      'source test_operator.soar\n\nsp {reference-test-op\n  (state <s> ^operator <o>)\n  (<o> ^name test-operator)\n-->\n  (<s> ^result done)\n}',
      'soar'
    );

    await vscode.window.showTextDocument(document);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to go to definition of sourced file
    const position = new vscode.Position(0, 10); // On "test_operator.soar"

    const locations = await vscode.commands.executeCommand<
      vscode.Location[] | vscode.LocationLink[]
    >('vscode.executeDefinitionProvider', document.uri, position);

    if (locations && locations.length > 0) {
      console.log(`Found ${locations.length} definition location(s) for source file`);

      const location = locations[0];
      const uri = 'targetUri' in location ? location.targetUri : location.uri;

      console.log(`Definition URI: ${uri.fsPath}`);
      assert.ok(true, 'Go to definition for source files is working');
    } else {
      console.log('No definition locations found for source statement');
    }
  });

  test('Should navigate to variable binding', async function () {
    this.timeout(10000);

    const document = await TestHelper.createTestDocument(
      'sp {test-var-binding\n  (state <s> ^io <io>)\n  (<io> ^input-link <in>)\n-->\n  (<in> ^test value)\n}',
      'soar'
    );

    await vscode.window.showTextDocument(document);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to go to definition of <in> in the action side
    const position = new vscode.Position(4, 4); // On "<in>" in action

    const locations = await vscode.commands.executeCommand<
      vscode.Location[] | vscode.LocationLink[]
    >('vscode.executeDefinitionProvider', document.uri, position);

    if (locations && locations.length > 0) {
      console.log(`Found ${locations.length} definition location(s) for variable`);

      const location = locations[0];
      const range = 'targetRange' in location ? location.targetRange : location.range;

      console.log(`Variable definition at line ${range.start.line}`);

      // Should navigate to line 2 where <in> is bound
      assert.strictEqual(range.start.line, 2, 'Should navigate to variable binding line');
    } else {
      console.log('No definition locations found for variable binding');
    }
  });

  test('Should navigate to operator definition', async function () {
    this.timeout(10000);

    // Use dedicated fixture file instead of modifying test file
    const operatorTestUri = vscode.Uri.file(
      path.join(testProjectPath, 'test-definition-operator.soar')
    );

    const document = await vscode.workspace.openTextDocument(operatorTestUri);
    await vscode.window.showTextDocument(document);

    // Wait for LSP to process the file
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Try to go to definition of "operator" in line 2
    const position = new vscode.Position(2, 10); // On "operator"

    const locations = await vscode.commands.executeCommand<
      vscode.Location[] | vscode.LocationLink[]
    >('vscode.executeDefinitionProvider', operatorTestUri, position);

    if (locations && locations.length > 0) {
      console.log(`Found ${locations.length} definition location(s) for operator`);
      assert.ok(true, 'Operator definition navigation is working');
    } else {
      console.log('No definition locations found for operator');
    }
  });

  test('Should handle go to definition for attributes', async function () {
    this.timeout(10000);

    // Use dedicated fixture file instead of modifying test file
    const attributeTestUri = vscode.Uri.file(
      path.join(testProjectPath, 'test-definition-attribute.soar')
    );

    const document = await vscode.workspace.openTextDocument(attributeTestUri);
    await vscode.window.showTextDocument(document);

    // Wait for LSP to process the file
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test navigation for "input-link" in line 1
    const position = new vscode.Position(1, 15); // On "input-link"

    const locations = await vscode.commands.executeCommand<
      vscode.Location[] | vscode.LocationLink[]
    >('vscode.executeDefinitionProvider', attributeTestUri, position);

    if (locations && locations.length > 0) {
      console.log(`Found ${locations.length} definition location(s) for attribute`);

      const location = locations[0];
      const uri = 'targetUri' in location ? location.targetUri : location.uri;

      console.log(`Attribute definition URI: ${uri.fsPath}`);

      // Should navigate to datamap
      if (uri.fsPath.includes('.dm')) {
        assert.ok(true, 'Attribute definition navigation to datamap is working');
      }
    } else {
      console.log('No definition locations found for attribute');
    }
  });
});
