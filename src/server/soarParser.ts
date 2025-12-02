/**
 * Soar Parser for LSP
 * 
 * Parses Soar productions to extract structure for LSP features.
 * This is a simplified regex-based parser - can be enhanced with a proper grammar later.
 */

import {
    SoarDocument,
    SoarProduction,
    ProductionType,
    SoarDiagnostic,
    DiagnosticSeverity,
    Range,
    Position,
    SoarVariable,
    SoarAttribute,
    SoarFunctionCall
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
                severity: DiagnosticSeverity.error,
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
                    severity: DiagnosticSeverity.error,
                    source: 'soar-parser'
                });
            }
        }
    }

    private parseProduction(content: string, startOffset: number, lines: string[]): SoarProduction | null {
        // Extract production type
        const typeMatch = content.substring(startOffset).match(/^(sp|gp)\s*\{/);
        if (!typeMatch) {
            return null;
        }

        const type = typeMatch[1] as 'sp' | 'gp';

        // Find production name (first identifier after {)
        const afterBrace = content.substring(startOffset + typeMatch[0].length);
        const nameMatch = afterBrace.match(/^\s*([a-zA-Z][a-zA-Z0-9_*-]*)/);
        if (!nameMatch) {
            throw new Error('Production name not found');
        }

        const name = nameMatch[1];
        const nameStart = startOffset + typeMatch[0].length + (nameMatch.index || 0);
        const nameEnd = nameStart + nameMatch[0].trimStart().length;

        // Find matching closing brace
        const { endOffset, hasError } = this.findMatchingBrace(content, startOffset);

        if (hasError) {
            throw new Error('Unmatched opening brace');
        }

        const production: SoarProduction = {
            name,
            type: type === 'sp' ? ProductionType.sp : ProductionType.gp,
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
                start: { line: basePosition.line, character: basePosition.character + match.index },
                end: { line: basePosition.line, character: basePosition.character + match.index + match[0].length }
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
        const attributeRegex = /(-?)\^([a-zA-Z][a-zA-Z0-9_-]*)/g;
        while ((match = attributeRegex.exec(body)) !== null) {
            const isNegated = match[1] === '-';
            const attrName = match[2];

            production.attributes.push({
                name: attrName,
                range: {
                    start: { line: basePosition.line, character: basePosition.character + match.index },
                    end: { line: basePosition.line, character: basePosition.character + match.index + match[0].length }
                },
                isNegated
            });
        }

        // Parse function calls
        const functionRegex = /\(([a-zA-Z][a-zA-Z0-9_+-/*]*)/g;
        while ((match = functionRegex.exec(body)) !== null) {
            production.functionCalls.push({
                name: match[1],
                args: [],
                range: {
                    start: { line: basePosition.line, character: basePosition.character + match.index },
                    end: { line: basePosition.line, character: basePosition.character + match.index + match[0].length }
                }
            });
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
        return { line: Math.max(0, lines.length - 1), character: 0 };
    }
}
