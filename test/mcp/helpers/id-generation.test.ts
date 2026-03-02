import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SoarMcpCore } from '../../../src/mcp/soarMcpCore';

const HEX_ID = /^[a-f0-9]{32}$/;

suite('MCP ID Generation', () => {
  test('createAttribute generates hex string datamap IDs', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-mcp-id-vertex-'));
    const projectFile = path.join(root, 'agent.vsa.json');

    const project = {
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
    };

    await fs.promises.writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');

    const core = new SoarMcpCore();
    const result = await core.createAttribute({
      projectFile,
      parentVertexId: '0',
      attributeName: 'operator',
      type: 'SOAR_ID',
    });

    assert.match(result.createdVertexId, HEX_ID);
  });

  test('addLayoutFolder generates hex string layout node IDs', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-mcp-id-layout-'));
    const projectFile = path.join(root, 'agent.vsa.json');

    const project = {
      version: '6',
      datamap: {
        rootId: '0',
        vertices: [{ id: '0', type: 'SOAR_ID', outEdges: [] }],
      },
      layout: {
        id: 'root',
        type: 'OPERATOR_ROOT',
        name: 'agent',
        folder: 'agent',
        children: [],
      },
    };

    await fs.promises.mkdir(path.join(root, 'agent'), { recursive: true });
    await fs.promises.writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');

    const core = new SoarMcpCore();
    const result = await core.addLayoutFolder({
      projectFile,
      parentNodeId: 'root',
      folderName: 'substate',
    });

    assert.match(result.nodeId, HEX_ID);
  });
});
