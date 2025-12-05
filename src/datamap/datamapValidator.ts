/**
 * Datamap Validator
 *
 * Validates Soar code against the datamap structure in the project file
 */

import * as vscode from 'vscode';
import { ProjectContext } from '../server/visualSoarProject';
import { SoarDocument, SoarProduction, SoarAttribute } from '../server/soarTypes';

export interface ValidationError {
  production: string;
  attribute: string;
  attributePath: string;
  line: number;
  column: number;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export class DatamapValidator {
  /**
   * Validate a parsed Soar document against the project datamap
   */
  validateDocument(
    document: SoarDocument,
    projectContext: ProjectContext,
    documentText?: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const production of document.productions) {
      const productionErrors = this.validateProduction(production, projectContext, documentText);
      errors.push(...productionErrors);
    }

    return errors;
  }

  /**
   * Validate a single production against the datamap
   */
  private validateProduction(
    production: SoarProduction,
    projectContext: ProjectContext,
    documentText?: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build a map of variable bindings to their potential vertex IDs
    const variableBindings = new Map<string, Set<string>>();

    // Start with common root bindings
    const rootId = projectContext.project.datamap.rootId;
    variableBindings.set('s', new Set([rootId])); // <s> typically binds to root state

    // First pass: build variable bindings by following attribute paths with variable values
    for (const attr of production.attributes) {
      if (!attr.parentId || !attr.value || !attr.value.startsWith('<')) {
        continue; // Only process variable bindings like (<s> ^operator <o>)
      }

      // Get the parent vertex IDs
      const parentVertices = variableBindings.get(attr.parentId);
      if (!parentVertices) {
        continue; // Parent not bound yet
      }

      // Navigate the attribute path from parent vertices to find target vertices
      const targetVertices = this.findTargetVerticesForPath(
        Array.from(parentVertices),
        attr.name.split('.'),
        projectContext
      );

      // Bind the variable to these target vertices
      const varName = attr.value.substring(1, attr.value.length - 1); // Remove < >
      if (!variableBindings.has(varName)) {
        variableBindings.set(varName, new Set());
      }
      targetVertices.forEach(v => variableBindings.get(varName)!.add(v));
    }

    // Check for unbound variables (except <s> which is always bound to root)
    for (const attr of production.attributes) {
      if (attr.parentId && attr.parentId !== 's' && !variableBindings.has(attr.parentId)) {
        // Calculate precise range for the variable identifier
        const line = attr.range.start.line;
        const variableText = `<${attr.parentId}>`;
        const variableLength = variableText.length;

        let varStartCol = attr.range.start.character - variableLength - 2; // Default estimate

        // If we have document text, find the exact position
        if (documentText) {
          const lines = documentText.split('\n');
          if (line < lines.length) {
            const lineText = lines[line];
            const varIndex = lineText.indexOf(variableText);
            if (varIndex !== -1) {
              varStartCol = varIndex;
            }
          }
        }

        errors.push({
          production: production.name,
          attribute: attr.name,
          attributePath: `<${attr.parentId}> ^${attr.name}`,
          line: line,
          column: varStartCol,
          range: {
            start: { line: line, character: varStartCol },
            end: { line: line, character: varStartCol + variableLength },
          },
          message: `Variable <${attr.parentId}> is not bound. Variables must be connected to the state through attribute paths.`,
          severity: 'error',
        });
      }
    }

    // Second pass: validate attributes
    for (const attr of production.attributes) {
      // Try to validate this attribute
      const error = this.validateAttribute(
        attr,
        production,
        projectContext,
        variableBindings,
        documentText
      );

      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Validate a single attribute
   *
   * Strategy: Only warn about attributes that don't exist ANYWHERE in the datamap.
   * This catches obvious typos while avoiding false positives from context issues.
   * Also validates enumeration values if the attribute has a value.
   */
  private validateAttribute(
    attr: SoarAttribute,
    production: SoarProduction,
    projectContext: ProjectContext,
    variableBindings: Map<string, Set<string>>,
    documentText?: string
  ): ValidationError | null {
    // Skip negated attributes for now (they test for absence)
    if (attr.isNegated) {
      return null;
    }

    // Check if datamap has any vertices
    if (
      !projectContext.project.datamap.vertices ||
      projectContext.project.datamap.vertices.length === 0
    ) {
      return null; // Don't report errors if datamap isn't loaded
    }

    // Check if attribute exists anywhere in the datamap
    const existsInDatamap = this.attributeExistsInDatamap(attr.name, projectContext);

    if (!existsInDatamap) {
      // Attribute doesn't exist anywhere - find the specific invalid segment
      const pathAnalysis = this.findFirstInvalidSegment(attr.name, projectContext);

      let message: string;
      if (pathAnalysis.invalidSegment) {
        // Dotted path with a specific invalid segment
        if (pathAnalysis.lastValidParent) {
          message = `'${pathAnalysis.invalidSegment}' is not a valid attribute for '${pathAnalysis.lastValidParent}'`;
        } else {
          message = `Attribute '^${pathAnalysis.invalidSegment}' not found in project datamap`;
        }
      } else {
        // Simple attribute not found
        message = `Attribute '^${attr.name}' not found in project datamap`;
      }

      // Get precise range for the attribute
      const preciseRange = this.findAttributeRange(attr, documentText);

      return {
        production: production.name,
        attribute: attr.name,
        attributePath: `^${attr.name}`,
        line: preciseRange.start.line,
        column: preciseRange.start.character,
        range: preciseRange,
        message,
        severity: 'error',
      };
    }

    // If attribute has a value, check if it's valid for enumeration types
    if (attr.value && !attr.value.startsWith('<')) {
      // Skip if value is a variable (starts with '<')
      const enumError = this.validateEnumerationValue(
        attr,
        production,
        projectContext,
        variableBindings,
        documentText
      );
      if (enumError) {
        return enumError;
      }
    }

    // Attribute exists somewhere in datamap - assume it's valid
    return null;
  }

  /**
   * Check if an attribute exists anywhere in the datamap
   * Handles both simple attributes and dotted paths (e.g., "inplace-object.name", "above.type")
   *
   * For dotted paths (parent.child):
   * - Find all vertices that have an attribute named "parent"
   * - Check if the target vertex of "parent" has an attribute named "child"
   *
   * Special handling for ^superstate paths:
   * In the top state, ^superstate points to an ENUMERATION ("nil"), but in substates,
   * ^superstate points to the parent state (a SOAR_ID with the same structure as the root).
   * Generic substate elaborations like "^superstate.operator.name" are valid even though
   * they don't apply to the top state. We validate such paths against the root state structure.
   */
  private attributeExistsInDatamap(attributeName: string, projectContext: ProjectContext): boolean {
    const pathSegments = attributeName.split('.');

    // If it's a simple attribute (no dots), check if it exists anywhere
    if (pathSegments.length === 1) {
      for (const vertex of projectContext.project.datamap.vertices) {
        if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
          for (const edge of vertex.outEdges) {
            if (edge.name === attributeName) {
              return true;
            }
          }
        }
      }
      return false;
    }

    // For dotted paths: parent.child.grandchild...
    // Find all vertices that have the first segment (parent) as an attribute
    // Then navigate through the remaining segments (child.grandchild...)

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    // Special case: ^superstate.* paths
    // These are meant for substates where ^superstate points to a parent state.
    // Validate the remaining path against the root state structure.
    if (firstSegment === 'superstate') {
      const rootId = projectContext.project.datamap.rootId;
      if (this.canNavigatePath(rootId, remainingSegments, projectContext)) {
        return true;
      }
    }

    // Search for all vertices that have an attribute named firstSegment
    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.name === firstSegment) {
            // Found a parent attribute, now try to navigate the remaining path
            if (this.canNavigatePath(edge.toId, remainingSegments, projectContext)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Find the first invalid segment in a dotted attribute path
   * Returns the invalid segment and the last valid parent attribute
   */
  private findFirstInvalidSegment(
    attributeName: string,
    projectContext: ProjectContext
  ): { invalidSegment?: string; lastValidParent?: string } {
    const pathSegments = attributeName.split('.');

    // If it's a simple attribute (no dots), just return it as invalid
    if (pathSegments.length === 1) {
      return { invalidSegment: attributeName };
    }

    // For dotted paths, try to navigate as far as possible
    // Check all possible starting vertices that have the first segment

    const firstSegment = pathSegments[0];

    // Special case: ^superstate.* paths
    if (firstSegment === 'superstate') {
      const rootId = projectContext.project.datamap.rootId;
      const result = this.findInvalidSegmentInPath(
        rootId,
        pathSegments.slice(1),
        projectContext,
        'superstate'
      );
      if (result) {
        return result;
      }
    }

    // Search for all vertices that have an attribute named firstSegment
    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.name === firstSegment) {
            const result = this.findInvalidSegmentInPath(
              edge.toId,
              pathSegments.slice(1),
              projectContext,
              firstSegment
            );
            if (result) {
              return result;
            }
          }
        }
      }
    }

    // If we couldn't find the first segment anywhere, it's the invalid one
    return { invalidSegment: firstSegment };
  }

  /**
   * Helper: Navigate a path and find where it becomes invalid
   */
  private findInvalidSegmentInPath(
    startVertexId: string,
    pathSegments: string[],
    projectContext: ProjectContext,
    lastValidParent: string
  ): { invalidSegment: string; lastValidParent: string } | null {
    if (pathSegments.length === 0) {
      return null; // Path is valid
    }

    const vertex = projectContext.datamapIndex.get(startVertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      // The parent exists but isn't a SOAR_ID, so the next segment is invalid
      return {
        invalidSegment: pathSegments[0],
        lastValidParent,
      };
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    // Find edge with the name of the first segment
    const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];

    if (matchingEdges.length === 0) {
      // This segment doesn't exist on the current vertex
      return {
        invalidSegment: firstSegment,
        lastValidParent,
      };
    }

    // Try to navigate deeper from each matching edge
    for (const edge of matchingEdges) {
      if (remainingSegments.length > 0) {
        const result = this.findInvalidSegmentInPath(
          edge.toId,
          remainingSegments,
          projectContext,
          firstSegment
        );
        if (result) {
          return result;
        }
      } else {
        // Successfully navigated the entire path
        return null;
      }
    }

    return null;
  }

  /**
   * Helper: Check if a path can be navigated from a starting vertex
   * Handles cases where an attribute has multiple possible target vertices
   * (e.g., holding can point to both "nothing" enum and a block object)
   */
  private canNavigatePath(
    startVertexId: string,
    pathSegments: string[],
    projectContext: ProjectContext
  ): boolean {
    if (pathSegments.length === 0) {
      return true;
    }

    const vertex = projectContext.datamapIndex.get(startVertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return false;
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    // Find ALL edges with the name of the first segment
    // Try to navigate the remaining path from each target
    const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];

    for (const edge of matchingEdges) {
      // If there are more segments, recursively check if we can navigate from the target
      if (remainingSegments.length > 0) {
        if (this.canNavigatePath(edge.toId, remainingSegments, projectContext)) {
          return true;
        }
      } else {
        // No more segments - we successfully navigated the path
        return true;
      }
    }

    return false;
  }

  /**
   * Validate enumeration values using variable bindings for context
   * Only checks enumerations that the attribute actually points to based on variable bindings
   */
  private validateEnumerationValue(
    attr: SoarAttribute,
    production: SoarProduction,
    projectContext: ProjectContext,
    variableBindings: Map<string, Set<string>>,
    documentText?: string
  ): ValidationError | null {
    if (!attr.value) {
      return null;
    }

    // Skip validation for '-' which is used for WME removal on RHS
    if (attr.value === '-') {
      return null;
    }

    const attrValue = attr.value;
    const pathSegments = attr.name.split('.');
    const lastSegment = pathSegments[pathSegments.length - 1];

    // Try to find the specific vertices this attribute refers to based on variable bindings
    let enumerations: Array<{ vertexId: string; choices: string[] }> = [];

    if (attr.parentId && variableBindings.has(attr.parentId)) {
      // We know which vertices the parent variable is bound to - use specific context
      const parentVertices = Array.from(variableBindings.get(attr.parentId)!);
      const targetVertices = this.findTargetVerticesForPath(
        parentVertices,
        pathSegments,
        projectContext
      );

      // Check if any target vertices are enumerations
      for (const vertexId of targetVertices) {
        const vertex = projectContext.datamapIndex.get(vertexId);
        if (vertex && vertex.type === 'ENUMERATION') {
          enumerations.push({
            vertexId: vertexId,
            choices: vertex.choices,
          });
        }
      }
    } else {
      // No binding information - fall back to global search (for RHS or unbound variables)
      enumerations = this.findAllEnumerationsForAttribute(pathSegments, projectContext);
    }

    // If no enumerations found, the attribute doesn't point to an enum - no error
    if (enumerations.length === 0) {
      return null;
    }

    // Check if value is valid in any of the enumerations
    const isValid = enumerations.some(enumInfo => enumInfo.choices.includes(attrValue));

    if (isValid) {
      return null;
    }

    // Collect all valid choices
    const allValidChoices = new Set<string>();
    for (const enumInfo of enumerations) {
      enumInfo.choices.forEach(choice => allValidChoices.add(choice));
    }

    const validChoices = Array.from(allValidChoices).sort().join(', ');

    // Get precise range for the attribute
    const preciseRange = this.findAttributeRange(attr, documentText);

    return {
      production: production.name,
      attribute: attr.name,
      attributePath: `^${attr.name}`,
      line: preciseRange.start.line,
      column: preciseRange.start.character,
      range: preciseRange,
      message: `Invalid enumeration value '${attrValue}' for attribute '^${lastSegment}'. Valid choices: ${validChoices}`,
      severity: 'error',
    };
  }

  /**
   * Find all enumerations for an attribute path anywhere in the datamap
   * This is a simplified approach that searches globally
   */
  private findAllEnumerationsForAttribute(
    pathSegments: string[],
    projectContext: ProjectContext
  ): Array<{ vertexId: string; choices: string[] }> {
    const enumerations: Array<{ vertexId: string; choices: string[] }> = [];
    const seenVertexIds = new Set<string>();

    // Search all vertices in the datamap
    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }

      // Try to navigate the path from this vertex
      const reachableEnums = this.navigatePathFromVertex(vertex.id, pathSegments, projectContext);

      for (const enumInfo of reachableEnums) {
        if (!seenVertexIds.has(enumInfo.vertexId)) {
          seenVertexIds.add(enumInfo.vertexId);
          enumerations.push(enumInfo);
        }
      }
    }

    return enumerations;
  }

  /**
   * Navigate a path from a vertex and return any enumerations found
   */
  private navigatePathFromVertex(
    vertexId: string,
    pathSegments: string[],
    projectContext: ProjectContext
  ): Array<{ vertexId: string; choices: string[] }> {
    if (pathSegments.length === 0) {
      return [];
    }

    const vertex = projectContext.datamapIndex.get(vertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return [];
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);
    const enumerations: Array<{ vertexId: string; choices: string[] }> = [];

    // Find all edges matching the first segment
    const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];

    for (const edge of matchingEdges) {
      if (remainingSegments.length === 0) {
        // End of path - check if target is an enumeration
        const targetVertex = projectContext.datamapIndex.get(edge.toId);
        if (targetVertex && targetVertex.type === 'ENUMERATION') {
          enumerations.push({
            vertexId: edge.toId,
            choices: targetVertex.choices,
          });
        }
      } else {
        // Continue navigating
        const found = this.navigatePathFromVertex(edge.toId, remainingSegments, projectContext);
        enumerations.push(...found);
      }
    }

    return enumerations;
  }

  /**
   * Find target vertices reachable via an attribute path from starting vertices
   * Used to build variable bindings (e.g., (<s> ^operator <o>) binds <o> to operator vertices)
   */
  private findTargetVerticesForPath(
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

      // Find ALL edges with this attribute name (can have multiple, e.g., ^operator -> multiple operator types)
      const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];
      for (const matchingEdge of matchingEdges) {
        if (remainingSegments.length > 0) {
          // Recursively navigate remaining path
          const results = this.findTargetVerticesForPath(
            [matchingEdge.toId],
            remainingSegments,
            projectContext
          );
          results.forEach(v => targetVertices.add(v));
        } else {
          // End of path - this is a target vertex
          targetVertices.add(matchingEdge.toId);
        }
      }
    }

    return Array.from(targetVertices);
  }

  /**
   * Validate attribute path (e.g., "io.input-link.data")
   */
  validateAttributePath(
    path: string[],
    projectContext: ProjectContext,
    startVertexId?: string
  ): { valid: boolean; invalidSegment?: string; message?: string } {
    let currentVertexId = startVertexId || projectContext.project.datamap.rootId;

    for (let i = 0; i < path.length; i++) {
      const segment = path[i];
      const vertex = projectContext.datamapIndex.get(currentVertexId);

      if (!vertex) {
        return {
          valid: false,
          invalidSegment: segment,
          message: `Vertex '${currentVertexId}' not found in datamap`,
        };
      }

      if (vertex.type !== 'SOAR_ID') {
        return {
          valid: false,
          invalidSegment: segment,
          message: `Vertex '${currentVertexId}' is not a SOAR_ID (cannot have attributes)`,
        };
      }

      // Find the edge with this attribute name
      const edge = vertex.outEdges?.find(e => e.name === segment);
      if (!edge) {
        return {
          valid: false,
          invalidSegment: segment,
          message: `Attribute '^${segment}' not found on vertex '${currentVertexId}'`,
        };
      }

      currentVertexId = edge.toId;
    }

    return { valid: true };
  }

  /**
   * Get suggestions for a misspelled attribute
   */
  getSuggestionsForAttribute(
    attributeName: string,
    projectContext: ProjectContext,
    maxSuggestions: number = 3
  ): string[] {
    const allAttributes = new Set<string>();

    // Collect all attribute names from datamap
    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          allAttributes.add(edge.name);
        }
      }
    }

    // Calculate Levenshtein distance and find closest matches
    const suggestions = Array.from(allAttributes)
      .map(name => ({
        name,
        distance: this.levenshteinDistance(attributeName, name),
      }))
      .filter(item => item.distance <= 3) // Only suggest if reasonably close
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxSuggestions)
      .map(item => item.name);

    return suggestions;
  }

  /**
   * Find the precise range for an attribute name in the document
   * Searches for ^attributeName in the line to get exact position
   */
  private findAttributeRange(
    attr: SoarAttribute,
    documentText?: string
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {
    const line = attr.range.start.line;
    const attributeText = `^${attr.name}`;

    // If we have document text, search for the exact position
    if (documentText) {
      const lines = documentText.split('\n');
      if (line < lines.length) {
        const lineText = lines[line];
        const attrIndex = lineText.indexOf(attributeText);
        if (attrIndex !== -1) {
          return {
            start: { line: line, character: attrIndex },
            end: { line: line, character: attrIndex + attributeText.length },
          };
        }
      }
    }

    // Fallback to original range if we can't find it
    return attr.range;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1, // deletion
            dp[i][j - 1] + 1, // insertion
            dp[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Generate a diagnostic collection for VS Code
   */
  createDiagnostics(errors: ValidationError[], document: vscode.TextDocument): vscode.Diagnostic[] {
    return errors.map(error => {
      // Use the range from the parser which has the correct line/column positions
      const range = new vscode.Range(
        error.range.start.line,
        error.range.start.character,
        error.range.end.line,
        error.range.end.character
      );

      const severity =
        error.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : error.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;

      const diagnostic = new vscode.Diagnostic(range, error.message, severity);

      diagnostic.source = 'soar-datamap';
      return diagnostic;
    });
  }
}
