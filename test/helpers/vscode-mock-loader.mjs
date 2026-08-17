// Node module customization hook: intercepts `import ... from 'vscode'`
// during unit tests and resolves it to a synthetic module built from
// globalThis.vscode (populated by test/helpers/vscode-mock.ts).
//
// Replaces the old `Module.prototype.require` patch, which only intercepted
// CommonJS `require('vscode')` and silently stopped working once the
// extension's source moved to ES `import` statements.
//
// Registered via test/helpers/register-vscode-mock.mjs (preloaded with
// --import, so it's active before any test file's module graph resolves).

const MOCK_URL = 'vscode-mock:vscode';

export function resolve(specifier, context, next) {
  if (specifier === 'vscode') {
    return { url: MOCK_URL, shortCircuit: true };
  }
  return next(specifier, context);
}

export function load(url, context, next) {
  if (url === MOCK_URL) {
    // Re-export properties straight off globalThis.vscode (not a copy), so
    // per-test mutations like `(global as any).vscode.workspace.__config[...] `
    // are visible through every `import * as vscode from 'vscode'` binding.
    const source = `
      const vscode = globalThis.vscode;
      export const window = vscode.window;
      export const workspace = vscode.workspace;
      export const Range = vscode.Range;
      export const Diagnostic = vscode.Diagnostic;
      export const DiagnosticSeverity = vscode.DiagnosticSeverity;
      export const TreeItem = vscode.TreeItem;
      export const TreeItemCollapsibleState = vscode.TreeItemCollapsibleState;
      export const ThemeIcon = vscode.ThemeIcon;
      export const ThemeColor = vscode.ThemeColor;
      export const EventEmitter = vscode.EventEmitter;
      export default vscode;
    `;
    return { format: 'module', source, shortCircuit: true };
  }
  return next(url, context);
}
