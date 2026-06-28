/**
 * Soar Parser for LSP
 *
 * A Chevrotain-based parser. The document is tokenized once; each
 * `(sp|gp) { ... }` production block is isolated at the token level (so
 * top-level CLI commands such as `source`/`pushd` are ignored) and parsed
 * strictly by the grammar in `soarGrammar.ts`. Lexer and parser errors are
 * surfaced as diagnostics, and a CST walk produces the `SoarProduction`
 * structure (variables, attributes, function calls) consumed by the LSP,
 * datamap validator, and MCP layers.
 */

import { IToken, CstNode, CstElement, ILexingError, IRecognitionException } from 'chevrotain';
import {
  SoarDocument,
  SoarProduction,
  ProductionType,
  DiagnosticSeverity,
  Range,
  Position,
  SoarVariable,
  SoarAttribute,
  SoarFunctionCall,
} from './soarTypes';
import { soarLexer, Sp, Gp, LCurly, RCurly, Variable } from './soarLexer';
import { soarGrammar } from './soarGrammar';

/** Convert a Chevrotain token to a 0-based Range. */
function tokenRange(token: IToken): Range {
  return {
    start: { line: (token.startLine ?? 1) - 1, character: (token.startColumn ?? 1) - 1 },
    end: { line: (token.endLine ?? 1) - 1, character: token.endColumn ?? 1 },
  };
}

function tokenStart(token: IToken): Position {
  return { line: (token.startLine ?? 1) - 1, character: (token.startColumn ?? 1) - 1 };
}

function tokenEnd(token: IToken): Position {
  return { line: (token.endLine ?? 1) - 1, character: token.endColumn ?? 1 };
}

const ZERO_RANGE: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

export class SoarParser {
  parse(uri: string, content: string, version: number): SoarDocument {
    const document: SoarDocument = {
      uri,
      version,
      content,
      productions: [],
      errors: [],
    };

    const lexResult = soarLexer.tokenize(content);

    const tokens = lexResult.tokens;
    const blockSpans: Array<{ start: number; end: number }> = [];
    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      if ((tok.tokenType === Sp || tok.tokenType === Gp) && tokens[i + 1]?.tokenType === LCurly) {
        const end = this.findMatchingCurly(tokens, i + 1);
        if (end === -1) {
          // Unterminated production (common while typing): report it, but still
          // best-effort parse the remaining tokens so completion/hover work.
          document.errors.push({
            range: tokenRange(tok),
            message: 'Unmatched opening brace: production is missing its closing }',
            severity: DiagnosticSeverity.error,
            source: 'soar-parser',
          });
          const tail = tokens.slice(i);
          blockSpans.push({ start: tok.startOffset ?? 0, end: Number.MAX_SAFE_INTEGER });
          this.parseProductionTokens(tail, document, true);
          break;
        }

        const slice = tokens.slice(i, end + 1);
        blockSpans.push({
          start: tok.startOffset ?? 0,
          end: tokens[end].endOffset ?? Number.MAX_SAFE_INTEGER,
        });
        this.parseProductionTokens(slice, document);
        i = end + 1;
      } else {
        i++;
      }
    }

    // Only surface lexing errors that fall inside a production block; top-level
    // CLI commands (source/pushd/paths/…) are not Soar productions.
    for (const lexError of lexResult.errors) {
      const offset = lexError.offset ?? -1;
      if (blockSpans.some(span => offset >= span.start && offset <= span.end)) {
        document.errors.push(this.lexErrorToDiagnostic(lexError));
      }
    }

    return document;
  }

  /** Find the token index of the `}` matching the `{` at openIndex. */
  private findMatchingCurly(tokens: IToken[], openIndex: number): number {
    let depth = 0;
    for (let j = openIndex; j < tokens.length; j++) {
      if (tokens[j].tokenType === LCurly) {
        depth++;
      } else if (tokens[j].tokenType === RCurly) {
        depth--;
        if (depth === 0) {
          return j;
        }
      }
    }
    return -1;
  }

  private parseProductionTokens(
    slice: IToken[],
    document: SoarDocument,
    suppressErrors = false
  ): void {
    soarGrammar.input = slice;
    const cst = (soarGrammar as unknown as { production: () => CstNode | undefined }).production();

    if (!suppressErrors) {
      for (const err of soarGrammar.errors) {
        document.errors.push(this.parseErrorToDiagnostic(err, slice));
      }
    }

    const production = this.buildProduction(slice, cst);
    if (production) {
      document.productions.push(production);
    }
  }

  private buildProduction(slice: IToken[], cst: CstNode | undefined): SoarProduction | null {
    const first = slice[0];
    const last = slice[slice.length - 1];
    const type = first.tokenType === Gp ? ProductionType.gp : ProductionType.sp;

    const nameToken = cst ? this.findFirstToken(cst, 'productionName') : undefined;
    const name = nameToken ? nameToken.image : '';

    const production: SoarProduction = {
      name,
      type,
      range: { start: tokenStart(first), end: tokenEnd(last) },
      nameRange: nameToken ? tokenRange(nameToken) : ZERO_RANGE,
      variables: new Map<string, SoarVariable>(),
      attributes: [],
      functionCalls: [],
    };

    // Variables: every <var> token in the block (definition + references).
    for (const tok of slice) {
      if (tok.tokenType === Variable) {
        const varName = tok.image.slice(1, -1);
        const range = tokenRange(tok);
        const existing = production.variables.get(varName);
        if (existing) {
          existing.references.push(range);
        } else {
          production.variables.set(varName, { name: varName, range, references: [] });
        }
      }
    }

    // Attributes (LHS conditions + RHS makes) and function calls.
    if (cst) {
      this.collectFromCst(cst, production, undefined);
    }

    return production;
  }

  /**
   * Walk the CST collecting attributes (with their parent identifier context)
   * and function calls. `parentId` is the identifier the current attribute
   * makes/tests hang off of.
   */
  private collectFromCst(
    node: CstNode,
    production: SoarProduction,
    parentId: string | undefined
  ): void {
    const ruleName = node.name;

    if (ruleName === 'positiveCondition') {
      const idParent = this.resolveConditionParent(node);
      const attrTests = (node.children.attrValueTest as CstNode[]) || [];
      for (const at of attrTests) {
        this.collectAttribute(at, production, idParent);
      }
      return;
    }

    if (ruleName === 'makeAction') {
      const idTok = (node.children.Variable as IToken[])?.[0];
      const idParent = idTok ? idTok.image.slice(1, -1) : undefined;
      const makes = (node.children.attrValueMake as CstNode[]) || [];
      for (const mk of makes) {
        this.collectAttribute(mk, production, idParent);
      }
      // Function-call values may appear inside makes.
      this.recurseChildren(node, production, idParent);
      return;
    }

    if (ruleName === 'functionCall') {
      this.collectFunctionCall(node, production);
      this.recurseChildren(node, production, parentId);
      return;
    }

    this.recurseChildren(node, production, parentId);
  }

  private recurseChildren(
    node: CstNode,
    production: SoarProduction,
    parentId: string | undefined
  ): void {
    for (const key of Object.keys(node.children)) {
      for (const child of node.children[key]) {
        if (this.isCstNode(child)) {
          this.collectFromCst(child, production, parentId);
        }
      }
    }
  }

  /** The identifier a condition's attributes attach to (the variable, else the constant). */
  private resolveConditionParent(positiveCondition: CstNode): string | undefined {
    const idTest = (positiveCondition.children.idTest as CstNode[])?.[0];
    if (!idTest) {
      return undefined;
    }
    const terms = (idTest.children.term as CstNode[]) || [];
    let lastConst: string | undefined;
    for (const term of terms) {
      const variable = (term.children.Variable as IToken[])?.[0];
      if (variable) {
        return variable.image.slice(1, -1);
      }
      const sym = (term.children.Symbol as IToken[])?.[0];
      if (sym) {
        lastConst = sym.image;
      }
    }
    return lastConst;
  }

  /**
   * Build SoarAttribute entries for one attrValueTest / attrValueMake node,
   * expanding dotted-path disjunctions and multiple values like the previous
   * parser did.
   */
  private collectAttribute(
    node: CstNode,
    production: SoarProduction,
    parentId: string | undefined
  ): void {
    const isNegated = !!(node.children.Minus as IToken[])?.length;
    const caret = (node.children.Caret as IToken[])?.[0];
    const pathNode = (node.children.attributePath as CstNode[])?.[0];
    if (!pathNode) {
      return;
    }

    const names = this.expandAttributePaths(pathNode);
    if (names.length === 0) {
      return;
    }

    const values = this.collectValues(node);

    const startPos = caret ? tokenStart(caret) : tokenStart(this.firstTokenOf(pathNode)!);
    const endTok = this.lastTokenOf(pathNode);
    const range: Range = {
      start: startPos,
      end: endTok ? tokenEnd(endTok) : startPos,
    };

    for (const name of names) {
      if (values.length === 0) {
        production.attributes.push({ name, range, value: undefined, isNegated, parentId });
      } else {
        for (const value of values) {
          production.attributes.push({ name, range, value, isNegated, parentId });
        }
      }
    }
  }

  /** Produce one or more dotted-path strings, expanding `<< a b >>` segments. */
  private expandAttributePaths(pathNode: CstNode): string[] {
    const segNodes = (pathNode.children.attributeSegment as CstNode[]) || [];
    const dotCount = (pathNode.children.Dot as IToken[])?.length || 0;

    let trailingDot = dotCount >= segNodes.length && segNodes.length > 0;

    let combos: string[][] = [[]];
    for (const seg of segNodes) {
      const variable = (seg.children.Variable as IToken[])?.[0];
      if (variable) {
        // A variable path segment terminates the static path (e.g. ^io.foo.<x>).
        trailingDot = true;
        break;
      }

      const sym = (seg.children.Symbol as IToken[])?.[0];
      const int = (seg.children.Integer as IToken[])?.[0];
      const disj = (seg.children.disjunction as CstNode[])?.[0];

      if (sym || int) {
        const part = (sym ?? int)!.image;
        combos = combos.map(c => [...c, part]);
      } else if (disj) {
        const choices = this.disjunctionChoices(disj);
        const next: string[][] = [];
        for (const c of combos) {
          for (const choice of choices) {
            next.push([...c, choice]);
          }
        }
        combos = next;
      }
    }

    const suffix = trailingDot ? '.' : '';
    return combos.filter(c => c.length > 0).map(c => c.join('.') + suffix);
  }

  private disjunctionChoices(disj: CstNode): string[] {
    const terms = (disj.children.term as CstNode[]) || [];
    const out: string[] = [];
    for (const term of terms) {
      const tok = this.firstTokenOf(term);
      if (tok) {
        out.push(tok.image);
      }
    }
    return out;
  }

  /** All value terms under an attribute node (variables keep their <>). */
  private collectValues(node: CstNode): string[] {
    const values: string[] = [];
    const visit = (n: CstNode) => {
      if (n.name === 'term') {
        const tok = this.firstTokenOf(n);
        if (tok) {
          values.push(tok.image);
        }
        return;
      }
      for (const key of Object.keys(n.children)) {
        for (const child of n.children[key]) {
          if (this.isCstNode(child)) {
            visit(child);
          }
        }
      }
    };

    // Visit only the value side (skip the attributePath child).
    for (const key of Object.keys(node.children)) {
      if (key === 'attributePath') {
        continue;
      }
      for (const child of node.children[key]) {
        if (this.isCstNode(child)) {
          visit(child);
        }
      }
    }
    return values;
  }

  private collectFunctionCall(node: CstNode, production: SoarProduction): void {
    const nameNode = (node.children.functionName as CstNode[])?.[0];
    const lparen = (node.children.LParen as IToken[])?.[0];
    const nameTok = nameNode ? this.firstTokenOf(nameNode) : undefined;
    if (!nameTok) {
      return;
    }
    const args: string[] = [];
    const makes = (node.children.valueMake as CstNode[]) || [];
    for (const mk of makes) {
      const tok = this.firstTokenOf(mk);
      if (tok) {
        args.push(tok.image);
      }
    }
    production.functionCalls.push({
      name: nameTok.image,
      args,
      range: lparen ? tokenRange(lparen) : tokenRange(nameTok),
    });
  }

  // ---- CST helpers -------------------------------------------------------

  private isCstNode(el: CstElement): el is CstNode {
    return (el as CstNode).children !== undefined;
  }

  private findFirstToken(node: CstNode, ruleName: string): IToken | undefined {
    if (node.name === ruleName) {
      return this.firstTokenOf(node);
    }
    for (const key of Object.keys(node.children)) {
      for (const child of node.children[key]) {
        if (this.isCstNode(child)) {
          const found = this.findFirstToken(child, ruleName);
          if (found) {
            return found;
          }
        }
      }
    }
    return undefined;
  }

  private firstTokenOf(node: CstNode): IToken | undefined {
    let best: IToken | undefined;
    const visit = (n: CstNode) => {
      for (const key of Object.keys(n.children)) {
        for (const child of n.children[key]) {
          if (this.isCstNode(child)) {
            visit(child);
          } else {
            const tok = child as IToken;
            if (!best || (tok.startOffset ?? 0) < (best.startOffset ?? 0)) {
              best = tok;
            }
          }
        }
      }
    };
    visit(node);
    return best;
  }

  private lastTokenOf(node: CstNode): IToken | undefined {
    let best: IToken | undefined;
    const visit = (n: CstNode) => {
      for (const key of Object.keys(n.children)) {
        for (const child of n.children[key]) {
          if (this.isCstNode(child)) {
            visit(child);
          } else {
            const tok = child as IToken;
            if (!best || (tok.endOffset ?? 0) > (best.endOffset ?? 0)) {
              best = tok;
            }
          }
        }
      }
    };
    visit(node);
    return best;
  }

  // ---- diagnostics -------------------------------------------------------

  private lexErrorToDiagnostic(err: ILexingError): {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    source: string;
  } {
    const line = (err.line ?? 1) - 1;
    const character = (err.column ?? 1) - 1;
    return {
      range: {
        start: { line, character },
        end: { line, character: character + (err.length ?? 1) },
      },
      message: `Unexpected character(s): ${err.message}`,
      severity: DiagnosticSeverity.error,
      source: 'soar-parser',
    };
  }

  private parseErrorToDiagnostic(
    err: IRecognitionException,
    slice: IToken[]
  ): { range: Range; message: string; severity: DiagnosticSeverity; source: string } {
    const token = err.token && err.token.startLine !== undefined ? err.token : slice[0];
    return {
      range: token ? tokenRange(token) : ZERO_RANGE,
      message: err.message,
      severity: DiagnosticSeverity.error,
      source: 'soar-parser',
    };
  }
}
