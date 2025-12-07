import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

export class SourceScriptManager {
  static async appendReference(folderPath: string, relativeFilePath: string): Promise<void> {
    try {
      const scriptPath = await this.ensureSourceScript(folderPath);
      if (!scriptPath) {
        return;
      }

      const entry = this.buildEntry(relativeFilePath);
      if (!entry) {
        return;
      }

      let content = '';
      if (fs.existsSync(scriptPath)) {
        content = await fsp.readFile(scriptPath, 'utf8');
        if (this.containsEntry(content, entry)) {
          return;
        }
      }

      const needsNewline = content.length > 0 && !content.endsWith('\n');
      const toAppend = `${needsNewline ? '\n' : ''}${entry}\n`;
      await fsp.appendFile(scriptPath, toAppend, 'utf8');
    } catch (error) {
      console.error('Failed to append source reference:', error);
    }
  }

  static async removeReference(folderPath: string, relativeFilePath: string): Promise<void> {
    try {
      const scriptPath = await this.findSourceScript(folderPath);
      if (!scriptPath || !fs.existsSync(scriptPath)) {
        return;
      }

      const entry = this.buildEntry(relativeFilePath);
      if (!entry) {
        return;
      }

      const content = await fsp.readFile(scriptPath, 'utf8');
      const lines = content.split(/\r?\n/);
      const filtered = lines.filter(line => !this.sameEntry(line, entry));

      if (filtered.length === lines.length) {
        return;
      }

      const normalized = filtered.join('\n').replace(/\s+$/g, '');
      const finalContent = normalized.length > 0 ? `${normalized}\n` : '';
      await fsp.writeFile(scriptPath, finalContent, 'utf8');
    } catch (error) {
      console.error('Failed to remove source reference:', error);
    }
  }

  private static async ensureSourceScript(folderPath: string): Promise<string | null> {
    const existing = await this.findSourceScript(folderPath);
    if (existing) {
      return existing;
    }

    const baseName = path.basename(path.resolve(folderPath));
    const scriptPath = path.join(folderPath, `${baseName}_source.soar`);
    await fsp.writeFile(scriptPath, '', 'utf8');
    return scriptPath;
  }

  private static async findSourceScript(folderPath: string): Promise<string | null> {
    try {
      const entries = await fsp.readdir(folderPath, { withFileTypes: true });
      const candidates = entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('_source.soar'))
        .map(entry => path.join(folderPath, entry.name));

      if (candidates.length === 0) {
        return null;
      }

      const baseName = path.basename(path.resolve(folderPath)).toLowerCase();
      const preferred = candidates.find(
        candidate => path.basename(candidate).toLowerCase() === `${baseName}_source.soar`
      );

      return preferred || candidates[0];
    } catch {
      return null;
    }
  }

  private static containsEntry(content: string, entry: string): boolean {
    return content.split(/\r?\n/).some(line => this.sameEntry(line, entry));
  }

  private static sameEntry(line: string, entry: string): boolean {
    return line.trim().toLowerCase() === entry.trim().toLowerCase();
  }

  private static buildEntry(relativeFilePath: string): string | null {
    if (!relativeFilePath) {
      return null;
    }

    const normalized = relativeFilePath.split(path.sep).join('/');
    return `source ${normalized}`;
  }
}
