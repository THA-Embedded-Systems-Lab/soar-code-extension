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
        projectContext: ProjectContext
    ): ValidationError[] {
        const errors: ValidationError[] = [];

        console.log(`\n=== Validating document with ${document.productions.length} productions ===`);
        console.log(`Total vertices in datamap: ${projectContext.project.datamap.vertices.length}`);

        for (const production of document.productions) {
            console.log(`\nProduction: ${production.name}, attributes: ${production.attributes.length}`);
            production.attributes.forEach(attr => {
                console.log(`  - ^${attr.name} (negated: ${attr.isNegated})`);
            });

            const productionErrors = this.validateProduction(production, projectContext);
            errors.push(...productionErrors);
        }

        console.log(`\nTotal validation errors: ${errors.length}\n`);
        return errors;
    }

    /**
     * Validate a single production against the datamap
     */
    private validateProduction(
        production: SoarProduction,
        projectContext: ProjectContext
    ): ValidationError[] {
        const errors: ValidationError[] = [];

        // Build a map of variable bindings to their potential vertex IDs
        const variableBindings = new Map<string, Set<string>>();

        // Start with common root bindings
        const rootId = projectContext.project.datamap.rootId;
        variableBindings.set('s', new Set([rootId])); // <s> typically binds to root state

        // First pass: build variable bindings by following attribute paths with variable values
        console.log(`\n=== Building variable bindings for production: ${production.name} ===`);
        console.log(`Initial binding: <s> -> ${rootId}`);

        for (const attr of production.attributes) {
            if (!attr.parentId || !attr.value || !attr.value.startsWith('<')) {
                continue; // Only process variable bindings like (<s> ^operator <o>)
            }

            console.log(`\nProcessing: (<${attr.parentId}> ^${attr.name} ${attr.value})`);

            // Get the parent vertex IDs
            const parentVertices = variableBindings.get(attr.parentId);
            if (!parentVertices) {
                console.log(`  Parent <${attr.parentId}> not bound yet - skipping`);
                continue; // Parent not bound yet
            }

            console.log(`  Parent <${attr.parentId}> bound to: ${Array.from(parentVertices).join(', ')}`);

            // Navigate the attribute path from parent vertices to find target vertices
            const targetVertices = this.findTargetVerticesForPath(
                Array.from(parentVertices),
                attr.name.split('.'),
                projectContext
            );

            console.log(`  Navigating ^${attr.name} -> found ${targetVertices.length} target vertices: ${targetVertices.join(', ')}`);

            // Bind the variable to these target vertices
            const varName = attr.value.substring(1, attr.value.length - 1); // Remove < >
            if (!variableBindings.has(varName)) {
                variableBindings.set(varName, new Set());
            }
            targetVertices.forEach(v => variableBindings.get(varName)!.add(v));

            console.log(`  Bound ${attr.value} to: ${Array.from(variableBindings.get(varName)!).join(', ')}`);
        }

        console.log(`\n=== Final variable bindings: ===`);
        for (const [varName, vertices] of variableBindings.entries()) {
            console.log(`  <${varName}> -> ${Array.from(vertices).join(', ')}`);
        }

        // Second pass: validate attributes
        for (const attr of production.attributes) {
            // Try to validate this attribute
            const error = this.validateAttribute(
                attr,
                production,
                projectContext,
                variableBindings
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
        variableBindings: Map<string, Set<string>>
    ): ValidationError | null {
        // Skip negated attributes for now (they test for absence)
        if (attr.isNegated) {
            return null;
        }

        // Check if datamap has any vertices
        if (!projectContext.project.datamap.vertices || projectContext.project.datamap.vertices.length === 0) {
            return null; // Don't report errors if datamap isn't loaded
        }

        // Check if attribute exists anywhere in the datamap
        const existsInDatamap = this.attributeExistsInDatamap(attr.name, projectContext);

        if (!existsInDatamap) {
            // Attribute doesn't exist anywhere - likely a typo
            return {
                production: production.name,
                attribute: attr.name,
                attributePath: `^${attr.name}`,
                line: attr.range.start.line,
                column: attr.range.start.character,
                range: attr.range,
                message: `Attribute '^${attr.name}' not found in project datamap`,
                severity: 'error'
            };
        }

        // If attribute has a value, check if it's valid for enumeration types
        if (attr.value && !attr.value.startsWith('<')) {
            // Skip if value is a variable (starts with '<')
            const enumError = this.validateEnumerationValue(attr, production, projectContext, variableBindings);
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
     */
    private attributeExistsInDatamap(
        attributeName: string,
        projectContext: ProjectContext
    ): boolean {
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
     * Validate that an attribute value matches enumeration choices
     * This checks enumerations reachable via the specific attribute path from the parent identifier context
     */
    private validateEnumerationValue(
        attr: SoarAttribute,
        production: SoarProduction,
        projectContext: ProjectContext,
        variableBindings: Map<string, Set<string>>
    ): ValidationError | null {
        if (!attr.value) {
            return null;
        }

        const attrValue = attr.value; // Type guard: now TypeScript knows it's not undefined
        const pathSegments = attr.name.split('.');

        // Determine starting vertices based on parent identifier context
        let startVertexIds: string[];
        if (attr.parentId && variableBindings.has(attr.parentId)) {
            // Use the specific vertex IDs bound to this parent identifier
            startVertexIds = Array.from(variableBindings.get(attr.parentId)!);
        } else {
            // Fallback: search globally (but this should rarely happen with proper parsing)
            startVertexIds = [projectContext.project.datamap.rootId];
        }

        // Find all enumeration vertices reachable via this specific path from the context vertices
        const reachableEnumerations = this.findEnumerationsForPathFromVertices(pathSegments, startVertexIds, projectContext);

        // If no enumeration vertices found for this path, it's not an enumeration - no error
        if (reachableEnumerations.length === 0) {
            return null;
        }

        // Check if the value is valid in ANY of the reachable enumerations
        const validInAnyContext = reachableEnumerations.some(e => e.choices.includes(attrValue));

        if (validInAnyContext) {
            // Value is valid in at least one context - no error
            return null;
        }

        // Value is invalid in ALL reachable contexts
        // Collect all valid choices from all enumerations reachable via this path
        const allValidChoices = new Set<string>();
        for (const enumInfo of reachableEnumerations) {
            enumInfo.choices.forEach(choice => allValidChoices.add(choice));
        }

        const validChoices = Array.from(allValidChoices).sort().join(', ');
        const lastSegment = pathSegments[pathSegments.length - 1];

        return {
            production: production.name,
            attribute: attr.name,
            attributePath: `^${attr.name}`,
            line: attr.range.start.line,
            column: attr.range.start.character,
            range: attr.range,
            message: `Invalid enumeration value '${attrValue}' for attribute '^${lastSegment}'. Valid choices: ${validChoices}`,
            severity: 'error'
        };
    }

    /**
     * Find all enumeration vertices reachable via a specific attribute path from given starting vertices
     * This provides context-aware enumeration lookup based on parent identifier bindings
     */
    private findEnumerationsForPathFromVertices(
        pathSegments: string[],
        startVertexIds: string[],
        projectContext: ProjectContext
    ): Array<{ vertexId: string; choices: string[] }> {
        const enumerations: Array<{ vertexId: string; choices: string[] }> = [];
        const seenVertexIds = new Set<string>();

        if (pathSegments.length === 0) {
            return enumerations;
        }

        // Navigate from each starting vertex
        for (const startVertexId of startVertexIds) {
            const foundEnums = this.findEnumerationsFromVertex(
                startVertexId,
                pathSegments,
                projectContext
            );

            // Add unique enumerations
            for (const enumInfo of foundEnums) {
                if (!seenVertexIds.has(enumInfo.vertexId)) {
                    seenVertexIds.add(enumInfo.vertexId);
                    enumerations.push(enumInfo);
                }
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

            // Find the edge with this attribute name
            const matchingEdge = vertex.outEdges?.find(e => e.name === firstSegment);
            if (matchingEdge) {
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
     * Find enumerations by navigating from a starting vertex through path segments
     * Now starts from the given vertex and navigates the full path
     */
    private findEnumerationsFromVertex(
        startVertexId: string,
        pathSegments: string[],
        projectContext: ProjectContext
    ): Array<{ vertexId: string; choices: string[] }> {
        const enumerations: Array<{ vertexId: string; choices: string[] }> = [];

        // Base case: no more path segments
        if (pathSegments.length === 0) {
            // Check if current vertex is an enumeration
            const vertex = projectContext.datamapIndex.get(startVertexId);
            if (vertex && vertex.type === 'ENUMERATION') {
                enumerations.push({
                    vertexId: startVertexId,
                    choices: vertex.choices
                });
            }
            return enumerations;
        }

        // Navigate to next segment
        const vertex = projectContext.datamapIndex.get(startVertexId);
        if (!vertex || vertex.type !== 'SOAR_ID') {
            return enumerations;
        }

        const firstSegment = pathSegments[0];
        const remainingSegments = pathSegments.slice(1);

        // Find the edge with this name (should be unique within this vertex)
        const matchingEdge = vertex.outEdges?.find(e => e.name === firstSegment);

        if (matchingEdge) {
            const foundEnums = this.findEnumerationsFromVertex(
                matchingEdge.toId,
                remainingSegments,
                projectContext
            );
            enumerations.push(...foundEnums);
        }

        return enumerations;
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
                    message: `Vertex '${currentVertexId}' not found in datamap`
                };
            }

            if (vertex.type !== 'SOAR_ID') {
                return {
                    valid: false,
                    invalidSegment: segment,
                    message: `Vertex '${currentVertexId}' is not a SOAR_ID (cannot have attributes)`
                };
            }

            // Find the edge with this attribute name
            const edge = vertex.outEdges?.find(e => e.name === segment);
            if (!edge) {
                return {
                    valid: false,
                    invalidSegment: segment,
                    message: `Attribute '^${segment}' not found on vertex '${currentVertexId}'`
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
                distance: this.levenshteinDistance(attributeName, name)
            }))
            .filter(item => item.distance <= 3) // Only suggest if reasonably close
            .sort((a, b) => a.distance - b.distance)
            .slice(0, maxSuggestions)
            .map(item => item.name);

        return suggestions;
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const m = str1.length;
        const n = str2.length;
        const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

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
                        dp[i - 1][j] + 1,    // deletion
                        dp[i][j - 1] + 1,    // insertion
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
    createDiagnostics(
        errors: ValidationError[],
        document: vscode.TextDocument
    ): vscode.Diagnostic[] {
        return errors.map(error => {
            // Use the range from the parser which has the correct line/column positions
            const range = new vscode.Range(
                error.range.start.line,
                error.range.start.character,
                error.range.end.line,
                error.range.end.character
            );

            const severity =
                error.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                    error.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                        vscode.DiagnosticSeverity.Information;

            const diagnostic = new vscode.Diagnostic(
                range,
                error.message,
                severity
            );

            diagnostic.source = 'soar-datamap';
            return diagnostic;
        });
    }
}
