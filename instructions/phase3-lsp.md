# Phase 3: TypeScript LSP Implementation

## Objective

Implement a native TypeScript Language Server Protocol (LSP) server for Soar, providing IDE features including diagnostics, hover information, code completion, and go-to-definition functionality. This replaces the Java-based external server with an integrated TypeScript solution for easier maintenance and distribution.

## Prerequisites

- Completed Phase 1 (Project scaffolding)
- Completed Phase 2 (Syntax highlighting)
- Understanding of Language Server Protocol (LSP)
- Familiarity with TypeScript and VS Code extension development
- Access to the SoarTech Soar Language Server repository (as reference)

## Background

The Language Server Protocol enables language-specific features in editors. Instead of using an external Java-based server, we'll implement a TypeScript LSP server that runs in the same process as the extension, providing:

- **Diagnostics**: Parse errors and semantic warnings
- **Hover**: Documentation and production information
- **Completion**: Context-aware code suggestions
- **Go to Definition**: Navigate to production definitions
- **Find References**: Find all uses of a symbol
- **Document Symbols**: Outline view of productions

### Why TypeScript LSP?

**Advantages:**
- No external dependencies (no Java required)
- Easier to maintain and debug
- Faster startup time
- Direct integration with extension
- Easier distribution via VS Code Marketplace
- Shared code with datamap logic

**Reference:**
We'll use the SoarTech Java LSP as a reference for features and behavior: https://github.com/soartech/soar-language-server

## Steps

### 3.1 Install LSP Dependencies

Install the required LSP libraries:

```bash
npm install vscode-languageclient vscode-languageserver vscode-languageserver-textdocument
```

Install development dependencies:

```bash
npm install --save-dev @types/node
```

### 3.2 Create Soar Parser Types

Create `src/server/soarTypes.ts` for core Soar data structures:

```typescript
/**
 * Core types for Soar language structures
 */

export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface Location {
    uri: string;
    range: Range;
}

export enum ProductionType {
    SP = 'sp',  // Soar production
    GP = 'gp'   // Goal production
}

export interface SoarVariable {
    name: string;
    range: Range;
    references: Range[];
}

export interface SoarAttribute {
    name: string;
    range: Range;
    value?: string;
    isNegated: boolean;
}

export interface SoarCondition {
    range: Range;
    variables: SoarVariable[];
    attributes: SoarAttribute[];
    tests: SoarTest[];
}

export interface SoarAction {
    range: Range;
    attributes: SoarAttribute[];
    functionCalls: SoarFunctionCall[];
}

export interface SoarTest {
    operator: string;  // <, >, <=, >=, <>, =, etc.
    value: string;
    range: Range;
}

export interface SoarFunctionCall {
    name: string;
    args: string[];
    range: Range;
}

export interface SoarProduction {
    name: string;
    type: ProductionType;
    range: Range;
    nameRange: Range;
    documentation?: string;
    conditions: SoarCondition[];
    actions: SoarAction[];
    variables: Map<string, SoarVariable>;
}

export interface SoarDocument {
    uri: string;
    version: number;
    content: string;
    productions: SoarProduction[];
    errors: SoarDiagnostic[];
}

export interface SoarDiagnostic {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    source: string;
}

export enum DiagnosticSeverity {
    Error = 1,
    Warning = 2,
    Information = 3,
    Hint = 4
}
```

### 3.3 Create Soar Parser

Create `src/server/soarParser.ts` for parsing Soar code:

```typescript
import { SoarDocument, SoarProduction, ProductionType, SoarDiagnostic, DiagnosticSeverity, Range, Position } from './soarTypes';

/**
 * Simple Soar parser for LSP features
 * Uses regex-based parsing for simplicity
 */
export class SoarParser {
    
    parse(uri: string, content: string, version: number): SoarDocument {
        const document: SoarDocument = {
            uri,
            version,
            content,
            productions: [],
            errors: []
        };

        try {
            this.parseProductions(content, document);
        } catch (error) {
            document.errors.push({
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                message: `Parse error: ${error}`,
                severity: DiagnosticSeverity.Error,
                source: 'soar-parser'
            });
        }

        return document;
    }

    private parseProductions(content: string, document: SoarDocument): void {
        // Match sp {...} or gp {...} blocks
        const productionRegex = /\b(sp|gp)\s*\{\s*([a-zA-Z][a-zA-Z0-9_*-]*)/g;
        const lines = content.split('\n');
        let match;

        while ((match = productionRegex.exec(content)) !== null) {
            const type = match[1] as 'sp' | 'gp';
            const name = match[2];
            const startOffset = match.index;
            
            // Find the production's extent
            const productionRange = this.findProductionRange(content, startOffset, lines);
            const nameRange = this.offsetToRange(content, match.index + match[1].length, match.index + match[0].length, lines);
            
            // Extract production body
            const productionText = content.substring(
                this.rangeToOffset(content, productionRange.start),
                this.rangeToOffset(content, productionRange.end)
            );

            const production: SoarProduction = {
                name,
                type: type === 'sp' ? ProductionType.SP : ProductionType.GP,
                range: productionRange,
                nameRange,
                conditions: [],
                actions: [],
                variables: new Map()
            };

            // Parse production body
            this.parseProductionBody(productionText, production, productionRange.start);
            
            document.productions.push(production);
        }
    }

    private findProductionRange(content: string, startOffset: number, lines: string[]): Range {
        // Find matching closing brace
        let braceCount = 0;
        let inBraces = false;
        let endOffset = startOffset;

        for (let i = startOffset; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
                braceCount++;
                inBraces = true;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && inBraces) {
                    endOffset = i + 1;
                    break;
                }
            }
        }

        return {
            start: this.offsetToPosition(content, startOffset, lines),
            end: this.offsetToPosition(content, endOffset, lines)
        };
    }

    private parseProductionBody(body: string, production: SoarProduction, basePosition: Position): void {
        // Find the --> separator
        const arrowIndex = body.indexOf('-->');
        
        if (arrowIndex === -1) {
            // No arrow found - syntax error
            return;
        }

        const conditionsText = body.substring(0, arrowIndex);
        const actionsText = body.substring(arrowIndex + 3);

        // Parse variables
        this.parseVariables(body, production, basePosition);
        
        // Parse conditions and actions
        // (Simplified - real implementation would be more comprehensive)
        production.conditions.push({
            range: { start: basePosition, end: basePosition },
            variables: [],
            attributes: [],
            tests: []
        });

        production.actions.push({
            range: { start: basePosition, end: basePosition },
            attributes: [],
            functionCalls: []
        });
    }

    private parseVariables(text: string, production: SoarProduction, basePosition: Position): void {
        const variableRegex = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;
        let match;

        while ((match = variableRegex.exec(text)) !== null) {
            const varName = match[1];
            const range: Range = {
                start: { line: basePosition.line, character: match.index },
                end: { line: basePosition.line, character: match.index + match[0].length }
            };

            if (!production.variables.has(varName)) {
                production.variables.set(varName, {
                    name: varName,
                    range,
                    references: []
                });
            } else {
                production.variables.get(varName)!.references.push(range);
            }
        }
    }

    private offsetToPosition(content: string, offset: number, lines: string[]): Position {
        let currentOffset = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineLength = lines[i].length + 1; // +1 for newline
            if (currentOffset + lineLength > offset) {
                return { line: i, character: offset - currentOffset };
            }
            currentOffset += lineLength;
        }
        return { line: lines.length - 1, character: 0 };
    }

    private offsetToRange(content: string, startOffset: number, endOffset: number, lines: string[]): Range {
        return {
            start: this.offsetToPosition(content, startOffset, lines),
            end: this.offsetToPosition(content, endOffset, lines)
        };
    }

    private rangeToOffset(content: string, position: Position): number {
        const lines = content.split('\n');
        let offset = 0;
        for (let i = 0; i < position.line && i < lines.length; i++) {
            offset += lines[i].length + 1;
        }
        return offset + position.character;
    }
}
```

### 3.4 Create LSP Server

Create `src/server/soarLanguageServer.ts` for the main server implementation:

```typescript
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    Hover,
    MarkupKind,
    Definition,
    Location as LSPLocation,
    SymbolInformation,
    SymbolKind,
    DocumentSymbolParams
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SoarParser } from './soarParser';
import { SoarDocument } from './soarTypes';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Create parser instance
const parser = new SoarParser();

// Cache for parsed documents
const documentCache = new Map<string, SoarDocument>();

connection.onInitialize((params: InitializeParams) => {
    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['^', '<', '(', ' ']
            },
            hoverProvider: true,
            definitionProvider: true,
            documentSymbolProvider: true,
            referencesProvider: true
        }
    };
    return result;
});

connection.onInitialized(() => {
    connection.console.log('Soar Language Server initialized');
});

// Document change handler
documents.onDidChangeContent(change => {
    validateDocument(change.document);
});

// Document close handler
documents.onDidClose(e => {
    documentCache.delete(e.document.uri);
});

async function validateDocument(textDocument: TextDocument): Promise<void> {
    const text = textDocument.getText();
    const soarDoc = parser.parse(textDocument.uri, text, textDocument.version);
    
    // Cache the parsed document
    documentCache.set(textDocument.uri, soarDoc);

    // Send diagnostics
    const diagnostics = soarDoc.errors.map(error => ({
        severity: error.severity,
        range: {
            start: { line: error.range.start.line, character: error.range.start.character },
            end: { line: error.range.end.line, character: error.range.end.character }
        },
        message: error.message,
        source: error.source
    }));

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Completion handler
connection.onCompletion(
    (params: TextDocumentPositionParams): CompletionItem[] => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return [];
        }

        const soarDoc = documentCache.get(params.textDocument.uri);
        const text = document.getText();
        const offset = document.offsetAt(params.position);
        const lineText = text.split('\n')[params.position.line];
        const beforeCursor = lineText.substring(0, params.position.character);

        const completions: CompletionItem[] = [];

        // Attribute completions (after ^)
        if (beforeCursor.match(/\^\w*$/)) {
            completions.push(
                { label: 'name', kind: CompletionItemKind.Property },
                { label: 'type', kind: CompletionItemKind.Property },
                { label: 'operator', kind: CompletionItemKind.Property },
                { label: 'superstate', kind: CompletionItemKind.Property },
                { label: 'io', kind: CompletionItemKind.Property },
                { label: 'input-link', kind: CompletionItemKind.Property },
                { label: 'output-link', kind: CompletionItemKind.Property }
            );
        }

        // Variable completions (after <)
        if (beforeCursor.match(/<[a-zA-Z]*$/)) {
            if (soarDoc) {
                soarDoc.productions.forEach(prod => {
                    prod.variables.forEach((variable, name) => {
                        completions.push({
                            label: name,
                            kind: CompletionItemKind.Variable,
                            detail: 'Variable'
                        });
                    });
                });
            }
        }

        // Function completions (after ()
        if (beforeCursor.match(/\(\s*[a-zA-Z]*$/)) {
            const functions = [
                'write', 'crlf', 'halt', 'interrupt', 'timestamp',
                '+', '-', '*', '/', 'div', 'mod', 'abs', 'sqrt',
                'sin', 'cos', 'tan', 'atan2', 'log', 'ln', 'exp',
                'int', 'float', 'round', 'min', 'max'
            ];
            functions.forEach(func => {
                completions.push({
                    label: func,
                    kind: CompletionItemKind.Function,
                    detail: 'Soar function'
                });
            });
        }

        // Keyword completions at start of line
        if (beforeCursor.trim().length === 0 || beforeCursor.match(/^\s*(sp|gp)?$/)) {
            completions.push(
                { label: 'sp', kind: CompletionItemKind.Keyword, detail: 'Soar production' },
                { label: 'gp', kind: CompletionItemKind.Keyword, detail: 'Goal production' }
            );
        }

        return completions;
    }
);

// Hover handler
connection.onHover(
    (params: TextDocumentPositionParams): Hover | null => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }

        const soarDoc = documentCache.get(params.textDocument.uri);
        if (!soarDoc) {
            return null;
        }

        const position = params.position;

        // Find production at cursor
        for (const prod of soarDoc.productions) {
            if (this.isPositionInRange(position, prod.nameRange)) {
                const markdown = [
                    `**${prod.type}** \`${prod.name}\``,
                    '',
                    prod.documentation || 'Soar production',
                    '',
                    `Variables: ${Array.from(prod.variables.keys()).join(', ')}`
                ].join('\n');

                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: markdown
                    }
                };
            }
        }

        return null;
    }
);

// Definition handler
connection.onDefinition(
    (params: TextDocumentPositionParams): Definition | null => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }

        const soarDoc = documentCache.get(params.textDocument.uri);
        if (!soarDoc) {
            return null;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);
        const wordRange = this.getWordRangeAtPosition(text, offset);
        if (!wordRange) {
            return null;
        }

        const word = text.substring(wordRange.start, wordRange.end);

        // Find production by name
        for (const prod of soarDoc.productions) {
            if (prod.name === word) {
                return {
                    uri: params.textDocument.uri,
                    range: {
                        start: { line: prod.range.start.line, character: prod.range.start.character },
                        end: { line: prod.range.end.line, character: prod.range.end.character }
                    }
                };
            }
        }

        return null;
    }
);

// Document symbols handler
connection.onDocumentSymbol(
    (params: DocumentSymbolParams): SymbolInformation[] => {
        const soarDoc = documentCache.get(params.textDocument.uri);
        if (!soarDoc) {
            return [];
        }

        return soarDoc.productions.map(prod => ({
            name: prod.name,
            kind: SymbolKind.Function,
            location: {
                uri: params.textDocument.uri,
                range: {
                    start: { line: prod.range.start.line, character: prod.range.start.character },
                    end: { line: prod.range.end.line, character: prod.range.end.character }
                }
            }
        }));
    }
);

// Helper functions
function isPositionInRange(position: { line: number; character: number }, range: { start: { line: number; character: number }, end: { line: number; character: number } }): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
        return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
        return false;
    }
    return true;
}

function getWordRangeAtPosition(text: string, offset: number): { start: number; end: number } | null {
    // Find word boundaries
    let start = offset;
    let end = offset;

    while (start > 0 && /[a-zA-Z0-9_-]/.test(text[start - 1])) {
        start--;
    }

    while (end < text.length && /[a-zA-Z0-9_-]/.test(text[end])) {
        end++;
    }

    if (start === end) {
        return null;
    }

    return { start, end };
}

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
```

### 3.5 Create LSP Client

Create `src/client/lspClient.ts` to connect the extension to the server:
    context.subscriptions.push({
        dispose: () => stopLanguageClient()
    });
}

/**
 * Stop the Soar Language Server client
 */
export async function stopLanguageClient(): Promise<void> {
    if (client) {
        await client.stop();
        client = undefined;
        console.log('Soar Language Server stopped');
    }
}

/**
 * Restart the Soar Language Server client
 */
export async function restartLanguageClient(context: vscode.ExtensionContext): Promise<void> {
    await stopLanguageClient();
    await startLanguageClient(context);
}

/**
 * Get the active language client
 */
export function getLanguageClient(): LanguageClient | undefined {
    return client;
}
```

### 3.5 Update Extension Entry Point

Update `src/extension.ts` to initialize the LSP client:

```typescript
import * as vscode from 'vscode';
import { startLanguageClient, stopLanguageClient, restartLanguageClient } from './client/lspClient';

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Soar extension is now active');

    // Start the Language Server
    await startLanguageClient(context);

    // Register commands
    registerCommands(context);

    // TODO: Initialize datamap providers (Phase 5)
    // TODO: Initialize datamap UI (Phase 7)
}

/**
 * Extension deactivation function
 */
export async function deactivate() {
    console.log('Soar extension is now deactivated');
    await stopLanguageClient();
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Restart language server command
    const restartCommand = vscode.commands.registerCommand('soar.restartLanguageServer', async () => {
        await restartLanguageClient(context);
        vscode.window.showInformationMessage('Soar Language Server restarted');
    });

    // Show output channel command
    const showOutputCommand = vscode.commands.registerCommand('soar.showOutputChannel', () => {
        // The LSP client automatically creates an output channel
        vscode.commands.executeCommand('soar.languageServer.showOutputChannel');
    });

    context.subscriptions.push(restartCommand, showOutputCommand);
}
```

### 3.6 Update package.json

Add commands and configuration to `package.json`:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "soar.restartLanguageServer",
        "title": "Restart Language Server",
        "category": "Soar"
      },
      {
        "command": "soar.showOutputChannel",
        "title": "Show Language Server Output",
        "category": "Soar"
      }
    ],
    "configuration": {
      "type": "object",
      "title": "Soar",
      "properties": {
        "soar.languageServer.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable the Soar Language Server"
        },
        "soar.languageServer.path": {
          "type": "string",
          "default": "",
          "description": "Custom path to the Soar Language Server JAR file"
        },
        "soar.languageServer.javaPath": {
          "type": "string",
          "default": "java",
          "description": "Path to the Java executable"
        },
        "soar.languageServer.javaOptions": {
          "type": "array",
          "default": [],
          "description": "Additional Java options (e.g., ['-Xmx512m'])"
        },
        "soar.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Trace communication between VS Code and the language server"
        }
      }
    }
  }
}
```

### 3.7 Implement Configuration Support

Update `src/server/serverConfig.ts` to use VS Code settings:

```typescript
import * as vscode from 'vscode';

export function getServerConfig(extensionPath: string): ServerConfig | null {
    const config = vscode.workspace.getConfiguration('soar');
    
    // Check if language server is enabled
    if (!config.get<boolean>('languageServer.enabled', true)) {
        return null;
    }

    // Get custom paths from settings
    const customServerPath = config.get<string>('languageServer.path');
    const javaPath = config.get<string>('languageServer.javaPath', 'java');
    const javaOptions = config.get<string[]>('languageServer.javaOptions', []);

    // Priority 1: Custom path from settings
    if (customServerPath && fs.existsSync(customServerPath)) {
        return {
            command: javaPath,
            args: [...javaOptions, '-jar', customServerPath],
            options: {}
        };
    }

    // Priority 2: Bundled JAR
    const bundledJar = path.join(extensionPath, 'server', 'soar-language-server.jar');
    if (fs.existsSync(bundledJar)) {
        return {
            command: javaPath,
            args: [...javaOptions, '-jar', bundledJar],
            options: {}
        };
    }

    // Priority 3: Environment variable
    const serverPath = process.env.SOAR_LSP_SERVER;
    if (serverPath && fs.existsSync(serverPath)) {
        return {
            command: javaPath,
            args: [...javaOptions, '-jar', serverPath],
            options: {}
        };
    }

    return null;
}
```

### 3.8 Bundle the Server

If bundling the server with the extension:

1. Build the Soar Language Server JAR
2. Copy the JAR to `server/soar-language-server.jar`
3. Update `.vscodeignore` to include the server:

```
# .vscodeignore
.vscode/**
.vscode-test/**
src/**
test/**
node_modules/**
.gitignore
.eslintrc.json
**/*.map
**/*.ts
tsconfig.json
instructions/**
INSTRUCTIONS.md

# Include the server
!server/soar-language-server.jar
```

### 3.9 Create Status Bar Item

Add a status bar item to show server status in `src/client/lspClient.ts`:

```typescript
let statusBarItem: vscode.StatusBarItem;

export async function startLanguageClient(context: vscode.ExtensionContext): Promise<void> {
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(loading~spin) Soar LSP Starting...';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ... existing code ...

    // Update status on successful start
    client.onReady().then(() => {
        statusBarItem.text = '$(check) Soar LSP';
        statusBarItem.tooltip = 'Soar Language Server is running';
    });

    // Update status on error
    client.onDidChangeState((event) => {
        if (event.newState === State.Stopped) {
            statusBarItem.text = '$(error) Soar LSP';
            statusBarItem.tooltip = 'Soar Language Server stopped';
        }
    });
}
```

### 3.10 Test the Integration

1. Ensure the server JAR is accessible
2. Compile the extension:
```bash
npm run compile
```

3. Launch Extension Development Host (F5)

4. Open a `.soar` file

5. Verify:
   - Status bar shows "Soar LSP"
   - No errors in "Soar Language Server" output channel
   - Diagnostics appear for syntax errors
   - Hover shows information (if implemented by server)
   - Go to definition works (if implemented by server)

### 3.11 Create Test File

Create `test/fixtures/test-lsp.soar`:

```soar
# This file tests LSP features

# Test 1: Valid production (should have no errors)
sp {test*valid-production
   (state <s> ^type state)
-->
   (<s> ^test-attribute value)
}

# Test 2: Syntax error (should show diagnostic)
sp {test*syntax-error
   (state <s> ^type state
   # Missing closing parenthesis
-->
   (<s> ^error true)
}

# Test 3: Reference to production (test go-to-definition)
sp {test*reference
   (state <s> ^type state)
-->
   (<s> ^uses test*valid-production)
}
```

## Verification Checklist

- [ ] Language client package installed
- [ ] Server configuration implemented
- [ ] LSP client created and properly configured
- [ ] Extension activates LSP client on .soar files
- [ ] Server JAR is accessible (bundled or configured path)
- [ ] Java validation works
- [ ] Status bar item shows server status
- [ ] Commands registered (restart server, show output)
- [ ] Configuration options work
- [ ] Diagnostics appear for syntax errors
- [ ] Hover information displayed (if server supports)
- [ ] Go to definition works (if server supports)
- [ ] Completion works (if server supports)
- [ ] Output channel shows server logs
- [ ] No errors in Developer Console

## Common Issues

**Issue**: Server fails to start
- Verify Java is installed: `java -version`
- Check server JAR exists at configured path
- Review "Soar Language Server" output channel for errors
- Check file permissions on JAR

**Issue**: No diagnostics or LSP features
- Verify server is actually running (check status bar)
- Ensure file is saved (.soar extension)
- Check that `documentSelector` matches your files
- Review server output for protocol errors

**Issue**: High memory usage
- Add Java memory limits in settings: `['-Xmx512m']`
- Check for memory leaks in server implementation

**Issue**: Server crashes frequently
- Check server logs in output channel
- Verify server JAR is compatible with Java version
- Report issues to Soar Language Server repository

## Troubleshooting Commands

Add a diagnostics command in `src/extension.ts`:

```typescript
const diagnosticsCommand = vscode.commands.registerCommand('soar.showDiagnostics', async () => {
    const client = getLanguageClient();
    const javaInstalled = await validateJava();
    const serverConfig = getServerConfig(context.extensionPath);
    
    const info = {
        'Client Status': client ? 'Running' : 'Not running',
        'Java Installed': javaInstalled ? 'Yes' : 'No',
        'Server Config': serverConfig ? 'Found' : 'Not found',
        'Server Path': serverConfig?.args[serverConfig.args.length - 1] || 'N/A'
    };
    
    const message = Object.entries(info)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    
    vscode.window.showInformationMessage(message, { modal: true });
});

context.subscriptions.push(diagnosticsCommand);
```

Register in package.json:

```json
{
  "command": "soar.showDiagnostics",
  "title": "Show Language Server Diagnostics",
  "category": "Soar"
}
```

## Next Steps

Proceed to Phase 4: `instructions/phase4-datamap-logic.md` to port VisualSoar's DataMap logic.

## Files Created/Modified

- `src/client/lspClient.ts` - LSP client implementation
- `src/server/serverConfig.ts` - Server configuration
- `src/extension.ts` - Updated with LSP initialization
- `package.json` - Added commands and configuration
- `.vscodeignore` - Updated to include/exclude server
- `test/fixtures/test-lsp.soar` - Test file
