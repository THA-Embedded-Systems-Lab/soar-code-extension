import * as fs from 'fs';
import * as path from 'path';
import { Range } from './soarTypes';

export type SourceCommandType = 'source' | 'pushd' | 'popd';

export interface SourceCommand {
  type: SourceCommandType;
  argument?: string;
  range: Range;
  argumentRange?: Range;
}

export interface SourceScriptDiagnostic {
  message: string;
  range: Range;
  severity: 'error' | 'warning';
}

export interface SourceScriptPosition {
  line: number;
  character: number;
}

export interface SourceDefinitionResult {
  targetPath: string;
}

export class SourceScriptParser {
  parse(text: string): SourceCommand[] {
    const commands: SourceCommand[] = [];
    const lines = text.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const statement = this.stripInlineComment(line);
      if (!statement.trim()) {
        continue;
      }

      const match = statement.match(/^\s*(source|pushd|popd)\b(.*)$/i);
      if (!match) {
        continue;
      }

      const command = match[1].toLowerCase() as SourceCommandType;
      const indentMatch = statement.match(/^(\s*)/);
      const indentLength = indentMatch ? indentMatch[1].length : 0;
      const commandStart = indentLength;
      const commandEnd = commandStart + command.length;

      const afterCommand = statement.slice(commandStart + command.length);
      const argument = afterCommand.trimStart();
      const argumentValue = argument.trim();
      const whitespaceAfterCommand = afterCommand.length - argument.length;
      const argumentStart = commandEnd + whitespaceAfterCommand;
      const argumentEnd = argumentStart + argumentValue.length;

      const range: Range = {
        start: { line: lineIndex, character: commandStart },
        end: { line: lineIndex, character: argumentValue ? argumentEnd : commandEnd },
      };

      const commandEntry: SourceCommand = {
        type: command,
        argument: argumentValue || undefined,
        range,
        argumentRange: argumentValue
          ? {
              start: { line: lineIndex, character: argumentStart },
              end: { line: lineIndex, character: argumentEnd },
            }
          : undefined,
      };

      commands.push(commandEntry);
    }

    return commands;
  }

  private stripInlineComment(line: string): string {
    const hashIndex = line.indexOf('#');
    if (hashIndex === -1) {
      return line;
    }
    return line.slice(0, hashIndex);
  }
}

export class SourceScriptAnalyzer {
  constructor(private readonly parser = new SourceScriptParser()) {}

  analyze(text: string, scriptFilePath: string): SourceScriptDiagnostic[] {
    const commands = this.parser.parse(text);
    const diagnostics: SourceScriptDiagnostic[] = [];
    const baseDir = path.dirname(scriptFilePath);
    const directoryStack: string[] = [baseDir];

    for (const command of commands) {
      switch (command.type) {
        case 'pushd':
          this.handlePushd(command, directoryStack, diagnostics);
          break;
        case 'popd':
          this.handlePopd(command, directoryStack, diagnostics);
          break;
        case 'source':
          this.handleSource(command, directoryStack, diagnostics);
          break;
      }
    }

    return diagnostics;
  }

  resolveDefinition(
    text: string,
    scriptFilePath: string,
    position: SourceScriptPosition
  ): SourceDefinitionResult | null {
    const commands = this.parser.parse(text);
    const directoryStack: string[] = [path.dirname(scriptFilePath)];

    for (const command of commands) {
      switch (command.type) {
        case 'pushd':
          this.processPushd(command, directoryStack);
          break;
        case 'popd':
          this.processPopd(command, directoryStack);
          break;
        case 'source': {
          const evaluation = this.evaluateSource(command, directoryStack);
          if (
            command.argumentRange &&
            this.isPositionInRange(position, command.argumentRange) &&
            evaluation?.target &&
            !evaluation.diagnostic
          ) {
            return { targetPath: evaluation.target };
          }
          break;
        }
      }
    }

    return null;
  }

  private handlePushd(
    command: SourceCommand,
    directoryStack: string[],
    diagnostics: SourceScriptDiagnostic[]
  ): void {
    const diagnostic = this.processPushd(command, directoryStack);
    if (diagnostic) {
      diagnostics.push(diagnostic);
    }
  }

  private handlePopd(
    command: SourceCommand,
    directoryStack: string[],
    diagnostics: SourceScriptDiagnostic[]
  ): void {
    const diagnostic = this.processPopd(command, directoryStack);
    if (diagnostic) {
      diagnostics.push(diagnostic);
    }
  }

  private handleSource(
    command: SourceCommand,
    directoryStack: string[],
    diagnostics: SourceScriptDiagnostic[]
  ): void {
    const evaluation = this.evaluateSource(command, directoryStack);
    if (evaluation?.diagnostic) {
      diagnostics.push(evaluation.diagnostic);
    }
  }

  private processPushd(
    command: SourceCommand,
    directoryStack: string[]
  ): SourceScriptDiagnostic | null {
    if (!command.argument || command.argument.length === 0) {
      return {
        message: 'pushd requires a folder argument',
        range: command.range,
        severity: 'error',
      };
    }

    const currentDir = directoryStack[directoryStack.length - 1];
    const target = this.resolvePath(currentDir, command.argument);

    if (!this.directoryExists(target)) {
      return {
        message: `Folder not found: ${path.basename(target)}`,
        range: command.argumentRange || command.range,
        severity: 'error',
      };
    }

    directoryStack.push(target);
    return null;
  }

  private processPopd(
    command: SourceCommand,
    directoryStack: string[]
  ): SourceScriptDiagnostic | null {
    if (directoryStack.length <= 1) {
      return {
        message: 'popd without matching pushd',
        range: command.range,
        severity: 'error',
      };
    }

    directoryStack.pop();
    return null;
  }

  private evaluateSource(
    command: SourceCommand,
    directoryStack: string[]
  ): { target?: string; diagnostic?: SourceScriptDiagnostic } | null {
    if (!command.argument || command.argument.length === 0) {
      return {
        diagnostic: {
          message: 'source requires a file argument',
          range: command.range,
          severity: 'error',
        },
      };
    }

    const currentDir = directoryStack[directoryStack.length - 1];
    const target = this.resolvePath(currentDir, command.argument);

    if (!this.fileExists(target)) {
      return {
        target,
        diagnostic: {
          message: `File not found: ${path.basename(target)}`,
          range: command.argumentRange || command.range,
          severity: 'error',
        },
      };
    }

    return { target };
  }

  private isPositionInRange(position: SourceScriptPosition, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }

    if (range.start.line === range.end.line) {
      return (
        position.line === range.start.line &&
        position.character >= range.start.character &&
        position.character < range.end.character
      );
    }

    if (position.line === range.start.line) {
      return position.character >= range.start.character;
    }

    if (position.line === range.end.line) {
      return position.character < range.end.character;
    }

    return true;
  }

  private resolvePath(baseDir: string, argument: string): string {
    const normalizedArgument = this.normalizeArgument(argument);
    if (!normalizedArgument) {
      return baseDir;
    }
    if (path.isAbsolute(normalizedArgument)) {
      return path.normalize(normalizedArgument);
    }
    return path.normalize(path.join(baseDir, normalizedArgument));
  }

  private normalizeArgument(argument: string): string {
    const trimmed = argument.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private directoryExists(target: string): boolean {
    try {
      return fs.existsSync(target) && fs.statSync(target).isDirectory();
    } catch {
      return false;
    }
  }

  private fileExists(target: string): boolean {
    try {
      return fs.existsSync(target) && fs.statSync(target).isFile();
    } catch {
      return false;
    }
  }
}
