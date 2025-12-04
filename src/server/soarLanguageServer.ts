/**
 * Soar Language Server
 *
 * Provides LSP features: diagnostics, hover, completion, go-to-definition, document symbols
 */

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  HoverParams,
  Hover,
  DefinitionParams,
  Location,
  DocumentSymbolParams,
  SymbolInformation,
  SymbolKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SoarParser } from './soarParser';
import { SoarDocument, SoarProduction } from './soarTypes';
import { ProjectLoader } from './projectLoader';
import { ProjectContext } from './visualSoarProject';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Parser
const parser = new SoarParser();

// Parsed documents cache
const parsedDocuments = new Map<string, SoarDocument>();

// Project loader
const projectLoader = new ProjectLoader();
let currentProject: ProjectContext | null = null;

// Settings
interface SoarSettings {
  maxNumberOfProblems: number;
  trace: { server: string };
}

const defaultSettings: SoarSettings = { maxNumberOfProblems: 100, trace: { server: 'off' } };
let globalSettings: SoarSettings = defaultSettings;

// Initialize server capabilities
connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['^', '<', '(', '.'],
      },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
    },
  };
  return result;
});

connection.onInitialized(async () => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined);

  // Try to load project file on initialization
  try {
    // Get workspace folders from initialization params
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceUri = workspaceFolders[0].uri;
      const workspacePath = workspaceUri.replace('file://', '');
      const projectFile = await projectLoader.findProjectFile(workspacePath);
      if (projectFile) {
        currentProject = await projectLoader.loadProject(projectFile);
        connection.console.log(`Loaded project on initialization: ${projectFile}`);
      }
    }
  } catch (error: any) {
    connection.console.error(`Failed to load project on initialization: ${error.message}`);
  }
});

// Handle project change notifications from the client
connection.onNotification('soar/projectChanged', async (params: { projectFile: string }) => {
  try {
    connection.console.log(`Loading project from notification: ${params.projectFile}`);
    currentProject = await projectLoader.loadProject(params.projectFile);
    connection.console.log(`Successfully loaded project: ${params.projectFile}`);

    // Revalidate all open documents with the new project
    documents.all().forEach(validateTextDocument);
  } catch (error: any) {
    connection.console.error(`Failed to load project from notification: ${error.message}`);
  }
});

// Configuration changes
connection.onDidChangeConfiguration(change => {
  if (change.settings) {
    globalSettings = <SoarSettings>(change.settings.soar || defaultSettings);
  } else {
    globalSettings = defaultSettings;
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

// Document events
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

documents.onDidOpen(async event => {
  // Try to load VisualSoar project if not already loaded
  if (!currentProject) {
    try {
      // Get workspace folders from connection
      const workspaceFolders = await connection.workspace.getWorkspaceFolders();
      if (workspaceFolders && workspaceFolders.length > 0) {
        // Try to find project in each workspace folder
        for (const folder of workspaceFolders) {
          const workspacePath = folder.uri.replace('file://', '');
          const projectFile = await projectLoader.findProjectFile(workspacePath);
          if (projectFile) {
            currentProject = await projectLoader.loadProject(projectFile);
            connection.console.log(`Loaded project: ${projectFile}`);
            break;
          }
        }

        // If not found in workspace root, try searching in subdirectories
        if (!currentProject && workspaceFolders.length > 0) {
          const workspacePath = workspaceFolders[0].uri.replace('file://', '');
          const projectFile = await projectLoader.findProjectFileRecursive(workspacePath);
          if (projectFile) {
            currentProject = await projectLoader.loadProject(projectFile);
            connection.console.log(`Loaded project from subdirectory: ${projectFile}`);
          }
        }
      }
    } catch (error: any) {
      connection.console.error(`Failed to load project: ${error.message}`);
    }
  }
  validateTextDocument(event.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const content = textDocument.getText();
  const version = textDocument.version;

  // Parse document
  const soarDoc = parser.parse(textDocument.uri, content, version);
  parsedDocuments.set(textDocument.uri, soarDoc);

  // Basic validation
  const diagnostics: Diagnostic[] = [];

  // Add parser errors
  for (const error of soarDoc.errors) {
    diagnostics.push({
      severity: error.severity === 1 ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      range: {
        start: { line: error.range.start.line, character: error.range.start.character },
        end: { line: error.range.end.line, character: error.range.end.character },
      },
      message: error.message,
      source: error.source,
    });
  }

  // Validate production names are unique
  const productionNames = new Map<string, SoarProduction>();
  for (const production of soarDoc.productions) {
    if (productionNames.has(production.name)) {
      const first = productionNames.get(production.name)!;
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: {
            line: production.nameRange.start.line,
            character: production.nameRange.start.character,
          },
          end: {
            line: production.nameRange.end.line,
            character: production.nameRange.end.character,
          },
        },
        message: `Duplicate production name '${production.name}' (first defined at line ${
          first.nameRange.start.line + 1
        })`,
        source: 'soar-validator',
      });
    } else {
      productionNames.set(production.name, production);
    }
  }

  // Note: Datamap validation is now handled by the DatamapValidator in extension.ts
  // which uses the "exists anywhere" approach to avoid false positives from context issues.

  // Send diagnostics
  connection.sendDiagnostics({
    uri: textDocument.uri,
    diagnostics: diagnostics.slice(0, globalSettings.maxNumberOfProblems),
  });
}

// Hover
connection.onHover((params: HoverParams): Hover | null => {
  const doc = parsedDocuments.get(params.textDocument.uri);
  if (!doc) {
    return null;
  }

  const position = params.position;

  // Find production at position
  for (const production of doc.productions) {
    if (isPositionInRange(position, production.range)) {
      // Check if hovering over production name
      if (isPositionInRange(position, production.nameRange)) {
        return {
          contents: {
            kind: 'markdown',
            value:
              `**${production.type}** \`${production.name}\`\n\n` +
              `Variables: ${production.variables.size}\n` +
              `Attributes: ${production.attributes.length}\n` +
              `Functions: ${production.functionCalls.length}`,
          },
        };
      }

      // Check if hovering over variable
      for (const [varName, variable] of production.variables) {
        if (isPositionInRange(position, variable.range)) {
          return {
            contents: {
              kind: 'markdown',
              value: `**Variable** \`<${varName}>\`\n\nReferences: ${
                variable.references.length + 1
              }`,
            },
          };
        }
        for (const ref of variable.references) {
          if (isPositionInRange(position, ref)) {
            return {
              contents: {
                kind: 'markdown',
                value: `**Variable** \`<${varName}>\`\n\nReferences: ${
                  variable.references.length + 1
                }`,
              },
            };
          }
        }
      }

      // Check if hovering over attribute
      for (const attr of production.attributes) {
        if (isPositionInRange(position, attr.range)) {
          const negation = attr.isNegated ? 'Negated ' : '';
          return {
            contents: {
              kind: 'markdown',
              value: `**${negation}Attribute** \`^${attr.name}\``,
            },
          };
        }
      }
    }
  }

  return null;
});

// Helper function to build variable bindings (shared with validator logic)
function buildVariableBindings(production: any, projectContext: any): Map<string, Set<string>> {
  const variableBindings = new Map<string, Set<string>>();
  const rootId = projectContext.project.datamap.rootId;
  variableBindings.set('s', new Set([rootId]));

  for (const attr of production.attributes) {
    if (!attr.parentId || !attr.value || !attr.value.startsWith('<')) {
      continue;
    }

    const parentVertices = variableBindings.get(attr.parentId);
    if (!parentVertices) {
      continue;
    }

    const targetVertices = findTargetVerticesForPath(
      Array.from(parentVertices),
      attr.name.split('.'),
      projectContext
    );

    const varName = attr.value.substring(1, attr.value.length - 1);
    if (!variableBindings.has(varName)) {
      variableBindings.set(varName, new Set());
    }
    targetVertices.forEach(v => variableBindings.get(varName)!.add(v));
  }

  return variableBindings;
}

// Helper function to navigate paths (shared with validator logic)
function findTargetVerticesForPath(
  startVertexIds: string[],
  pathSegments: string[],
  projectContext: any
): string[] {
  if (pathSegments.length === 0) {
    return startVertexIds;
  }

  const targetVertices = new Set<string>();

  for (const startVertexId of startVertexIds) {
    const vertex = projectContext.datamapIndex.get(startVertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      continue;
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    const matchingEdges = vertex.outEdges?.filter((e: any) => e.name === firstSegment) || [];
    for (const matchingEdge of matchingEdges) {
      if (remainingSegments.length > 0) {
        const results = findTargetVerticesForPath(
          [matchingEdge.toId],
          remainingSegments,
          projectContext
        );
        results.forEach(v => targetVertices.add(v));
      } else {
        targetVertices.add(matchingEdge.toId);
      }
    }
  }

  return Array.from(targetVertices);
}

// Completion
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = parsedDocuments.get(params.textDocument.uri);
  if (!doc || !currentProject) {
    return [];
  }

  const completions: CompletionItem[] = [];

  // Get the text document for context analysis
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) {
    return completions;
  }

  // Find which production we're currently in
  const currentProduction = doc.productions.find(
    prod =>
      params.position.line >= prod.range.start.line && params.position.line <= prod.range.end.line
  );

  if (!currentProduction) {
    return completions;
  }

  connection.console.log(`Completion in production: ${currentProduction.name}`);

  // Build variable bindings using the same logic as the validator
  const variableBindings = buildVariableBindings(currentProduction, currentProject);

  connection.console.log(`Variable bindings:`);
  for (const [varName, vertices] of variableBindings.entries()) {
    connection.console.log(`  <${varName}> -> ${Array.from(vertices).join(', ')}`);
  }

  // Get the current line text to detect attribute path context
  const line = textDoc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line, character: params.position.character },
  });

  // Find the variable context - look backwards for unclosed (<varname>
  let contextVarName: string | null = null;
  const beforeCursor = textDoc.getText({
    start: { line: Math.max(0, params.position.line - 10), character: 0 },
    end: params.position,
  });

  const openParens: Array<{ varName: string; pos: number }> = [];
  const openParenRegex = /\(<([a-zA-Z0-9_-]+)>/g;
  let match;

  while ((match = openParenRegex.exec(beforeCursor)) !== null) {
    openParens.push({ varName: match[1], pos: match.index });
  }

  const closeParens: number[] = [];
  const closeParenRegex = /\)/g;
  while ((match = closeParenRegex.exec(beforeCursor)) !== null) {
    closeParens.push(match.index);
  }

  // Find most recent unclosed paren
  for (let i = openParens.length - 1; i >= 0; i--) {
    const open = openParens[i];
    const closesAfter = closeParens.filter(c => c > open.pos).length;
    const opensAfter = openParens.slice(i + 1).length;

    if (closesAfter < opensAfter + 1) {
      contextVarName = open.varName;
      connection.console.log(`Context variable: <${contextVarName}>`);
      break;
    }
  }

  // Check if we're completing an attribute path
  // Pattern 1: Complete path with trailing dot (e.g., "^io." or "^io.input-link.")
  const attributePathMatch = line.match(/\^([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\./);

  // Pattern 2: Partial path without trailing dot (e.g., "^io.input" or "^io.input-link")
  const partialPathMatch = line.match(/\^([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*)$/);

  if ((attributePathMatch || partialPathMatch) && currentProject) {
    let pathSegments: string[];
    let isPartial = false;

    if (attributePathMatch) {
      // Complete path: "^io." → navigate to io and suggest children
      const attributePath = attributePathMatch[1];
      pathSegments = attributePath.split('.');
      connection.console.log(`Completing after: ^${attributePath}.`);
    } else {
      // Partial path: "^io.input" → navigate to io and suggest children starting with "input"
      const fullPath = partialPathMatch![1];
      const parts = fullPath.split('.');
      const lastPart = parts.pop()!; // The partial part being typed
      pathSegments = parts; // Navigate to the parent
      isPartial = true;
      connection.console.log(
        `Completing partial: ^${fullPath} (navigating to ^${parts.join('.')})`
      );
    }

    // Get starting vertices from variable bindings
    let startVertices: string[];
    if (contextVarName && variableBindings.has(contextVarName)) {
      startVertices = Array.from(variableBindings.get(contextVarName)!);
      connection.console.log(`Starting from <${contextVarName}>: ${startVertices.join(', ')}`);
    } else {
      startVertices = [currentProject.project.datamap.rootId];
      connection.console.log(`Starting from root: ${startVertices[0]}`);
    }

    // Navigate the path from starting vertices
    const targetVertices = findTargetVerticesForPath(startVertices, pathSegments, currentProject);

    connection.console.log(`Target vertices after navigation: ${targetVertices.join(', ')}`);

    // Get attributes from all target vertices
    for (const targetVertexId of targetVertices) {
      const targetVertex = currentProject.datamapIndex.get(targetVertexId);

      if (targetVertex && targetVertex.type === 'SOAR_ID') {
        const attributes = projectLoader.getVertexAttributes(targetVertexId, currentProject);
        connection.console.log(
          `  Vertex ${targetVertexId} has ${attributes.length} attributes: ${attributes
            .map(a => a.name)
            .join(', ')}`
        );
        for (const attr of attributes) {
          if (!completions.find(c => c.label === attr.name)) {
            completions.push({
              label: attr.name,
              kind: CompletionItemKind.Property,
              detail: attr.comment || 'Datamap attribute',
              documentation: `From vertex: ${attr.toId}`,
              insertText: attr.name,
            });
          }
        }
      } else if (targetVertex && targetVertex.type === 'ENUMERATION') {
        for (const choice of targetVertex.choices) {
          if (!completions.find(c => c.label === choice)) {
            completions.push({
              label: choice,
              kind: CompletionItemKind.EnumMember,
              detail: 'Enumeration value',
              insertText: choice,
            });
          }
        }
      }
    }

    if (completions.length > 0) {
      return completions;
    }
  }

  // Detect if we're completing after "^" (root attribute)
  const rootAttrMatch = line.match(/\^[a-zA-Z0-9_-]*$/);

  if (currentProject && rootAttrMatch) {
    connection.console.log(`Completing root attribute in context: <${contextVarName || 'root'}>`);

    // Get starting vertices from variable bindings or use root
    let startVertices: string[];
    if (contextVarName && variableBindings.has(contextVarName)) {
      startVertices = Array.from(variableBindings.get(contextVarName)!);
      connection.console.log(`Using vertices for <${contextVarName}>: ${startVertices.join(', ')}`);
    } else {
      startVertices = [currentProject.project.datamap.rootId];
      connection.console.log(`Using root vertex: ${startVertices[0]}`);
    }

    // Get attributes from all starting vertices
    for (const vertexId of startVertices) {
      const attributes = projectLoader.getVertexAttributes(vertexId, currentProject);

      for (const attr of attributes) {
        if (!completions.find(c => c.label === attr.name)) {
          completions.push({
            label: attr.name,
            kind: CompletionItemKind.Property,
            detail: attr.comment || 'Datamap attribute',
            documentation: `From vertex: ${attr.toId}`,
            insertText: attr.name,
          });
        }
      }
    }

    connection.console.log(`Added ${completions.length} attribute completions`);

    if (completions.length > 0) {
      return completions;
    }
  }

  // Add production names
  for (const production of doc.productions) {
    completions.push({
      label: production.name,
      kind: CompletionItemKind.Function,
      detail: `${production.type} production`,
      insertText: production.name,
    });
  }

  // Add common Soar keywords
  const keywords = ['sp', 'gp', 'state', 'operator', 'impasse', 'type', 'name', 'item'];
  for (const keyword of keywords) {
    completions.push({
      label: keyword,
      kind: CompletionItemKind.Keyword,
      insertText: keyword,
    });
  }

  return completions;
});

// Go to Definition
connection.onDefinition((params: DefinitionParams): Location | null => {
  const doc = parsedDocuments.get(params.textDocument.uri);
  if (!doc) {
    return null;
  }

  const position = params.position;

  // Find production at position
  for (const production of doc.productions) {
    if (isPositionInRange(position, production.range)) {
      // Check if on variable reference
      for (const [varName, variable] of production.variables) {
        for (const ref of variable.references) {
          if (isPositionInRange(position, ref)) {
            // Jump to variable definition
            return {
              uri: params.textDocument.uri,
              range: {
                start: {
                  line: variable.range.start.line,
                  character: variable.range.start.character,
                },
                end: { line: variable.range.end.line, character: variable.range.end.character },
              },
            };
          }
        }
      }
    }
  }

  return null;
});

// Document Symbols
connection.onDocumentSymbol((params: DocumentSymbolParams): SymbolInformation[] => {
  const doc = parsedDocuments.get(params.textDocument.uri);
  if (!doc) {
    return [];
  }

  const symbols: SymbolInformation[] = [];

  for (const production of doc.productions) {
    symbols.push({
      name: production.name,
      kind: SymbolKind.Function,
      location: {
        uri: params.textDocument.uri,
        range: {
          start: { line: production.range.start.line, character: production.range.start.character },
          end: { line: production.range.end.line, character: production.range.end.character },
        },
      },
    });
  }

  return symbols;
});

// Helper function
function isPositionInRange(
  position: { line: number; character: number },
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
): boolean {
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

// Make the text document manager listen on the connection
documents.listen(connection);

// Start listening
connection.listen();
