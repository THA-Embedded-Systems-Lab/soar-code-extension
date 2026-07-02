/**
 * Core types for Soar language structures
 *
 * These types represent parsed Soar code elements for use in the LSP server.
 */

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export enum ProductionType {
  sp = 'sp',
  gp = 'gp',
}

export interface SoarVariable {
  name: string;
  range: Range;
  references: Range[];
}

export interface SoarAttribute {
  name: string;
  range: Range;
  value?: string;
  isNegated: boolean;
  parentId?: string; // The identifier this attribute is attached to (e.g., 's', 'o', 'i1')
  side?: 'lhs' | 'rhs'; // Whether the attribute is a condition test (LHS) or an action make (RHS)
  /**
   * When the attribute name is itself a bare variable (`^<var>`), the variable
   * it binds. Soar allows a variable in attribute position (it ranges over the
   * parent's attributes and can be dereferenced as an identifier, e.g. the
   * "duplicates table" idiom `(<d> ^<id> <v>) (<id> ^…)`). `name` is `''`
   * (wildcard) in this case; this field preserves the binding so the variable
   * isn't later reported as unbound.
   */
  attributeVariable?: string;
}

export interface SoarTest {
  operator: string; // <, >, <=, >=, <>, =, etc.
  value: string;
  range: Range;
}

export interface SoarFunctionCall {
  name: string;
  args: string[];
  range: Range;
}

export interface SoarProduction {
  name: string;
  type: ProductionType;
  range: Range;
  nameRange: Range;
  documentation?: string;
  variables: Map<string, SoarVariable>;
  attributes: SoarAttribute[];
  functionCalls: SoarFunctionCall[];
  /** The variable bound by the LHS `(state <var> ...)` condition, whatever it's named (e.g. 's', 's1'). */
  stateVariable?: string;
  /**
   * Variables bound by additional `(state <var> ...)` conditions beyond the
   * first (e.g. a second impasse-state test in the same production). Each is
   * architecturally guaranteed to be *some* state, just not necessarily this
   * production's "main" one.
   */
  additionalStateVariables?: string[];
}

export interface SoarDocument {
  uri: string;
  version: number;
  content: string;
  productions: SoarProduction[];
  errors: SoarDiagnostic[];
}

export interface SoarDiagnostic {
  range: Range;
  message: string;
  severity: DiagnosticSeverity;
  source: string;
}

export enum DiagnosticSeverity {
  error = 1,
  warning = 2,
  information = 3,
  hint = 4,
}

// Helper functions

export function positionToString(pos: Position): string {
  return `${pos.line}:${pos.character}`;
}

export function rangeToString(range: Range): string {
  return `${positionToString(range.start)}-${positionToString(range.end)}`;
}

export function isPositionInRange(position: Position, range: Range): boolean {
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

export function comparePositions(a: Position, b: Position): number {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.character - b.character;
}
