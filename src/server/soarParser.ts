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
  SoarFunctionCall,
} from './soarTypes';

export class SoarParser {
  parse(uri: string, content: string, version: number): SoarDocument {
    const document: SoarDocument = {
      uri,
      version,
      content,
      productions: [],
      errors: [],
    };

    try {
      this.parseProductions(content, document);
    } catch (error: any) {
      document.errors.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `Parse error: ${error.message}`,
        severity: DiagnosticSeverity.error,
        source: 'soar-parser',
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
        const production = this.parseProduction(content, match.index, lines, document);
        if (production) {
          document.productions.push(production);
        }
      } catch (error: any) {
        const pos = this.offsetToPosition(content, match.index, lines);
        document.errors.push({
          range: { start: pos, end: pos },
          message: `Production parse error: ${error.message}`,
          severity: DiagnosticSeverity.error,
          source: 'soar-parser',
        });
      }
    }
  }

  private parseProduction(
    content: string,
    startOffset: number,
    lines: string[],
    document: SoarDocument
  ): SoarProduction | null {
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
        end: this.offsetToPosition(content, endOffset, lines),
      },
      nameRange: {
        start: this.offsetToPosition(content, nameStart, lines),
        end: this.offsetToPosition(content, nameEnd, lines),
      },
      variables: new Map(),
      attributes: [],
      functionCalls: [],
    };

    // Parse body - calculate the base position where the body starts
    const bodyStartOffset = startOffset + typeMatch[0].length;
    const bodyBasePosition = this.offsetToPosition(content, bodyStartOffset, lines);
    const body = content.substring(bodyStartOffset, endOffset);
    this.parseProductionBody(body, production, bodyBasePosition, document);

    return production;
  }

  private findMatchingBrace(
    content: string,
    startOffset: number
  ): { endOffset: number; hasError: boolean } {
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

  private validateParentheses(
    body: string,
    production: SoarProduction,
    basePosition: Position,
    document: SoarDocument
  ): void {
    let parenCount = 0;
    const unmatchedOpens: number[] = [];

    for (let i = 0; i < body.length; i++) {
      const char = body[i];
      if (char === '(') {
        parenCount++;
        unmatchedOpens.push(i);
      } else if (char === ')') {
        parenCount--;
        if (parenCount < 0) {
          // Extra closing paren
          const pos = this.getPositionInBody(body, i, basePosition);
          document.errors.push({
            range: { start: pos, end: { line: pos.line, character: pos.character + 1 } },
            message: `Unexpected closing parenthesis`,
            severity: DiagnosticSeverity.error,
            source: 'soar-parser',
          });
          return;
        }
        unmatchedOpens.pop();
      }
    }

    if (parenCount > 0) {
      // Missing closing paren - report error at the last unmatched opening paren
      const errorPos = unmatchedOpens[unmatchedOpens.length - 1];
      const pos = this.getPositionInBody(body, errorPos, basePosition);
      document.errors.push({
        range: { start: pos, end: { line: pos.line, character: pos.character + 1 } },
        message: `Unmatched opening parenthesis (missing closing parenthesis)`,
        severity: DiagnosticSeverity.error,
        source: 'soar-parser',
      });
    }
  }

  private parseProductionBody(
    body: string,
    production: SoarProduction,
    basePosition: Position,
    document: SoarDocument
  ): void {
    // Check for unmatched parentheses
    this.validateParentheses(body, production, basePosition, document);

    // Parse variables
    const variableRegex = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;
    let match;

    while ((match = variableRegex.exec(body)) !== null) {
      const varName = match[1];
      const startPos = this.getPositionInBody(body, match.index, basePosition);
      const endPos = this.getPositionInBody(body, match.index + match[0].length, basePosition);
      const range: Range = { start: startPos, end: endPos };

      if (!production.variables.has(varName)) {
        production.variables.set(varName, {
          name: varName,
          range,
          references: [],
        });
      } else {
        production.variables.get(varName)!.references.push(range);
      }
    }

    // Parse attributes with their parent identifier context
    // Match: (<id> ^attribute value) patterns to understand context
    // Examples: (state <s> ^name blocks-world), (<s> ^done true), (<o> ^name initialize-blocks-world)
    // Pattern needs to handle both: (type <var> ^attr ...) and (<var> ^attr ...)
    // Capture everything from the variable to the closing paren
    const contextAttributeRegex =
      /\((?:[a-zA-Z][a-zA-Z0-9_-]*\s+)?<([a-zA-Z][a-zA-Z0-9_-]*)>\s+([^)]+)\)/g;
    while ((match = contextAttributeRegex.exec(body)) !== null) {
      const parentId = match[1]; // The identifier (without < >)
      const attributesBlock = match[2];
      const blockStartOffset = match.index + match[1].length + 1; // Position after "(<id> "

      // Parse each attribute within this context
      // Note: An attribute can have multiple values on the same line: ^object <a> <b> <c>
      const attributeRegex = /(-?)\^([a-zA-Z][a-zA-Z0-9_.-]*)/g;
      let attrMatch;
      while ((attrMatch = attributeRegex.exec(attributesBlock)) !== null) {
        const isNegated = attrMatch[1] === '-';
        const attrPath = attrMatch[2];
        const attrStartOffset = blockStartOffset + attrMatch.index;

        // Check if there are multiple values following this attribute
        // Pattern: ^attribute value1 value2 value3 (until next ^ or closing paren)
        let remainingText = attributesBlock.substring(attrMatch.index + attrMatch[0].length);
        const nextAttrMatch = remainingText.match(/\^/);
        const valuesText = remainingText.substring(
          0,
          nextAttrMatch ? nextAttrMatch.index : remainingText.length
        );

        // Collect all values from the text following the attribute
        // Note: Filter out standalone '-' which is a WME removal operator in RHS
        const values: string[] = [];
        const valueRegex = /([a-zA-Z0-9_-]+|<[a-zA-Z0-9_-]+>)/g;
        let valueMatch;
        while ((valueMatch = valueRegex.exec(valuesText)) !== null) {
          // Skip standalone '-' which is used for WME removal on RHS
          if (valueMatch[1] !== '-') {
            values.push(valueMatch[1]);
          }
        }

        // Create an attribute entry for each value (or one without value if none)
        if (values.length === 0) {
          const startPos = this.getPositionInBody(body, attrStartOffset, basePosition);
          const endPos = this.getPositionInBody(
            body,
            attrStartOffset + attrMatch[0].length,
            basePosition
          );
          production.attributes.push({
            name: attrPath,
            range: { start: startPos, end: endPos },
            value: undefined,
            isNegated,
            parentId,
          });
        } else {
          // Create separate attribute for each value
          for (const value of values) {
            const startPos = this.getPositionInBody(body, attrStartOffset, basePosition);
            const endPos = this.getPositionInBody(
              body,
              attrStartOffset + attrMatch[0].length,
              basePosition
            );
            production.attributes.push({
              name: attrPath,
              range: { start: startPos, end: endPos },
              value: value,
              isNegated,
              parentId,
            });
          }
        }
      }
    }

    // Parse function calls
    const functionRegex = /\(([a-zA-Z][a-zA-Z0-9_+-/*]*)/g;
    while ((match = functionRegex.exec(body)) !== null) {
      const startPos = this.getPositionInBody(body, match.index, basePosition);
      const endPos = this.getPositionInBody(body, match.index + match[0].length, basePosition);

      production.functionCalls.push({
        name: match[1],
        args: [],
        range: { start: startPos, end: endPos },
      });
    }
  }

  /**
   * Convert offset within production body to absolute position in document
   */
  private getPositionInBody(body: string, offset: number, basePosition: Position): Position {
    let line = basePosition.line;
    let character = basePosition.character;

    for (let i = 0; i < offset && i < body.length; i++) {
      if (body[i] === '\n') {
        line++;
        character = 0;
      } else {
        character++;
      }
    }

    return { line, character };
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
