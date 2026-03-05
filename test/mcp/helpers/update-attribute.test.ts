import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SoarMcpCore } from '../../../src/mcp/soarMcpCore';

suite('MCP Datamap Update Attribute', () => {
  test('Should update impasse enumeration values', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-mcp-update-attr-'));
    const projectFile = path.join(root, 'agent.vsa.json');

    await fs.promises.writeFile(
      projectFile,
      JSON.stringify(
        {
          version: '6',
          datamap: {
            rootId: '0',
            vertices: [
              {
                id: '0',
                type: 'SOAR_ID',
                outEdges: [{ name: 'impasse', toId: '1' }],
              },
              {
                id: '1',
                type: 'ENUMERATION',
                choices: ['conflict', 'tie'],
              },
            ],
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
    const result = await core.updateAttribute({
      projectFile,
      parentVertexId: '0',
      attributeName: 'impasse',
      enumChoices: ['conflict', 'constraint-failure', 'no-change', 'tie'],
    });

    assert.deepStrictEqual(result.enumChoices, [
      'conflict',
      'constraint-failure',
      'no-change',
      'tie',
    ]);

    const updated = JSON.parse(await fs.promises.readFile(projectFile, 'utf-8')) as {
      datamap: { vertices: Array<{ id: string; type: string; choices?: string[] }> };
    };

    const impasseVertex = updated.datamap.vertices.find(vertex => vertex.id === '1');
    assert.ok(impasseVertex);
    assert.strictEqual(impasseVertex?.type, 'ENUMERATION');
    assert.deepStrictEqual(impasseVertex?.choices, [
      'conflict',
      'constraint-failure',
      'no-change',
      'tie',
    ]);
  });

  test('Should reject enumChoices for non-enumeration attributes', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-mcp-update-attr-err-'));
    const projectFile = path.join(root, 'agent.vsa.json');

    await fs.promises.writeFile(
      projectFile,
      JSON.stringify(
        {
          version: '6',
          datamap: {
            rootId: '0',
            vertices: [
              {
                id: '0',
                type: 'SOAR_ID',
                outEdges: [{ name: 'impasse', toId: '1' }],
              },
              {
                id: '1',
                type: 'STRING',
              },
            ],
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

    await assert.rejects(
      async () => {
        await core.updateAttribute({
          projectFile,
          parentVertexId: '0',
          attributeName: 'impasse',
          enumChoices: ['conflict', 'tie'],
        });
      },
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(
          "Attribute 'impasse' is type 'STRING' and does not support enum choices"
        )
    );
  });
});
