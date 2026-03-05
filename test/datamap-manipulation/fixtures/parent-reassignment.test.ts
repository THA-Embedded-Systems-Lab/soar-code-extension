import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatamapOperations } from '../../../src/datamap/datamapOperations';
import { DatamapMetadataCache, DatamapProjectContext } from '../../../src/datamap/datamapMetadata';
import { ProjectLoader } from '../../../src/server/projectLoader';
import { SoarIdVertex } from '../../../src/server/visualSoarProject';

interface QuickPickLike {
  label: string;
  description?: string;
  vertexId?: string;
}

function edgeExists(vertex: SoarIdVertex, edgeName: string, toId: string): boolean {
  return (vertex.outEdges || []).some(edge => edge.name === edgeName && edge.toId === toId);
}

async function createContext(projectFilePath: string): Promise<DatamapProjectContext> {
  const loader = new ProjectLoader();
  const base = await loader.loadProject(projectFilePath);
  return {
    ...base,
    datamapMetadata: DatamapMetadataCache.build(base.project, base.datamapIndex),
  };
}

suite('Datamap Manipulation - Parent Reassignment', () => {
  test('Change Parent moves attribute subtree to new parent', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-parent-move-'));
    const projectFilePath = path.join(tmpDir, 'agent.vsa.json');

    await fs.promises.writeFile(
      projectFilePath,
      JSON.stringify(
        {
          version: '6',
          datamap: {
            rootId: '0',
            vertices: [
              {
                id: '0',
                type: 'SOAR_ID',
                outEdges: [
                  { name: 'foo', toId: '1' },
                  { name: 'dest', toId: '2' },
                ],
              },
              {
                id: '1',
                type: 'SOAR_ID',
                outEdges: [{ name: 'child', toId: '3' }],
              },
              { id: '2', type: 'SOAR_ID', outEdges: [] },
              { id: '3', type: 'INTEGER' },
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

    const projectContext = await createContext(projectFilePath);

    const vscodeAny = require('vscode') as any;
    const windowApi = vscodeAny.window;
    const originalShowQuickPick = windowApi.showQuickPick;
    const originalShowInputBox = windowApi.showInputBox;
    const originalShowInfo = windowApi.showInformationMessage;
    const originalShowWarn = windowApi.showWarningMessage;
    const originalShowError = windowApi.showErrorMessage;

    let quickPickCall = 0;
    windowApi.showQuickPick = async (items: QuickPickLike[]) => {
      quickPickCall += 1;
      if (quickPickCall === 1) {
        return items.find(item => item.label === 'Change Parent');
      }
      return items.find(item => item.vertexId === '2');
    };
    windowApi.showInputBox = async () => undefined;
    windowApi.showInformationMessage = async () => undefined;
    windowApi.showWarningMessage = async () => undefined;
    windowApi.showErrorMessage = async () => undefined;

    try {
      const success = await DatamapOperations.editAttribute(projectContext, '1', 'foo');
      assert.strictEqual(success, true);

      const reloaded = await createContext(projectFilePath);
      const root = reloaded.datamapIndex.get('0') as SoarIdVertex;
      const destination = reloaded.datamapIndex.get('2') as SoarIdVertex;
      const movedTarget = reloaded.datamapIndex.get('1') as SoarIdVertex;

      assert.ok(root);
      assert.ok(destination);
      assert.ok(movedTarget);

      assert.strictEqual(edgeExists(root, 'foo', '1'), false, 'Old parent should lose ^foo');
      assert.strictEqual(edgeExists(destination, 'foo', '1'), true, 'New parent should gain ^foo');
      assert.strictEqual(
        edgeExists(movedTarget, 'child', '3'),
        true,
        'Moved target subtree should remain intact'
      );
    } finally {
      windowApi.showQuickPick = originalShowQuickPick;
      windowApi.showInputBox = originalShowInputBox;
      windowApi.showInformationMessage = originalShowInfo;
      windowApi.showWarningMessage = originalShowWarn;
      windowApi.showErrorMessage = originalShowError;
    }
  });

  test('Change Parent + Link moves ownership and keeps linked reference', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soar-parent-link-'));
    const projectFilePath = path.join(tmpDir, 'agent.vsa.json');

    await fs.promises.writeFile(
      projectFilePath,
      JSON.stringify(
        {
          version: '6',
          datamap: {
            rootId: '0',
            vertices: [
              {
                id: '0',
                type: 'SOAR_ID',
                outEdges: [
                  { name: 'foo', toId: '1' },
                  { name: 'dest', toId: '2' },
                ],
              },
              {
                id: '1',
                type: 'SOAR_ID',
                outEdges: [{ name: 'child', toId: '3' }],
              },
              { id: '2', type: 'SOAR_ID', outEdges: [] },
              { id: '3', type: 'STRING' },
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

    const projectContext = await createContext(projectFilePath);

    const vscodeAny = require('vscode') as any;
    const windowApi = vscodeAny.window;
    const originalShowQuickPick = windowApi.showQuickPick;
    const originalShowInputBox = windowApi.showInputBox;
    const originalShowInfo = windowApi.showInformationMessage;
    const originalShowWarn = windowApi.showWarningMessage;
    const originalShowError = windowApi.showErrorMessage;

    let quickPickCall = 0;
    windowApi.showQuickPick = async (items: QuickPickLike[]) => {
      quickPickCall += 1;
      if (quickPickCall === 1) {
        return items.find(item => item.label === 'Change Parent + Link');
      }
      return items.find(item => item.vertexId === '2');
    };
    windowApi.showInputBox = async () => undefined;
    windowApi.showInformationMessage = async () => undefined;
    windowApi.showWarningMessage = async () => undefined;
    windowApi.showErrorMessage = async () => undefined;

    try {
      const success = await DatamapOperations.editAttribute(projectContext, '1', 'foo');
      assert.strictEqual(success, true);

      const reloaded = await createContext(projectFilePath);
      const root = reloaded.datamapIndex.get('0') as SoarIdVertex;
      const destination = reloaded.datamapIndex.get('2') as SoarIdVertex;

      assert.ok(root);
      assert.ok(destination);

      assert.strictEqual(edgeExists(root, 'foo', '1'), true, 'Old parent should keep linked ^foo');
      assert.strictEqual(edgeExists(destination, 'foo', '1'), true, 'New parent should own ^foo');

      const rootFooCount = (root.outEdges || []).filter(edge => edge.name === 'foo').length;
      assert.strictEqual(rootFooCount, 1, 'Old parent should contain exactly one ^foo edge');
    } finally {
      windowApi.showQuickPick = originalShowQuickPick;
      windowApi.showInputBox = originalShowInputBox;
      windowApi.showInformationMessage = originalShowInfo;
      windowApi.showWarningMessage = originalShowWarn;
      windowApi.showErrorMessage = originalShowError;
    }
  });
});
