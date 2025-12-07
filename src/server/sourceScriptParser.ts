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

  private handlePushd(
    command: SourceCommand,
    directoryStack: string[],
    diagnostics: SourceScriptDiagnostic[]
  ): void {
    if (!command.argument || command.argument.length === 0) {
      diagnostics.push({
        message: 'pushd requires a folder argument',
        range: command.range,
        severity: 'error',
      });
      return;
    }

    const currentDir = directoryStack[directoryStack.length - 1];
    const target = this.resolvePath(currentDir, command.argument);

    if (!this.directoryExists(target)) {
      diagnostics.push({
        message: `Folder not found: ${path.basename(target)}`,
        range: command.argumentRange || command.range,
        severity: 'error',
      });
      return;
    }

    directoryStack.push(target);
  }

  private handlePopd(
    command: SourceCommand,
    directoryStack: string[],
    diagnostics: SourceScriptDiagnostic[]
  ): void {
    if (directoryStack.length <= 1) {
      diagnostics.push({
        message: 'popd without matching pushd',
        range: command.range,
        severity: 'error',
      });
      return;
    }

    directoryStack.pop();
  }

  private handleSource(
    command: SourceCommand,
    directoryStack: string[],
    diagnostics: SourceScriptDiagnostic[]
  ): void {
    if (!command.argument || command.argument.length === 0) {
      diagnostics.push({
        message: 'source requires a file argument',
        range: command.range,
        severity: 'error',
      });
      return;
    }

    const currentDir = directoryStack[directoryStack.length - 1];
    const target = this.resolvePath(currentDir, command.argument);

    if (!this.fileExists(target)) {
      diagnostics.push({
        message: `File not found: ${path.basename(target)}`,
        range: command.argumentRange || command.range,
        severity: 'error',
      });
    }
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
