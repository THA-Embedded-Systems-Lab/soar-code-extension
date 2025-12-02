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

        // Process attributes and build variable bindings
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

        // Attribute exists somewhere in datamap - assume it's valid
        return null;
    }

    /**
     * Check if an attribute exists anywhere in the datamap
     */
    private attributeExistsInDatamap(
        attributeName: string,
        projectContext: ProjectContext
    ): boolean {
        // Search all SOAR_ID vertices for an outgoing edge with this name
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
