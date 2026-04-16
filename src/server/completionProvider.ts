/**
 * Soar Datamap Completion Provider
 *
 * Core completion logic, extracted so it can be exercised by unit tests
 * without requiring a live LSP connection.
 */

import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { ProjectContext } from './visualSoarProject';
import { ProjectLoader } from './projectLoader';
import { SoarProduction } from './soarTypes';

/**
 * Build a map of variable name → set of datamap vertex IDs by tracing attribute
 * bindings in a production. `<s>` is pre-seeded with the project root vertex.
 */
export function buildVariableBindings(
  production: SoarProduction,
  projectContext: ProjectContext
): Map<string, Set<string>> {
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

    // A trailing dot means the final segment was a Soar variable used as an
    // attribute name (e.g. ^io.input-link.<messages> <id>).
    // The path up to the dot points to a SOAR_ID; the value variable is bound
    // to ALL children of that SOAR_ID (since any attribute matches).
    const trailingDot = attr.name.endsWith('.');
    const attrNameNormalized = trailingDot ? attr.name.slice(0, -1) : attr.name;

    let targetVertices = findTargetVerticesForPath(
      Array.from(parentVertices),
      attrNameNormalized.split('.'),
      projectContext
    );

    if (trailingDot) {
      // Collect all child vertex IDs from the resolved SOAR_ID nodes
      const childVertices = new Set<string>();
      for (const vid of targetVertices) {
        const v = projectContext.datamapIndex.get(vid);
        if (v?.type === 'SOAR_ID' && v.outEdges) {
          for (const edge of v.outEdges) {
            childVertices.add(edge.toId);
          }
        }
      }
      targetVertices = Array.from(childVertices);
    }

    const varName = attr.value.substring(1, attr.value.length - 1);
    if (!variableBindings.has(varName)) {
      variableBindings.set(varName, new Set());
    }
    targetVertices.forEach(v => variableBindings.get(varName)!.add(v));
  }

  return variableBindings;
}

/**
 * Navigate a dotted attribute path from one or more starting vertices and
 * return all reachable target vertex IDs.
 */
export function findTargetVerticesForPath(
  startVertexIds: string[],
  pathSegments: string[],
  projectContext: ProjectContext
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

/**
 * Split a Soar attribute path string into segments, respecting `<< ... >>`
 * disjunction blocks (which must not be split on the `.` inside them).
 *
 * Returns an array where each element is the list of alternatives for that
 * segment.  Normal segments produce a single-element array; disjunctions
 * produce one element per value.
 *
 * Example:
 *   "io.input-link.<< message-a message-b >>"
 *   → [["io"], ["input-link"], ["message-a", "message-b"]]
 */
function splitAttributePathSegments(pathStr: string): Array<string[]> {
  const raw: string[] = [];
  let current = '';
  let depth = 0; // nesting level inside << >>

  for (let i = 0; i < pathStr.length; i++) {
    if (pathStr[i] === '<' && pathStr[i + 1] === '<') {
      depth++;
      current += '<<';
      i++; // skip second '<'
    } else if (pathStr[i] === '>' && pathStr[i + 1] === '>') {
      depth--;
      current += '>>';
      i++; // skip second '>'
    } else if (pathStr[i] === '.' && depth === 0) {
      if (current.trim()) {
        raw.push(current.trim());
      }
      current = '';
    } else {
      current += pathStr[i];
    }
  }
  if (current.trim()) {
    raw.push(current.trim());
  }

  return raw.map(seg => {
    if (seg.startsWith('<<') && seg.endsWith('>>')) {
      return seg.slice(2, -2).trim().split(/\s+/).filter(Boolean);
    }
    return [seg];
  });
}

/**
 * Extract the attribute path from a line of Soar text after the last `^`.
 * Returns the parsed segments and whether the path had a trailing dot
 * (meaning the cursor is positioned to complete children of the final segment).
 * Returns null if no attribute path is found.
 */
function extractAttributePath(lineText: string): {
  segments: Array<string[]>;
  hasTrailingDot: boolean;
} | null {
  const caretPos = lineText.lastIndexOf('^');
  if (caretPos === -1) {
    return null;
  }

  const afterCaret = lineText.slice(caretPos + 1);

  // A trailing dot (possibly followed only by whitespace) means "complete children"
  const hasTrailingDot = /\.\s*$/.test(afterCaret);

  // Strip the trailing dot before parsing segments
  const pathPart = hasTrailingDot ? afterCaret.replace(/\.\s*$/, '') : afterCaret;

  const segments = splitAttributePathSegments(pathPart);
  if (segments.length === 0) {
    return null;
  }

  return { segments, hasTrailingDot };
}

/**
 * Navigate a sequence of segments (each a list of alternatives) from the
 * given starting vertices, returning all reachable vertex IDs.
 */
function navigateSegments(
  startVertices: string[],
  segments: Array<string[]>,
  projectContext: ProjectContext
): string[] {
  let current = startVertices;

  for (const alternatives of segments) {
    const next = new Set<string>();
    for (const alternative of alternatives) {
      const results = findTargetVerticesForPath(current, [alternative], projectContext);
      results.forEach(v => next.add(v));
    }
    current = Array.from(next);
    if (current.length === 0) {
      break;
    }
  }

  return current;
}

/**
 * Compute datamap-driven completion items for a given line of Soar text.
 *
 * @param lineText    Text of the current line up to the cursor position.
 * @param beforeCursor  Full text before the cursor (may span multiple lines).
 *                      Used to determine the current variable context from open
 *                      Triple-conditions.  Pass `lineText` when single-line
 *                      context is sufficient.
 * @param production  The production the cursor is inside, or null if unknown.
 *                    Used to resolve variable bindings.
 * @param projectContext  Loaded project context.
 * @param projectLoader   ProjectLoader instance for attribute retrieval.
 */
export function getDatamapCompletions(
  lineText: string,
  beforeCursor: string,
  production: SoarProduction | null,
  projectContext: ProjectContext,
  projectLoader: ProjectLoader
): CompletionItem[] {
  const completions: CompletionItem[] = [];

  // Build variable bindings from the production
  const variableBindings: Map<string, Set<string>> = production
    ? buildVariableBindings(production, projectContext)
    : new Map([['s', new Set([projectContext.project.datamap.rootId])]]);

  // Determine the current variable context from unclosed parens in beforeCursor
  let contextVarName: string | null = null;
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

  for (let i = openParens.length - 1; i >= 0; i--) {
    const open = openParens[i];
    const closesAfter = closeParens.filter(c => c > open.pos).length;
    const opensAfter = openParens.slice(i + 1).length;

    if (closesAfter < opensAfter + 1) {
      contextVarName = open.varName;
      break;
    }
  }

  // Determine starting vertices
  const startVertices: string[] =
    contextVarName && variableBindings.has(contextVarName)
      ? Array.from(variableBindings.get(contextVarName)!)
      : [projectContext.project.datamap.rootId];

  // Parse the attribute path after `^`, supporting `<< a b >>` disjunctions
  const parsedPath = extractAttributePath(lineText);

  if (parsedPath) {
    // Trailing dot → suggest child attributes of the navigated path.
    // No trailing dot → suggest enum values for the last (complete) attribute.
    if (parsedPath.hasTrailingDot) {
      const targetVertices = navigateSegments(startVertices, parsedPath.segments, projectContext);

      for (const targetVertexId of targetVertices) {
        const targetVertex = projectContext.datamapIndex.get(targetVertexId);

        if (targetVertex && targetVertex.type === 'SOAR_ID') {
          const attributes = projectLoader.getVertexAttributes(targetVertexId, projectContext);
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
    } else {
      // No trailing dot: navigate all segments and return enum values.
      const targetVertices = navigateSegments(startVertices, parsedPath.segments, projectContext);

      for (const targetVertexId of targetVertices) {
        const targetVertex = projectContext.datamapIndex.get(targetVertexId);
        if (targetVertex && targetVertex.type === 'ENUMERATION') {
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
    }

    return completions;
  } // end if (parsedPath)

  // --- Pattern 3: root attribute completion after "^" ---
  // e.g. "^io" or "^"
  const rootAttrMatch = lineText.match(/\^[a-zA-Z0-9_-]*$/);

  if (rootAttrMatch) {
    for (const vertexId of startVertices) {
      const attributes = projectLoader.getVertexAttributes(vertexId, projectContext);
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
  }

  return completions;
}
