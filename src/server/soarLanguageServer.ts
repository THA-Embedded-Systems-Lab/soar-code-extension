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

// Completion
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = parsedDocuments.get(params.textDocument.uri);
  if (!doc) {
    return [];
  }

  const completions: CompletionItem[] = [];

  // Get the text document for context analysis
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) {
    return completions;
  }

  // Get the current line text to detect attribute path context
  const line = textDoc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line, character: params.position.character },
  });

  // Debug logging
  connection.console.log(`Completion request at line: "${line}"`);
  connection.console.log(`Current project loaded: ${currentProject !== null}`);
  if (currentProject) {
    connection.console.log(`Root vertex: ${currentProject.project.datamap.rootId}`);
  }

  // Check if we're completing an attribute path (e.g., "^io." or "^io.input-link.")
  const attributePathMatch = line.match(/\^([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\./);

  connection.console.log(
    `Attribute path match: ${attributePathMatch ? attributePathMatch[0] : 'null'}`
  );

  if (attributePathMatch && currentProject) {
    // Parse the attribute path (e.g., "io.input-link")
    const attributePath = attributePathMatch[1];
    const pathSegments = attributePath.split('.');

    connection.console.log(
      `Navigating path: ${attributePath} (segments: ${pathSegments.join(', ')})`
    );

    // Navigate through the datamap following the path
    let currentVertexId = currentProject.project.datamap.rootId;
    let foundPath = true;

    for (const segment of pathSegments) {
      // Find the edge with this attribute name from the current vertex
      const vertex = currentProject.datamapIndex.get(currentVertexId);
      if (!vertex || vertex.type !== 'SOAR_ID') {
        foundPath = false;
        break;
      }

      const edge = vertex.outEdges?.find(e => e.name === segment);
      if (!edge) {
        foundPath = false;
        break;
      }

      currentVertexId = edge.toId;
    }

    // If we found a valid path from root, return those completions
    if (foundPath) {
      const targetVertex = currentProject.datamapIndex.get(currentVertexId);
      if (targetVertex && targetVertex.type === 'SOAR_ID') {
        const attributes = projectLoader.getVertexAttributes(currentVertexId, currentProject);
        for (const attr of attributes) {
          completions.push({
            label: attr.name,
            kind: CompletionItemKind.Property,
            detail: attr.comment || 'Datamap attribute',
            documentation: `Leads to vertex: ${attr.toId}`,
            insertText: attr.name,
          });
        }
        return completions;
      } else if (targetVertex && targetVertex.type === 'ENUMERATION') {
        // If it's an enumeration, suggest its choices
        for (const choice of targetVertex.choices) {
          completions.push({
            label: choice,
            kind: CompletionItemKind.EnumMember,
            detail: 'Enumeration value',
            insertText: choice,
          });
        }
        return completions;
      }
    }

    // Fallback: If path from root didn't work, search all vertices
    // This handles cases like "^input-link." where we're working with a bound variable
    connection.console.log(
      `Path from root not found, searching all vertices for: ${
        pathSegments[pathSegments.length - 1]
      }`
    );

    const lastSegment = pathSegments[pathSegments.length - 1];
    for (const vertex of currentProject.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.name === lastSegment) {
            // Found a vertex with this attribute name, get its children
            const targetVertexId = edge.toId;
            const targetVertex = currentProject.datamapIndex.get(targetVertexId);

            if (targetVertex && targetVertex.type === 'SOAR_ID') {
              const attributes = projectLoader.getVertexAttributes(targetVertexId, currentProject);
              for (const attr of attributes) {
                // Check if already added
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
          }
        }
      }
    }

    if (completions.length > 0) {
      return completions;
    }
  }

  // Detect if we're completing after "^"
  const rootAttrMatch = line.match(/\^[a-zA-Z0-9_-]*$/);
  connection.console.log(`Root attribute match: ${rootAttrMatch ? rootAttrMatch[0] : 'null'}`);

  if (currentProject && rootAttrMatch) {
    // Check if we're in a variable context
    // Need to look backwards to find the opening parenthesis with variable
    // Patterns to match:
    //   (<io> ^attr <x>
    //         ^     <- completing here, should use <io> context
    //   (<io> ^
    //         <- completing here, should use <io> context

    let varName: string | null = null;

    // Strategy: Look backwards from current position to find the opening (<varname>
    // that hasn't been closed yet
    const beforeCursor = textDoc.getText({
      start: { line: Math.max(0, params.position.line - 50), character: 0 },
      end: params.position,
    });

    // Find all opening variable patterns (<varname> that might apply
    // We need to find the most recent unclosed one
    const openParens: Array<{ varName: string; pos: number }> = [];
    const openParenRegex = /\(<([a-zA-Z0-9_-]+)>/g;
    let match;

    while ((match = openParenRegex.exec(beforeCursor)) !== null) {
      openParens.push({ varName: match[1], pos: match.index });
    }

    // Now find closing parens and match them
    const closeParenRegex = /\)/g;
    const closeParens: number[] = [];

    while ((match = closeParenRegex.exec(beforeCursor)) !== null) {
      closeParens.push(match.index);
    }

    // Find the most recent unclosed opening paren
    for (let i = openParens.length - 1; i >= 0; i--) {
      const open = openParens[i];
      // Count how many close parens are after this open
      const closesAfter = closeParens.filter(c => c > open.pos).length;
      const opensAfter = openParens.slice(i + 1).length;

      // If there are fewer closes than opens after this point, this paren is unclosed
      if (closesAfter < opensAfter + 1) {
        varName = open.varName;
        connection.console.log(`Variable context detected: <${varName}> (unclosed parenthesis)`);
        break;
      }
    }

    if (varName) {
      // Try to find what this variable is bound to in the production
      // Look for patterns like "^attribute <varname>" earlier in the document
      const fullText = textDoc.getText();

      // Simple heuristic: look for "<s> ^attrname <varname>"
      // This matches patterns like: "^io <io>" or "^input-link <in>"
      const bindingPattern = new RegExp(
        `\\^([a-zA-Z0-9_-]+(?:\\.[a-zA-Z0-9_-]+)*)\\s+<${varName}>`,
        'g'
      );
      let bindingMatch;
      const bindings: string[] = [];

      while ((bindingMatch = bindingPattern.exec(fullText)) !== null) {
        bindings.push(bindingMatch[1]);
      }

      connection.console.log(`Found bindings for <${varName}>: ${bindings.join(', ')}`);

      // For each binding, try to navigate the datamap and get completions
      for (const binding of bindings) {
        const pathSegments = binding.split('.');
        let currentVertexId = currentProject.project.datamap.rootId;
        let foundPath = true;

        for (const segment of pathSegments) {
          const vertex = currentProject.datamapIndex.get(currentVertexId);
          if (!vertex || vertex.type !== 'SOAR_ID') {
            foundPath = false;
            break;
          }

          const edge = vertex.outEdges?.find(e => e.name === segment);
          if (!edge) {
            foundPath = false;
            break;
          }

          currentVertexId = edge.toId;
        }

        if (foundPath) {
          const targetVertex = currentProject.datamapIndex.get(currentVertexId);
          if (targetVertex && targetVertex.type === 'SOAR_ID') {
            const attributes = projectLoader.getVertexAttributes(currentVertexId, currentProject);
            connection.console.log(
              `Adding ${attributes.length} attributes for <${varName}> bound to ${binding}`
            );

            for (const attr of attributes) {
              // Avoid duplicates
              if (!completions.find(c => c.label === attr.name)) {
                completions.push({
                  label: attr.name,
                  kind: CompletionItemKind.Property,
                  detail: attr.comment || `Attribute of ${binding}`,
                  documentation: `Leads to vertex: ${attr.toId}`,
                  insertText: attr.name,
                });
              }
            }

            // If we found completions from variable context, return them
            if (completions.length > 0) {
              return completions;
            }
          }
        }
      }
    }

    // Fallback: provide root-level attribute completions
    connection.console.log('Adding root-level attribute completions');
    const rootVertexId = currentProject.project.datamap.rootId;
    const attributes = projectLoader.getVertexAttributes(rootVertexId, currentProject);

    for (const attr of attributes) {
      completions.push({
        label: attr.name,
        kind: CompletionItemKind.Property,
        detail: attr.comment || 'Datamap attribute',
        documentation: `Leads to vertex: ${attr.toId}`,
        insertText: attr.name,
      });
    }

    connection.console.log(`Added ${attributes.length} root attributes`);
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
