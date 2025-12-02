# Phase 3: TypeScript LSP Implementation - UPDATED PLAN

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

## Important: VisualSoar Compatibility

**MANDATORY REQUIREMENT**: This extension MUST be fully compatible with VisualSoar project files (`.vsproj`/`.soarproj`) to allow seamless transitions between tools.

- **Schema**: https://github.com/SoarGroup/VisualSoar/blob/master/doc/project_schema.json
- **Version**: 6 (VisualSoar 9.6.4)
- **Documentation**: See `VISUALSOAR-INTEGRATION.md` for complete details

The extension must:
1. Read and write VisualSoar project files
2. Respect the datamap structure for completions and validation
3. Use the layout structure for file organization
4. Ensure bidirectional compatibility (no data loss)

## Implementation Steps

### 3.1 Install LSP Dependencies

Install the required LSP libraries:

```bash
npm install vscode-languageclient vscode-languageserver vscode-languageserver-textdocument
```

The extension will use:
- `vscode-languageclient` - Client running in the extension
- `vscode-languageserver` - Server framework
- `vscode-languageserver-textdocument` - Text document management

### 3.1b Create VisualSoar Project Support (REQUIRED)

Before implementing the LSP server, create the VisualSoar project integration:

Create `src/server/visualSoarProject.ts`:

```typescript
/**
 * VisualSoar Project Schema v6 Types
 * See: VISUALSOAR-INTEGRATION.md
 */

export interface VisualSoarProject {
    version: "6";
    datamap: Datamap;
    layout: LayoutNode;
}

export interface Datamap {
    rootId: string;
    vertices: DMVertex[];
}

export type DMVertex = SoarIdVertex | EnumerationVertex | IntegerRangeVertex | 
                       FloatRangeVertex | StringVertex | ForeignVertex;

export interface BaseDMVertex {
    id: string;
    type: "SOAR_ID" | "ENUMERATION" | "INTEGER" | "FLOAT" | "STRING" | "FOREIGN";
}

export interface SoarIdVertex extends BaseDMVertex {
    type: "SOAR_ID";
    outEdges?: OutEdge[];
}

export interface EnumerationVertex extends BaseDMVertex {
    type: "ENUMERATION";
    choices: string[];
}

export interface IntegerRangeVertex extends BaseDMVertex {
    type: "INTEGER";
    min?: number;
    max?: number;
}

export interface FloatRangeVertex extends BaseDMVertex {
    type: "FLOAT";
    min?: number;
    max?: number;
}

export interface StringVertex extends BaseDMVertex {
    type: "STRING";
}

export interface ForeignVertex extends BaseDMVertex {
    type: "FOREIGN";
    foreignDMPath: string;
    importedVertex: DMVertex;
}

export interface OutEdge {
    name: string;
    toId: string;
    comment?: string;
    generated?: boolean;
}

// Simplified layout types for Phase 3 (full types in VISUALSOAR-INTEGRATION.md)
export interface LayoutNode {
    type: string;
    id: string;
    children?: LayoutNode[];
}

export interface ProjectContext {
    projectFile: string;
    project: VisualSoarProject;
    datamapIndex: Map<string, DMVertex>;
}
```

Create `src/server/projectLoader.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { VisualSoarProject, ProjectContext, DMVertex } from './visualSoarProject';

export class ProjectLoader {
    async findProjectFile(workspaceRoot: string): Promise<string | null> {
        // Look for .vsproj or .soarproj files
        try {
            const files = fs.readdirSync(workspaceRoot);
            for (const file of files) {
                if (file.endsWith('.vsproj') || file.endsWith('.soarproj')) {
                    return path.join(workspaceRoot, file);
                }
            }
        } catch (error) {
            console.error('Error finding project file:', error);
        }
        return null;
    }
    
    async loadProject(projectFile: string): Promise<ProjectContext> {
        const content = fs.readFileSync(projectFile, 'utf-8');
        const project: VisualSoarProject = JSON.parse(content);
        
        if (project.version !== "6") {
            throw new Error(`Unsupported project version: ${project.version}`);
        }
        
        const datamapIndex = new Map<string, DMVertex>();
        for (const vertex of project.datamap.vertices) {
            datamapIndex.set(vertex.id, vertex);
        }
        
        return {
            projectFile,
            project,
            datamapIndex
        };
    }
}

### 3.2 Create Type Definitions

Create `src/server/soarTypes.ts`:

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

export enum ProductionType {
    SP = 'sp',
    GP = 'gp'
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

export interface SoarTest {
    operator: string;
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
    variables: Map<string, SoarVariable>;
    attributes: SoarAttribute[];
    functionCalls: SoarFunctionCall[];
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

Create `src/server/soarParser.ts`:

**Note:** This is a simplified parser. For Phase 3, focus on basic parsing. A more comprehensive parser can be added in later phases.

```typescript
import {
    SoarDocument,
    SoarProduction,
    ProductionType,
    SoarDiagnostic,
    DiagnosticSeverity,
    Range,
    Position,
    SoarVariable,
    SoarAttribute
} from './soarTypes';

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
        } catch (error: any) {
            document.errors.push({
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                message: `Parse error: ${error.message}`,
                severity: DiagnosticSeverity.Error,
                source: 'soar-parser'
            });
        }

        return document;
    }

    private parseProductions(content: string, document: SoarDocument): void {
        const lines = content.split('\n');
        
        // Regex to match production declarations: sp/gp {name
        const productionStartRegex = /\b(sp|gp)\s*\{/g;
        
        let match;
        while ((match = productionStartRegex.exec(content)) !== null) {
            try {
                const production = this.parseProduction(content, match.index, lines);
                if (production) {
                    document.productions.push(production);
                }
            } catch (error: any) {
                const pos = this.offsetToPosition(content, match.index, lines);
                document.errors.push({
                    range: { start: pos, end: pos },
                    message: `Production parse error: ${error.message}`,
                    severity: DiagnosticSeverity.Error,
                    source: 'soar-parser'
                });
            }
        }
    }

    private parseProduction(content: string, startOffset: number, lines: string[]): SoarProduction | null {
        // Extract production type
        const typeMatch = content.substring(startOffset).match(/^(sp|gp)\s*\{/);
        if (!typeMatch) return null;

        const type = typeMatch[1] as 'sp' | 'gp';
        
        // Find production name (first identifier after {)
        const afterBrace = content.substring(startOffset + typeMatch[0].length);
        const nameMatch = afterBrace.match(/^\s*([a-zA-Z][a-zA-Z0-9_*-]*)/);
        if (!nameMatch) {
            throw new Error('Production name not found');
        }

        const name = nameMatch[1];
        const nameStart = startOffset + typeMatch[0].length + (nameMatch.index || 0);
        const nameEnd = nameStart + name.length;

        // Find matching closing brace
        const { endOffset, hasError } = this.findMatchingBrace(content, startOffset);
        
        const production: SoarProduction = {
            name,
            type: type === 'sp' ? ProductionType.SP : ProductionType.GP,
            range: {
                start: this.offsetToPosition(content, startOffset, lines),
                end: this.offsetToPosition(content, endOffset, lines)
            },
            nameRange: {
                start: this.offsetToPosition(content, nameStart, lines),
                end: this.offsetToPosition(content, nameEnd, lines)
            },
            variables: new Map(),
            attributes: [],
            functionCalls: []
        };

        // Parse body
        const body = content.substring(startOffset + typeMatch[0].length, endOffset);
        this.parseProductionBody(body, production, production.range.start);

        return production;
    }

    private findMatchingBrace(content: string, startOffset: number): { endOffset: number; hasError: boolean } {
        let braceCount = 0;
        let inBraces = false;

        for (let i = startOffset; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
                braceCount++;
                inBraces = true;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && inBraces) {
                    return { endOffset: i + 1, hasError: false };
                }
            }
        }

        // No matching brace found
        return { endOffset: content.length, hasError: true };
    }

    private parseProductionBody(body: string, production: SoarProduction, basePosition: Position): void {
        // Parse variables
        const variableRegex = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;
        let match;

        while ((match = variableRegex.exec(body)) !== null) {
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

        // Parse attributes
        const attributeRegex = /\^([a-zA-Z][a-zA-Z0-9_-]*)/g;
        while ((match = attributeRegex.exec(body)) !== null) {
            production.attributes.push({
                name: match[1],
                range: {
                    start: { line: basePosition.line, character: match.index },
                    end: { line: basePosition.line, character: match.index + match[0].length }
                },
                isNegated: match.index > 0 && body[match.index - 1] === '-'
            });
        }

        // Parse function calls
        const functionRegex = /\(([a-zA-Z][a-zA-Z0-9_-]*)/g;
        while ((match = functionRegex.exec(body)) !== null) {
            production.functionCalls.push({
                name: match[1],
                args: [],
                range: {
                    start: { line: basePosition.line, character: match.index },
                    end: { line: basePosition.line, character: match.index + match[0].length }
                }
            });
        }
    }

    private offsetToPosition(content: string, offset: number, lines: string[]): Position {
        let currentOffset = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineLength = lines[i].length + 1;
            if (currentOffset + lineLength > offset) {
                return { line: i, character: offset - currentOffset };
            }
            currentOffset += lineLength;
        }
        return { line: Math.max(0, lines.length - 1), character: 0 };
    }
}
```

### 3.4 Create LSP Server

Create `src/server/soarLanguageServer.ts`:

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
    SymbolInformation,
    SymbolKind,
    DocumentSymbolParams
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SoarParser } from './soarParser';
import { SoarDocument } from './soarTypes';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const parser = new SoarParser();
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
            referencesProvider: false  // TODO: Implement in future
        }
    };
    return result;
});

connection.onInitialized(() => {
    connection.console.log('Soar Language Server initialized');
});

documents.onDidChangeContent(change => {
    validateDocument(change.document);
});

documents.onDidClose(e => {
    documentCache.delete(e.document.uri);
});

async function validateDocument(textDocument: TextDocument): Promise<void> {
    const text = textDocument.getText();
    const soarDoc = parser.parse(textDocument.uri, text, textDocument.version);
    
    documentCache.set(textDocument.uri, soarDoc);

    const diagnostics = soarDoc.errors.map(error => ({
        severity: error.severity,
        range: {
            start: error.range.start,
            end: error.range.end
        },
        message: error.message,
        source: error.source
    }));

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    const lines = text.split('\n');
    const lineText = lines[params.position.line] || '';
    const beforeCursor = lineText.substring(0, params.position.character);

    const completions: CompletionItem[] = [];

    // Attribute completions
    if (beforeCursor.match(/\^\w*$/)) {
        const attributes = ['name', 'type', 'operator', 'superstate', 'io', 
                          'input-link', 'output-link', 'state', 'impasse'];
        attributes.forEach(attr => {
            completions.push({
                label: attr,
                kind: CompletionItemKind.Property,
                detail: 'Soar attribute'
            });
        });
    }

    // Variable completions
    if (beforeCursor.match(/<[a-zA-Z]*$/)) {
        const soarDoc = documentCache.get(params.textDocument.uri);
        if (soarDoc) {
            const uniqueVars = new Set<string>();
            soarDoc.productions.forEach(prod => {
                prod.variables.forEach((_, name) => uniqueVars.add(name));
            });
            uniqueVars.forEach(varName => {
                completions.push({
                    label: varName,
                    kind: CompletionItemKind.Variable,
                    detail: 'Variable'
                });
            });
        }
    }

    // Function completions
    if (beforeCursor.match(/\(\s*[a-zA-Z]*$/)) {
        const functions = ['write', 'crlf', 'halt', 'interrupt', '+', '-', '*', '/', 
                          'sqrt', 'abs', 'min', 'max', 'int', 'float'];
        functions.forEach(func => {
            completions.push({
                label: func,
                kind: CompletionItemKind.Function,
                detail: 'Soar function'
            });
        });
    }

    // Keyword completions
    if (beforeCursor.trim().length === 0 || beforeCursor.match(/^\s*(sp|gp)?$/)) {
        completions.push(
            { label: 'sp', kind: CompletionItemKind.Keyword, detail: 'Soar production' },
            { label: 'gp', kind: CompletionItemKind.Keyword, detail: 'Goal production' }
        );
    }

    return completions;
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const soarDoc = documentCache.get(params.textDocument.uri);
    if (!soarDoc) return null;

    const position = params.position;

    for (const prod of soarDoc.productions) {
        if (isPositionInRange(position, prod.nameRange)) {
            const varCount = prod.variables.size;
            const attrCount = prod.attributes.length;
            
            const markdown = [
                `**${prod.type}** \`${prod.name}\``,
                '',
                prod.documentation || 'Soar production',
                '',
                `Variables: ${varCount}, Attributes: ${attrCount}`
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
});

connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const soarDoc = documentCache.get(params.textDocument.uri);
    if (!soarDoc) return null;

    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const wordRange = getWordRangeAtPosition(text, offset);
    if (!wordRange) return null;

    const word = text.substring(wordRange.start, wordRange.end);

    for (const prod of soarDoc.productions) {
        if (prod.name === word) {
            return {
                uri: params.textDocument.uri,
                range: prod.range
            };
        }
    }

    return null;
});

connection.onDocumentSymbol((params: DocumentSymbolParams): SymbolInformation[] => {
    const soarDoc = documentCache.get(params.textDocument.uri);
    if (!soarDoc) return [];

    return soarDoc.productions.map(prod => ({
        name: prod.name,
        kind: SymbolKind.Function,
        location: {
            uri: params.textDocument.uri,
            range: prod.range
        }
    }));
});

function isPositionInRange(position: { line: number; character: number }, 
                          range: { start: { line: number; character: number }, 
                                 end: { line: number; character: number } }): boolean {
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
    let start = offset;
    let end = offset;

    while (start > 0 && /[a-zA-Z0-9_*-]/.test(text[start - 1])) {
        start--;
    }

    while (end < text.length && /[a-zA-Z0-9_*-]/.test(text[end])) {
        end++;
    }

    if (start === end) return null;
    return { start, end };
}

documents.listen(connection);
connection.listen();
```

### 3.5 Create LSP Client

Create `src/client/lspClient.ts`:

```typescript
import * as path from 'path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function startLanguageClient(context: vscode.ExtensionContext): Promise<void> {
    const serverModule = context.asAbsolutePath(
        path.join('out', 'server', 'soarLanguageServer.js')
    );

    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'soar' },
            { scheme: 'untitled', language: 'soar' }
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.soar')
        },
        outputChannelName: 'Soar Language Server',
    };

    client = new LanguageClient(
        'soarLanguageServer',
        'Soar Language Server',
        serverOptions,
        clientOptions
    );

    try {
        await client.start();
        console.log('Soar Language Server started successfully');
    } catch (error) {
        console.error('Failed to start Soar Language Server:', error);
        vscode.window.showErrorMessage(`Failed to start Soar Language Server: ${error}`);
    }

    context.subscriptions.push({
        dispose: () => stopLanguageClient()
    });
}

export async function stopLanguageClient(): Promise<void> {
    if (client) {
        await client.stop();
        client = undefined;
        console.log('Soar Language Server stopped');
    }
}

export async function restartLanguageClient(context: vscode.ExtensionContext): Promise<void> {
    await stopLanguageClient();
    await startLanguageClient(context);
}

export function getLanguageClient(): LanguageClient | undefined {
    return client;
}
```

### 3.6 Update Extension Entry Point

Update `src/extension.ts`:

```typescript
import * as vscode from 'vscode';
import { startLanguageClient, stopLanguageClient, restartLanguageClient } from './client/lspClient';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Soar extension is now active');

    // Start the Language Server
    await startLanguageClient(context);

    // Register restart command
    const restartCommand = vscode.commands.registerCommand('soar.restartLanguageServer', async () => {
        await restartLanguageClient(context);
        vscode.window.showInformationMessage('Soar Language Server restarted');
    });

    context.subscriptions.push(restartCommand);

    // TODO: Phase 4-7 initialization
}

export async function deactivate() {
    console.log('Soar extension is now deactivated');
    await stopLanguageClient();
}
```

### 3.7 Update package.json

Add LSP commands and configuration:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "soar.restartLanguageServer",
        "title": "Restart Language Server",
        "category": "Soar"
      }
    ],
    "configuration": {
      "type": "object",
      "title": "Soar",
      "properties": {
        "soar.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Trace communication between VS Code and the language server"
        }
      }
    }
  },
  "dependencies": {
    "vscode-languageclient": "^9.0.0",
    "vscode-languageserver": "^9.0.0",
    "vscode-languageserver-textdocument": "^1.0.0"
  }
}
```

## Testing

### 3.8 Create Test Files

Create `test/fixtures/test-lsp.soar`:

```soar
# Test LSP features

# Valid production
sp {test*valid-production
   (state <s> ^type state
              ^name test)
-->
   (<s> ^result success)
}

# Production with variables
sp {test*variables
   (state <s> ^io.input-link <in>
              ^io.output-link <out>)
   (<in> ^data <value>)
-->
   (<out> ^response <value>)
   (write |Processing: | <value>)
}

# Production with math
sp {test*math
   (state <s> ^value <v>)
-->
   (<s> ^doubled (* <v> 2)
        ^squared (+ (* <v> <v>) 0))
}

# Syntax error (missing closing brace)
sp {test*error
   (state <s> ^type state)
-->
   (<s> ^error true)
# Intentional error

# Test go-to-definition
sp {test*reference
   (state <s> ^type state)
-->
   (<s> ^calls test*valid-production)
}
```

### 3.9 Test the Implementation

1. Compile the extension:
```bash
npm run compile
```

2. Launch Extension Development Host (F5)

3. Open `test/fixtures/test-lsp.soar`

4. Verify features:
   - [ ] Syntax highlighting works
   - [ ] Outline view shows productions (Ctrl+Shift+O)
   - [ ] Hover over production name shows info
   - [ ] Completions after `^` show attributes
   - [ ] Completions after `<` show variables
   - [ ] Completions after `(` show functions
   - [ ] Go to definition works on production names
   - [ ] Errors appear for syntax issues

### 3.10 Debug Server

If issues occur, check:

1. **Output Channel**: View > Output > "Soar Language Server"
2. **Developer Tools**: Help > Toggle Developer Tools
3. **Server Debugging**: 
   - Set breakpoints in `soarLanguageServer.ts`
   - Launch "Attach to Server" debug configuration

Add to `.vscode/launch.json`:

```json
{
  "name": "Attach to Server",
  "type": "node",
  "request": "attach",
  "port": 6009,
  "restart": true,
  "outFiles": ["${workspaceFolder}/out/server/**/*.js"]
}
```

## Verification Checklist

- [ ] Dependencies installed (`vscode-languageclient`, `vscode-languageserver`, etc.)
- [ ] Type definitions created (`soarTypes.ts`)
- [ ] Parser implemented (`soarParser.ts`)
- [ ] Language server implemented (`soarLanguageServer.ts`)
- [ ] Client implemented (`lspClient.ts`)
- [ ] Extension entry point updated
- [ ] package.json updated with commands and dependencies
- [ ] Test file created
- [ ] Extension compiles without errors
- [ ] Server starts successfully
- [ ] Diagnostics appear
- [ ] Hover information works
- [ ] Completions work
- [ ] Go to definition works
- [ ] Document symbols work
- [ ] No errors in console

## Common Issues

**Issue**: Server doesn't start
- Check output channel for errors
- Verify `out/server/soarLanguageServer.js` exists
- Check for TypeScript compilation errors

**Issue**: No completions appear
- Verify trigger characters in server capabilities
- Check completion logic in server
- Test with different cursor positions

**Issue**: Hover doesn't work
- Verify production name ranges are correct
- Check position-in-range logic
- Test with different production names

**Issue**: Parse errors
- Start with simple productions
- Add logging to parser
- Test regex patterns individually

## Future Enhancements

For later phases, consider:

1. **Better Parser**: Use a proper grammar parser (ANTLR, Chevrotain, etc.)
2. **Semantic Validation**: Check variable usage, attribute consistency
3. **Find References**: Implement reference finding
4. **Rename**: Support renaming productions and variables
5. **Code Actions**: Quick fixes for common errors
6. **Formatting**: Code formatter
7. **Integration**: Connect with datamap validation (Phase 4-6)

## Next Steps

Proceed to **Phase 4**: `instructions/phase4-datamap-logic.md` to implement DataMap functionality.

## Files Created

- `src/server/soarTypes.ts` - Type definitions
- `src/server/soarParser.ts` - Parser implementation  
- `src/server/soarLanguageServer.ts` - LSP server
- `src/client/lspClient.ts` - LSP client
- `test/fixtures/test-lsp.soar` - Test file

## Files Modified

- `src/extension.ts` - Added LSP initialization
- `package.json` - Added dependencies and commands

## Reference Materials

- **LSP Specification**: https://microsoft.github.io/language-server-protocol/
- **LSP Sample**: https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample
- **SoarTech LSP** (reference): https://github.com/soartech/soar-language-server

---

**Status**: Ready for implementation
**Updated**: December 2, 2025
