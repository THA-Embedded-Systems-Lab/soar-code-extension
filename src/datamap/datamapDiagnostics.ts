/**
 * Datamap Diagnostics
 *
 * Converts DatamapValidator's plain ValidationError[] into VS Code
 * Diagnostic objects. Split out from datamapValidator.ts so that file stays
 * free of a `vscode` import (it also runs in the standalone MCP process).
 * This module is imported only from the extension host.
 */

import * as vscode from 'vscode';
import { ValidationError } from './datamapValidator.js';

/**
 * Generate a diagnostic collection for VS Code
 */
export function createDiagnostics(errors: ValidationError[]): vscode.Diagnostic[] {
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
