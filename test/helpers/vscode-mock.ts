/**
 * Mock VS Code module for unit tests
 * Only provides minimal functionality needed for DatamapValidator
 */

// Mock the vscode module before any other imports
(global as any).vscode = {
  Range: class Range {
    start: any;
    end: any;
    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    }
  },
  Diagnostic: class Diagnostic {
    range: any;
    message: string;
    severity: any;
    constructor(range: any, message: string, severity: any) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  window: {
    showQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  },
  workspace: {
    // Overridable per test via (vscode as any).workspace.__config
    __config: {} as Record<string, any>,
    getConfiguration: (_section?: string) => ({
      get: (key: string, defaultValue?: any) => {
        const cfg = (global as any).vscode.workspace.__config;
        return key in cfg ? cfg[key] : defaultValue;
      },
    }),
  },
  TreeItem: class TreeItem {
    label: any;
    collapsibleState: any;
    tooltip: any;
    description: any;
    contextValue: any;
    iconPath: any;
    constructor(label: any, collapsibleState: any) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class ThemeIcon {
    constructor(
      public id: string,
      public color?: any
    ) {}
  },
  ThemeColor: class ThemeColor {
    constructor(public id: string) {}
  },
  EventEmitter: class EventEmitter<T> {
    private listeners: Array<(e: T) => any> = [];

    get event() {
      return (listener: (e: T) => any) => {
        this.listeners.push(listener);
        return {
          dispose: () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
              this.listeners.splice(index, 1);
            }
          },
        };
      };
    }

    fire(data: T): void {
      this.listeners.forEach(listener => listener(data));
    }

    dispose(): void {
      this.listeners = [];
    }
  },
};

// Register the mock with require cache
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return (global as any).vscode;
  }
  return originalRequire.apply(this, arguments);
};
