/**
 * Soar Grammar (Chevrotain CstParser)
 *
 * Parses a single Soar production `(sp|gp) { name [doc] [flags] LHS --> RHS }`.
 * The document-level scanner (soarParser.ts) isolates each production block and
 * runs this parser on it, so top-level CLI commands (source/pushd/...) never
 * reach the grammar. Strictness lives here: any token that does not fit the
 * production grammar yields a Chevrotain parse error.
 */

/* eslint-disable @typescript-eslint/naming-convention -- Chevrotain's grammar DSL uses uppercase method/property names (RULE, OR, ALT, GATE, …). */
import { CstParser } from 'chevrotain';
import * as t from './soarLexer';

export class SoarGrammar extends CstParser {
  constructor() {
    super(t.allTokens, { recoveryEnabled: true });
    this.performSelfAnalysis();
  }

  // production := (Sp | Gp) LCurly name doc? flag* condition* Arrow action* RCurly
  public production = this.RULE('production', () => {
    this.OR([{ ALT: () => this.CONSUME(t.Sp) }, { ALT: () => this.CONSUME(t.Gp) }]);
    this.CONSUME(t.LCurly);
    this.SUBRULE(this.productionName);
    this.OPTION(() => this.CONSUME(t.DocString));
    this.MANY(() => this.CONSUME(t.Flag));
    this.MANY1(() => this.SUBRULE(this.condition));
    this.MANY3(() => this.CONSUME1(t.Flag));
    this.CONSUME(t.Arrow);
    this.MANY2(() => this.SUBRULE(this.action));
    this.CONSUME(t.RCurly);
  });

  // The name is the first symbol after the brace.
  public productionName = this.RULE('productionName', () => {
    this.CONSUME(t.Symbol);
  });

  // ---- LHS ---------------------------------------------------------------

  public condition = this.RULE('condition', () => {
    this.OPTION(() => this.CONSUME(t.Minus));
    this.OR([
      { ALT: () => this.SUBRULE(this.conjunctiveCondition) },
      { ALT: () => this.SUBRULE(this.positiveCondition) },
    ]);
  });

  public conjunctiveCondition = this.RULE('conjunctiveCondition', () => {
    this.CONSUME(t.LCurly);
    this.MANY(() => this.SUBRULE(this.condition));
    this.CONSUME(t.RCurly);
  });

  // (idTest attrValueTest*)
  public positiveCondition = this.RULE('positiveCondition', () => {
    this.CONSUME(t.LParen);
    this.SUBRULE(this.idTest);
    this.MANY(() => this.SUBRULE(this.attrValueTest));
    this.CONSUME(t.RParen);
  });

  // The identifier part of a condition: an optional type keyword ("state"/
  // "impasse"/constant) followed by the id term(s), everything up to the first
  // caret. We accept any run of non-caret value terms.
  public idTest = this.RULE('idTest', () => {
    this.AT_LEAST_ONE(() => this.SUBRULE(this.term));
  });

  // -^path test test ...
  public attrValueTest = this.RULE('attrValueTest', () => {
    this.OPTION(() => this.CONSUME(t.Minus));
    this.CONSUME(t.Caret);
    this.SUBRULE(this.attributePath);
    this.MANY(() => this.SUBRULE(this.valueTest));
  });

  public attributePath = this.RULE('attributePath', () => {
    this.SUBRULE(this.attributeSegment);
    this.MANY(() => {
      this.CONSUME(t.Dot);
      this.OPTION(() => this.SUBRULE2(this.attributeSegment));
    });
  });

  public attributeSegment = this.RULE('attributeSegment', () => {
    this.OR([
      { ALT: () => this.CONSUME(t.Symbol) },
      { ALT: () => this.CONSUME(t.Integer) },
      { ALT: () => this.CONSUME(t.Variable) },
      { ALT: () => this.SUBRULE(this.disjunction) },
    ]);
  });

  public valueTest = this.RULE('valueTest', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.relationalTest) },
      { ALT: () => this.SUBRULE(this.conjunctiveTest) },
      { ALT: () => this.SUBRULE(this.disjunction) },
      { ALT: () => this.SUBRULE(this.term) },
    ]);
  });

  public relationalTest = this.RULE('relationalTest', () => {
    this.OR([
      { ALT: () => this.CONSUME(t.SameType) },
      { ALT: () => this.CONSUME(t.NotEqual) },
      { ALT: () => this.CONSUME(t.LessEqual) },
      { ALT: () => this.CONSUME(t.GreaterEqual) },
      { ALT: () => this.CONSUME(t.Less) },
      { ALT: () => this.CONSUME(t.Greater) },
      { ALT: () => this.CONSUME(t.Equal) },
    ]);
    this.OPTION(() => this.SUBRULE(this.term));
  });

  public conjunctiveTest = this.RULE('conjunctiveTest', () => {
    this.CONSUME(t.LCurly);
    this.MANY(() => this.SUBRULE(this.valueTest));
    this.CONSUME(t.RCurly);
  });

  public disjunction = this.RULE('disjunction', () => {
    this.CONSUME(t.DisjOpen);
    this.MANY(() => this.SUBRULE(this.term));
    this.CONSUME(t.DisjClose);
  });

  // ---- RHS ---------------------------------------------------------------

  public action = this.RULE('action', () => {
    this.OR([
      { GATE: () => this.LA(2).tokenType === t.Variable, ALT: () => this.SUBRULE(this.makeAction) },
      { ALT: () => this.SUBRULE(this.functionCall) },
    ]);
  });

  // (<id> ^attr value pref ... ^attr2 ...)
  public makeAction = this.RULE('makeAction', () => {
    this.CONSUME(t.LParen);
    this.CONSUME(t.Variable);
    this.MANY(() => this.SUBRULE(this.attrValueMake));
    this.CONSUME(t.RParen);
  });

  public attrValueMake = this.RULE('attrValueMake', () => {
    this.OPTION(() => this.CONSUME(t.Minus));
    this.CONSUME(t.Caret);
    this.SUBRULE(this.attributePath);
    // Stop before a following `-^attr` so the reject-preference Minus is not
    // mistaken for a negated attribute (and vice-versa).
    this.MANY({
      GATE: () => !(this.LA(1).tokenType === t.Minus && this.LA(2).tokenType === t.Caret),
      DEF: () => this.SUBRULE(this.valueMake),
    });
  });

  public valueMake = this.RULE('valueMake', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.functionCall) },
      { ALT: () => this.SUBRULE(this.term) },
      { ALT: () => this.SUBRULE(this.preference) },
    ]);
  });

  // (func-name arg ...)
  public functionCall = this.RULE('functionCall', () => {
    this.CONSUME(t.LParen);
    this.SUBRULE(this.functionName);
    this.MANY(() => this.SUBRULE(this.valueMake));
    this.CONSUME(t.RParen);
  });

  public functionName = this.RULE('functionName', () => {
    this.OR([
      { ALT: () => this.CONSUME(t.Symbol) },
      { ALT: () => this.CONSUME(t.Plus) },
      { ALT: () => this.CONSUME(t.Minus) },
      { ALT: () => this.CONSUME(t.Less) },
      { ALT: () => this.CONSUME(t.Greater) },
      { ALT: () => this.CONSUME(t.Equal) },
    ]);
  });

  // RHS preference markers (unary): + - = ! ~ @ and binary >/< handled as terms.
  public preference = this.RULE('preference', () => {
    this.OR([
      { ALT: () => this.CONSUME(t.Plus) },
      { ALT: () => this.CONSUME(t.Minus) },
      { ALT: () => this.CONSUME(t.Equal) },
      { ALT: () => this.CONSUME(t.Bang) },
      { ALT: () => this.CONSUME(t.Tilde) },
      { ALT: () => this.CONSUME(t.At) },
      { ALT: () => this.CONSUME(t.Ampersand) },
      { ALT: () => this.CONSUME(t.Greater) },
      { ALT: () => this.CONSUME(t.Less) },
    ]);
  });

  // A primitive value: variable, constant, number, or string.
  public term = this.RULE('term', () => {
    this.OR([
      { ALT: () => this.CONSUME(t.Variable) },
      { ALT: () => this.CONSUME(t.Symbol) },
      { ALT: () => this.CONSUME(t.Float) },
      { ALT: () => this.CONSUME(t.Integer) },
      { ALT: () => this.CONSUME(t.PipeString) },
    ]);
  });
}

export const soarGrammar = new SoarGrammar();
