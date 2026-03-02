import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SoarMcpCore } from '../../../src/mcp/soarMcpCore';

suite('MCP Active Project Resolution', () => {
  test('Should resolve active project from persisted state file', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-mcp-state-'));
    const vscodeDir = path.join(root, '.vscode');
    const projectFile = path.join(root, 'agent.vsa.json');

    await fs.promises.mkdir(vscodeDir, { recursive: true });
    await fs.promises.writeFile(projectFile, JSON.stringify({ version: '6' }), 'utf-8');
    await fs.promises.writeFile(
      path.join(vscodeDir, 'soar-active-project.json'),
      JSON.stringify({ projectFile }, null, 2),
      'utf-8'
    );

    const core = new SoarMcpCore();
    const result = await core.getActiveProject({ workspaceRoot: root });

    assert.strictEqual(result.source, 'state-file');
    assert.strictEqual(result.projectFile, projectFile);
  });

  test('Should fall back to project discovery when no state file exists', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-mcp-discovery-'));
    const projectFile = path.join(root, 'fallback.vsa.json');

    await fs.promises.writeFile(
      projectFile,
      JSON.stringify(
        {
          version: '6',
          datamap: {
            rootId: '0',
            vertices: [{ id: '0', type: 'SOAR_ID', outEdges: [] }],
          },
          layout: {
            id: 'root',
            type: 'OPERATOR_ROOT',
            name: 'root',
            folder: '.',
            children: [],
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const core = new SoarMcpCore();
    const result = await core.getActiveProject({ workspaceRoot: root });

    assert.strictEqual(result.source, 'discovery');
    assert.strictEqual(result.projectFile, projectFile);
  });
});
