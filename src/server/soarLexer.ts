/**
 * Soar Lexer (Chevrotain)
 *
 * Tokenizes Soar source. Soar is largely whitespace-delimited: a symbolic
 * constant is a maximal run of identifier characters that does NOT start with a
 * digit or a structural/operator character. Operators (`+ - = < > ! ~ @`),
 * brackets, the caret and dotted-path separators are only significant when they
 * are not part of such a run, which the token ordering below encodes.
 */

/* eslint-disable @typescript-eslint/naming-convention -- Chevrotain token types are conventionally PascalCase constants. */
import { createToken, Lexer, TokenType } from 'chevrotain';

// --- skipped trivia -------------------------------------------------------

export const Comment = createToken({
  name: 'Comment',
  pattern: /#[^\n]*/,
  group: Lexer.SKIPPED,
});

export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[ \t\r\n]+/,
  group: Lexer.SKIPPED,
});

// --- literals that must win over operators --------------------------------

// Soar pipe-quoted string: |...| with \| and \\ escapes. Closing pipe required.
export const PipeString = createToken({
  name: 'PipeString',
  pattern: /\|(?:\\.|[^|\\])*\|/,
});

// Double-quoted documentation string.
export const DocString = createToken({
  name: 'DocString',
  pattern: /"(?:\\.|[^"\\])*"/,
});

export const Arrow = createToken({ name: 'Arrow', pattern: /-->/ });

// Disjunction brackets must beat the relational `<` / `>` tokens.
export const DisjOpen = createToken({ name: 'DisjOpen', pattern: /<</ });
export const DisjClose = createToken({ name: 'DisjClose', pattern: />>/ });

// A Soar variable: <...> with no whitespace/structural chars inside.
export const Variable = createToken({
  name: 'Variable',
  pattern: /<[A-Za-z_*][^<>\s(){}^|]*>/,
});

// Relational test operators (longer forms first).
export const SameType = createToken({ name: 'SameType', pattern: /<=>/ });
export const NotEqual = createToken({ name: 'NotEqual', pattern: /<>/ });
export const LessEqual = createToken({ name: 'LessEqual', pattern: /<=/ });
export const GreaterEqual = createToken({ name: 'GreaterEqual', pattern: />=/ });
export const Less = createToken({ name: 'Less', pattern: /</ });
export const Greater = createToken({ name: 'Greater', pattern: />/ });

// Structural.
export const LCurly = createToken({ name: 'LCurly', pattern: /{/ });
export const RCurly = createToken({ name: 'RCurly', pattern: /}/ });
export const LParen = createToken({ name: 'LParen', pattern: /\(/ });
export const RParen = createToken({ name: 'RParen', pattern: /\)/ });
export const Caret = createToken({ name: 'Caret', pattern: /\^/ });
export const Dot = createToken({ name: 'Dot', pattern: /\./ });

// Production flags: :i-support, :o-support, :chunk, :default, :interrupt, :template
export const Flag = createToken({ name: 'Flag', pattern: /:[A-Za-z][A-Za-z0-9-]*/ });

// Numbers (signed). Float before Integer; both before Minus.
export const Float = createToken({ name: 'Float', pattern: /-?\d+\.\d+/ });
export const Integer = createToken({ name: 'Integer', pattern: /-?\d+/ });

// Single-character operators / preferences.
export const Plus = createToken({ name: 'Plus', pattern: /\+/ });
export const Equal = createToken({ name: 'Equal', pattern: /=/ });
export const Bang = createToken({ name: 'Bang', pattern: /!/ });
export const Tilde = createToken({ name: 'Tilde', pattern: /~/ });
export const At = createToken({ name: 'At', pattern: /@/ });
export const Ampersand = createToken({ name: 'Ampersand', pattern: /&/ });
export const Minus = createToken({ name: 'Minus', pattern: /-/ });

// Symbolic constant / attribute name. Starts with a letter or '*', then any run
// of identifier chars EXCLUDING '.' (dotted paths) and the structural chars.
export const Symbol = createToken({
  name: 'Symbol',
  pattern: /[A-Za-z_*][A-Za-z0-9*+\-%&/:=?_!@~$]*/,
});

// Production keywords. `longer_alt: Symbol` so `sprint` lexes as a Symbol.
export const Sp = createToken({ name: 'Sp', pattern: /sp/, longer_alt: Symbol });
export const Gp = createToken({ name: 'Gp', pattern: /gp/, longer_alt: Symbol });

// Order matters: Chevrotain tries tokens in array order (with longest-match
// where regexes overlap at the same start).
export const allTokens: TokenType[] = [
  Comment,
  WhiteSpace,
  PipeString,
  DocString,
  Arrow,
  DisjOpen,
  DisjClose,
  Variable,
  SameType,
  NotEqual,
  LessEqual,
  GreaterEqual,
  Less,
  Greater,
  LCurly,
  RCurly,
  LParen,
  RParen,
  Caret,
  Dot,
  Flag,
  Float,
  Integer,
  Plus,
  Equal,
  Bang,
  Tilde,
  At,
  Ampersand,
  Minus,
  Sp,
  Gp,
  Symbol,
];

export const soarLexer = new Lexer(allTokens, { positionTracking: 'full' });
