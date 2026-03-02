import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const SOAR_MCP_SERVER_KEY = 'soar';
const soarMcpWorkspaceEnvKey = 'SOAR_MCP_WORKSPACE';

interface WorkspaceMcpConfig {
  servers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

function buildServerCommand(extensionPath: string): { command: string; args: string[] } {
  const serverScript = path.join(extensionPath, 'dist', 'mcpServer.js');
  return {
    command: process.execPath,
    args: [serverScript],
  };
}

export async function ensureWorkspaceMcpRegistration(extensionPath: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const configured = vscode.workspace
    .getConfiguration('soar')
    .get<boolean>('mcp.autoRegister', true);
  if (!configured) {
    return;
  }

  const commandSpec = buildServerCommand(extensionPath);

  for (const folder of workspaceFolders) {
    const vscodeDir = path.join(folder.uri.fsPath, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

    await fs.promises.mkdir(vscodeDir, { recursive: true });

    let parsed: WorkspaceMcpConfig = {};
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const existing = await fs.promises.readFile(mcpConfigPath, 'utf-8');
        parsed = JSON.parse(existing) as WorkspaceMcpConfig;
      } catch {
        parsed = {};
      }
    }

    const next: WorkspaceMcpConfig = {
      ...parsed,
      servers: {
        ...(parsed.servers || {}),
        [SOAR_MCP_SERVER_KEY]: {
          command: commandSpec.command,
          args: commandSpec.args,
          env: {
            [soarMcpWorkspaceEnvKey]: folder.uri.fsPath,
          },
        },
      },
    };

    await fs.promises.writeFile(mcpConfigPath, JSON.stringify(next, null, 2), 'utf-8');
  }
}
