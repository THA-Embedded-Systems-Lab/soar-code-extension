import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SOAR_MCP_TOOLS } from '../../../src/mcp/soarMcpTools';

suite('MCP Tool Detection Fixtures', () => {
  test('Tool names should match fixture and VS Code validity rules', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/tool-detection.expected.json');
    const expectedNames = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as string[];

    const detectedNames = SOAR_MCP_TOOLS.map(tool => tool.name);
    const validNamePattern = /^[a-z0-9_-]+$/;

    assert.deepStrictEqual(
      detectedNames,
      expectedNames,
      'Detected MCP tools do not match expected fixture names'
    );

    for (const name of detectedNames) {
      assert.match(name, validNamePattern, `Invalid MCP tool name: ${name}`);
    }

    assert.strictEqual(
      new Set(detectedNames).size,
      detectedNames.length,
      'MCP tool names must be unique'
    );
  });
});
