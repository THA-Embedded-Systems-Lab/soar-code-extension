import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const SOAR_MCP_SERVER_KEY = 'soar';
const soarMcpWorkspaceEnvKey = 'SOAR_MCP_WORKSPACE';

// Portable workspace-root placeholders expanded by each MCP client instead of
// baking in an absolute, machine-specific path.
// VS Code expands `${workspaceFolder}` in `.vscode/mcp.json`.
const VSCODE_WORKSPACE_PLACEHOLDER = '${workspaceFolder}';
// Claude Code expands `${CLAUDE_PROJECT_DIR:-default}` in `.mcp.json`.
const CLAUDE_WORKSPACE_PLACEHOLDER = '${CLAUDE_PROJECT_DIR:-.}';

type McpServerSpec = { command: string; args?: string[]; env?: Record<string, string> };

interface WorkspaceMcpConfig {
  servers?: Record<string, McpServerSpec>;
}

interface ClaudeCodeMcpConfig {
  mcpServers?: Record<string, McpServerSpec>;
}

function buildServerCommand(extensionPath: string): { command: string; args: string[] } {
  const serverScript = path.join(extensionPath, 'dist', 'mcpServer.js');
  return {
    command: 'node',
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
    const buildServerSpec = (workspacePlaceholder: string): McpServerSpec => ({
      command: commandSpec.command,
      args: commandSpec.args,
      env: {
        [soarMcpWorkspaceEnvKey]: workspacePlaceholder,
      },
    });

    // VS Code native MCP client: .vscode/mcp.json with `servers` key
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
        [SOAR_MCP_SERVER_KEY]: buildServerSpec(VSCODE_WORKSPACE_PLACEHOLDER),
      },
    };

    await fs.promises.writeFile(mcpConfigPath, JSON.stringify(next, null, 2), 'utf-8');

    // Claude Code (CLI / VS Code extension): project-scoped .mcp.json with `mcpServers` key
    const claudeConfigPath = path.join(folder.uri.fsPath, '.mcp.json');

    let claudeParsed: ClaudeCodeMcpConfig = {};
    if (fs.existsSync(claudeConfigPath)) {
      try {
        const existing = await fs.promises.readFile(claudeConfigPath, 'utf-8');
        claudeParsed = JSON.parse(existing) as ClaudeCodeMcpConfig;
      } catch {
        claudeParsed = {};
      }
    }

    const claudeNext: ClaudeCodeMcpConfig = {
      ...claudeParsed,
      mcpServers: {
        ...(claudeParsed.mcpServers || {}),
        [SOAR_MCP_SERVER_KEY]: buildServerSpec(CLAUDE_WORKSPACE_PLACEHOLDER),
      },
    };

    await fs.promises.writeFile(claudeConfigPath, JSON.stringify(claudeNext, null, 2), 'utf-8');
  }
}
