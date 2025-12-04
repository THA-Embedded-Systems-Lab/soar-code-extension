/**
 * Unit tests for completion logic
 * These tests can run independently of VS Code's test environment
 */

import * as assert from 'assert';
import * as path from 'path';
import { ProjectLoader } from '../../server/projectLoader';

suite('Completion Logic Unit Tests', () => {
  let projectLoader: ProjectLoader;
  let testProject: any;

  suiteSetup(async () => {
    projectLoader = new ProjectLoader();
    const projectPath = path.resolve(__dirname, '../../../test/fixtures/test-project.vsa.json');
    testProject = await projectLoader.loadProject(projectPath);
  });

  test('Project should load with correct structure', () => {
    assert.ok(testProject, 'Project should be loaded');
    assert.ok(testProject.project.datamap, 'Project should have datamap');
    assert.ok(testProject.project.datamap.rootId, 'Datamap should have rootId');
    assert.ok(testProject.datamapIndex, 'Project should have datamapIndex');
  });

  test('Root vertex should have expected attributes', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);

    assert.ok(rootVertex, 'Root vertex should exist');
    assert.strictEqual(rootVertex.type, 'SOAR_ID', 'Root should be SOAR_ID');
    assert.ok(rootVertex.outEdges, 'Root should have outEdges');

    const edgeNames = rootVertex.outEdges.map((e: any) => e.name);
    assert.ok(edgeNames.includes('io'), 'Root should have io attribute');
    assert.ok(edgeNames.includes('operator'), 'Root should have operator attribute');
    assert.ok(edgeNames.includes('type'), 'Root should have type attribute');
    assert.ok(edgeNames.includes('name'), 'Root should have name attribute');
    assert.ok(edgeNames.includes('superstate'), 'Root should have superstate attribute');
  });

  test('IO vertex should have input-link and output-link', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);

    const ioEdge = rootVertex.outEdges.find((e: any) => e.name === 'io');
    assert.ok(ioEdge, 'Should have io edge');

    const ioVertex = testProject.datamapIndex.get(ioEdge.toId);
    assert.ok(ioVertex, 'IO vertex should exist');
    assert.strictEqual(ioVertex.type, 'SOAR_ID', 'IO should be SOAR_ID');

    const ioEdgeNames = ioVertex.outEdges.map((e: any) => e.name);
    assert.ok(ioEdgeNames.includes('input-link'), 'IO should have input-link');
    assert.ok(ioEdgeNames.includes('output-link'), 'IO should have output-link');
  });

  test('Input-link should have data and value attributes', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);
    const ioEdge = rootVertex.outEdges.find((e: any) => e.name === 'io');
    const ioVertex = testProject.datamapIndex.get(ioEdge.toId);
    const inputLinkEdge = ioVertex.outEdges.find((e: any) => e.name === 'input-link');

    assert.ok(inputLinkEdge, 'Should have input-link edge');

    const inputLinkVertex = testProject.datamapIndex.get(inputLinkEdge.toId);
    assert.ok(inputLinkVertex, 'Input-link vertex should exist');
    assert.strictEqual(inputLinkVertex.type, 'SOAR_ID', 'Input-link should be SOAR_ID');

    const ilEdgeNames = inputLinkVertex.outEdges.map((e: any) => e.name);
    assert.ok(ilEdgeNames.includes('data'), 'Input-link should have data');
    assert.ok(ilEdgeNames.includes('value'), 'Input-link should have value');
  });

  test('Output-link should have command and status attributes', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);
    const ioEdge = rootVertex.outEdges.find((e: any) => e.name === 'io');
    const ioVertex = testProject.datamapIndex.get(ioEdge.toId);
    const outputLinkEdge = ioVertex.outEdges.find((e: any) => e.name === 'output-link');

    assert.ok(outputLinkEdge, 'Should have output-link edge');

    const outputLinkVertex = testProject.datamapIndex.get(outputLinkEdge.toId);
    assert.ok(outputLinkVertex, 'Output-link vertex should exist');
    assert.strictEqual(outputLinkVertex.type, 'SOAR_ID', 'Output-link should be SOAR_ID');

    const olEdgeNames = outputLinkVertex.outEdges.map((e: any) => e.name);
    assert.ok(olEdgeNames.includes('command'), 'Output-link should have command');
    assert.ok(olEdgeNames.includes('status'), 'Output-link should have status');
  });

  test('Operator vertex should have name attribute', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);
    const operatorEdge = rootVertex.outEdges.find((e: any) => e.name === 'operator');

    assert.ok(operatorEdge, 'Should have operator edge');

    const operatorVertex = testProject.datamapIndex.get(operatorEdge.toId);
    assert.ok(operatorVertex, 'Operator vertex should exist');
    assert.strictEqual(operatorVertex.type, 'SOAR_ID', 'Operator should be SOAR_ID');

    const opEdgeNames = operatorVertex.outEdges.map((e: any) => e.name);
    assert.ok(opEdgeNames.includes('name'), 'Operator should have name');
  });

  test('getVertexAttributes should return correct attributes', () => {
    const rootId = testProject.project.datamap.rootId;
    const attributes = projectLoader.getVertexAttributes(rootId, testProject);

    assert.ok(attributes.length > 0, 'Root should have attributes');

    const attrNames = attributes.map(a => a.name);
    assert.ok(attrNames.includes('io'), 'Should include io');
    assert.ok(attrNames.includes('operator'), 'Should include operator');
    assert.ok(attrNames.includes('type'), 'Should include type');
  });

  test('getVertexAttributes for io should return input-link and output-link', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);
    const ioEdge = rootVertex.outEdges.find((e: any) => e.name === 'io');
    const ioVertexId = ioEdge.toId;

    const attributes = projectLoader.getVertexAttributes(ioVertexId, testProject);

    assert.strictEqual(attributes.length, 2, 'IO should have 2 attributes');

    const attrNames = attributes.map(a => a.name);
    assert.ok(attrNames.includes('input-link'), 'Should include input-link');
    assert.ok(attrNames.includes('output-link'), 'Should include output-link');
  });

  test('Path navigation: io.input-link should resolve correctly', () => {
    // This tests the logic that completion uses to navigate paths
    const rootId = testProject.project.datamap.rootId;
    const pathSegments = ['io', 'input-link'];

    // Navigate manually to verify structure
    let currentVertex = testProject.datamapIndex.get(rootId);
    assert.ok(currentVertex, 'Should start at root');

    // Navigate to io
    const ioEdge = currentVertex.outEdges.find((e: any) => e.name === 'io');
    assert.ok(ioEdge, 'Should find io edge');

    currentVertex = testProject.datamapIndex.get(ioEdge.toId);
    assert.ok(currentVertex, 'Should navigate to io vertex');

    // Navigate to input-link
    const ilEdge = currentVertex.outEdges.find((e: any) => e.name === 'input-link');
    assert.ok(ilEdge, 'Should find input-link edge');

    currentVertex = testProject.datamapIndex.get(ilEdge.toId);
    assert.ok(currentVertex, 'Should navigate to input-link vertex');

    // Verify input-link has expected attributes
    const attributes = projectLoader.getVertexAttributes(currentVertex.id, testProject);
    const attrNames = attributes.map(a => a.name);
    assert.ok(attrNames.includes('data'), 'Input-link should have data');
    assert.ok(attrNames.includes('value'), 'Input-link should have value');
  });

  test('Enumeration vertices should have choices', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);
    const typeEdge = rootVertex.outEdges.find((e: any) => e.name === 'type');

    assert.ok(typeEdge, 'Should have type edge');

    const typeVertex = testProject.datamapIndex.get(typeEdge.toId);
    assert.ok(typeVertex, 'Type vertex should exist');
    assert.strictEqual(typeVertex.type, 'ENUMERATION', 'Type should be ENUMERATION');
    assert.ok(typeVertex.choices, 'Enumeration should have choices');
    assert.ok(typeVertex.choices.length > 0, 'Should have at least one choice');
  });

  test('Non-existent path should not navigate', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);

    // Try to find a non-existent attribute
    const nonExistentEdge = rootVertex.outEdges.find((e: any) => e.name === 'nonexistent');
    assert.strictEqual(nonExistentEdge, undefined, 'Should not find non-existent edge');
  });

  test('Superstate should point back to root structure', () => {
    const rootId = testProject.project.datamap.rootId;
    const rootVertex = testProject.datamapIndex.get(rootId);
    const superstateEdge = rootVertex.outEdges.find((e: any) => e.name === 'superstate');

    assert.ok(superstateEdge, 'Should have superstate edge');

    // In the test project, superstate points back to root
    const superstateTarget = testProject.datamapIndex.get(superstateEdge.toId);
    assert.ok(superstateTarget, 'Superstate target should exist');

    // The target should have the same structure as root (for substate navigation)
    if (superstateTarget.type === 'SOAR_ID') {
      const ssEdgeNames = superstateTarget.outEdges.map((e: any) => e.name);
      assert.ok(
        ssEdgeNames.includes('io') || ssEdgeNames.includes('operator'),
        'Superstate target should have state structure'
      );
    }
  });
});
