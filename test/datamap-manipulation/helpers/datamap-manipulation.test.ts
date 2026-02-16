/**
 * Datamap Manipulation Test Helpers
 *
 * Provides utility functions for testing datamap CRUD operations and project structure
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  VisualSoarProject,
  ProjectContext,
  LayoutNode,
  DMVertex,
  hasChildren,
} from '../../../src/server/visualSoarProject';
import { ProjectLoader } from '../../../src/server/projectLoader';
import { ProjectCreator } from '../../../src/layout/projectCreator';
import { LayoutOperations } from '../../../src/layout/layoutOperations';

/**
 * Test operation: describes a single datamap manipulation step
 */
export interface TestOperation {
  type: 'addOperator';
  parentName?: string; // Name of parent node, or undefined for root
  operatorName: string;
}

/**
 * Test scenario: describes a complete test case
 */
export interface TestScenario {
  name: string;
  agentName: string;
  operations: TestOperation[];
  expectedProjectName: string; // Name of the reference project in expected/
}

/**
 * Create a test project and return its path
 */
export async function createTestProject(testDir: string, agentName: string): Promise<string> {
  // Ensure test directory exists
  await fs.promises.mkdir(testDir, { recursive: true });

  // Create the project
  const projectFilePath = await ProjectCreator.createProject({
    directory: testDir,
    agentName: agentName,
  });

  return projectFilePath;
}

/**
 * Load a project context from a project file
 */
export async function loadProjectContext(projectFile: string): Promise<ProjectContext> {
  const loader = new ProjectLoader();
  return await loader.loadProject(projectFile);
}

/**
 * Save a project context to file
 */
export async function saveProjectContext(context: ProjectContext): Promise<void> {
  const loader = new ProjectLoader();
  await loader.saveProject(context);
}

/**
 * Add an operator programmatically to a project
 */
export async function addOperator(
  context: ProjectContext,
  parentNodeId: string,
  operatorName: string
): Promise<{ success: boolean; nodeId?: string }> {
  return await LayoutOperations.addOperatorProgrammatic(context, parentNodeId, operatorName);
}

/**
 * Find a layout node by name
 */
export function findNodeByName(context: ProjectContext, nodeName: string): LayoutNode | undefined {
  for (const [, node] of context.layoutIndex) {
    if (node.name === nodeName) {
      return node;
    }
  }
  return undefined;
}

/**
 * Find a datamap vertex by operator name (looks for enumeration with the operator name)
 */
export function findOperatorVertexByName(
  context: ProjectContext,
  operatorName: string
): DMVertex | undefined {
  // Find enumeration vertex with this operator name
  for (const vertex of context.project.datamap.vertices) {
    if (vertex.type === 'ENUMERATION' && vertex.choices?.includes(operatorName)) {
      // Now find the operator SOAR_ID that has a ^name edge to this enumeration
      for (const opVertex of context.project.datamap.vertices) {
        if (opVertex.type === 'SOAR_ID' && opVertex.outEdges) {
          const nameEdge = opVertex.outEdges.find(e => e.name === 'name' && e.toId === vertex.id);
          if (nameEdge) {
            return opVertex;
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Compare two datamaps for structural similarity
 * Returns differences found
 */
export function compareDatamaps(
  actual: VisualSoarProject['datamap'],
  expected: VisualSoarProject['datamap']
): string[] {
  const differences: string[] = [];

  // Compare vertex counts
  if (actual.vertices.length !== expected.vertices.length) {
    differences.push(
      `Vertex count mismatch: actual=${actual.vertices.length}, expected=${expected.vertices.length}`
    );
  }

  // Create maps by vertex type and structure for comparison
  const actualVertexMap = buildVertexStructureMap(actual.vertices);
  const expectedVertexMap = buildVertexStructureMap(expected.vertices);

  // Detailed reporting for mismatches
  const hasMismatches =
    Array.from(expectedVertexMap.keys()).some(
      key => (actualVertexMap.get(key) || 0) !== expectedVertexMap.get(key)
    ) || Array.from(actualVertexMap.keys()).some(key => !expectedVertexMap.has(key));

  if (hasMismatches) {
    differences.push('\n=== Vertex Structure Comparison ===');
    differences.push('\nExpected vertex structures:');
    for (const [key, count] of expectedVertexMap) {
      const actualCount = actualVertexMap.get(key) || 0;
      const status = actualCount === count ? '✓' : '✗';
      differences.push(`  ${status} ${key}: expected=${count}, actual=${actualCount}`);
    }

    differences.push('\nUnexpected vertex structures in actual:');
    let hasUnexpected = false;
    for (const [key, count] of actualVertexMap) {
      if (!expectedVertexMap.has(key)) {
        differences.push(`  ✗ ${key}: count=${count}`);
        hasUnexpected = true;
      }
    }
    if (!hasUnexpected) {
      differences.push('  (none)');
    }

    // Show sample vertices for debugging
    differences.push('\n=== Sample Vertices for Debugging ===');
    differences.push('\nExpected vertices (sample):');
    expected.vertices.slice(0, 5).forEach((v, i) => {
      differences.push(`  [${i}] ${formatVertexForDebug(v)}`);
    });
    if (expected.vertices.length > 5) {
      differences.push(`  ... (${expected.vertices.length - 5} more)`);
    }

    differences.push('\nActual vertices (sample):');
    actual.vertices.slice(0, 5).forEach((v, i) => {
      differences.push(`  [${i}] ${formatVertexForDebug(v)}`);
    });
    if (actual.vertices.length > 5) {
      differences.push(`  ... (${actual.vertices.length - 5} more)`);
    }
  }

  return differences;
}

/**
 * Format a vertex for debug output
 */
function formatVertexForDebug(vertex: DMVertex): string {
  let info = `id=${vertex.id}, type=${vertex.type}`;

  if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
    const edges = vertex.outEdges.map(e => `${e.name}->${e.toId}`).join(', ');
    info += `, edges=[${edges}]`;
  } else if (vertex.type === 'ENUMERATION' && vertex.choices) {
    info += `, choices=[${vertex.choices.join(', ')}]`;
  }

  return info;
}

/**
 * Build a map of vertex structures for comparison
 * Key is a string representation of the vertex structure
 */
function buildVertexStructureMap(vertices: DMVertex[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const vertex of vertices) {
    let key: string = vertex.type;

    if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
      // Create a sorted list of edge names for consistent comparison
      const edgeNames = vertex.outEdges.map(e => e.name).sort();
      key = `SOAR_ID[${edgeNames.join(',')}]`;
    } else if (vertex.type === 'ENUMERATION' && vertex.choices) {
      // Sort choices for consistent comparison
      const sortedChoices = [...vertex.choices].sort();
      key = `ENUMERATION[${sortedChoices.join(',')}]`;
    }

    map.set(key, (map.get(key) || 0) + 1);
  }

  return map;
}

/**
 * Compare two project layouts for structural similarity
 * Returns differences found
 */
export function compareLayouts(
  actual: LayoutNode,
  expected: LayoutNode,
  path: string = 'root'
): string[] {
  const differences: string[] = [];

  // Compare node types
  if (actual.type !== expected.type) {
    differences.push(`${path}: type mismatch: actual=${actual.type}, expected=${expected.type}`);
  }

  // Compare node names
  if (actual.name !== expected.name) {
    differences.push(`${path}: name mismatch: actual=${actual.name}, expected=${expected.name}`);
  }

  // Compare children
  if (hasChildren(actual) && hasChildren(expected)) {
    const actualChildren = actual.children || [];
    const expectedChildren = expected.children || [];

    if (actualChildren.length !== expectedChildren.length) {
      differences.push(
        `${path}: children count mismatch: actual=${actualChildren.length}, expected=${expectedChildren.length}`
      );
    }

    // Create maps by child name for comparison
    const actualChildMap = new Map(actualChildren.map(c => [c.name, c]));
    const expectedChildMap = new Map(expectedChildren.map(c => [c.name, c]));

    // Check for missing children
    for (const [name, expectedChild] of expectedChildMap) {
      const actualChild = actualChildMap.get(name);
      if (!actualChild) {
        differences.push(`${path}: missing child '${name}'`);
      } else {
        // Recursively compare children
        differences.push(...compareLayouts(actualChild, expectedChild, `${path}/${name}`));
      }
    }

    // Check for extra children
    for (const name of actualChildMap.keys()) {
      if (!expectedChildMap.has(name)) {
        differences.push(`${path}: unexpected child '${name}'`);
      }
    }
  } else if (hasChildren(actual) !== hasChildren(expected)) {
    differences.push(`${path}: children presence mismatch`);
  }

  return differences;
}

/**
 * Compare file structure between two directories
 * Returns differences found
 */
export async function compareFileStructure(
  actualDir: string,
  expectedDir: string,
  basePath: string = ''
): Promise<string[]> {
  const differences: string[] = [];

  // Get entries from both directories
  const actualEntries = await getDirectoryEntries(actualDir);
  const expectedEntries = await getDirectoryEntries(expectedDir);

  // Create maps by name
  const actualMap = new Map(actualEntries.map(e => [e.name, e]));
  const expectedMap = new Map(expectedEntries.map(e => [e.name, e]));

  // Check for missing entries
  for (const [name, expectedEntry] of expectedMap) {
    const actualEntry = actualMap.get(name);
    const currentPath = path.join(basePath, name);

    if (!actualEntry) {
      differences.push(
        `Missing ${expectedEntry.isDirectory ? 'directory' : 'file'}: ${currentPath}`
      );
    } else if (actualEntry.isDirectory !== expectedEntry.isDirectory) {
      differences.push(
        `Type mismatch at ${currentPath}: actual=${
          actualEntry.isDirectory ? 'directory' : 'file'
        }, expected=${expectedEntry.isDirectory ? 'directory' : 'file'}`
      );
    } else if (actualEntry.isDirectory) {
      // Recursively compare directories
      const actualSubDir = path.join(actualDir, name);
      const expectedSubDir = path.join(expectedDir, name);
      differences.push(...(await compareFileStructure(actualSubDir, expectedSubDir, currentPath)));
    }
  }

  // Check for extra entries
  for (const [name, actualEntry] of actualMap) {
    if (!expectedMap.has(name)) {
      const currentPath = path.join(basePath, name);
      differences.push(
        `Unexpected ${actualEntry.isDirectory ? 'directory' : 'file'}: ${currentPath}`
      );
    }
  }

  return differences;
}

/**
 * Get directory entries with type information
 */
async function getDirectoryEntries(
  dir: string
): Promise<Array<{ name: string; isDirectory: boolean }>> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries
      .filter(entry => {
        // Exclude .cfg files (VisualSoar GUI artifacts)
        if (entry.name.endsWith('.cfg')) {
          return false;
        }
        return true;
      })
      .map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
  } catch (error) {
    return [];
  }
}

/**
 * Assert that two datamaps are similar
 */
export function assertDatamapsSimilar(
  actual: VisualSoarProject['datamap'],
  expected: VisualSoarProject['datamap']
): void {
  const differences = compareDatamaps(actual, expected);
  if (differences.length > 0) {
    assert.fail(`Datamap comparison failed:\n${differences.join('\n')}`);
  }
}

/**
 * Assert that two layouts are similar
 */
export function assertLayoutsSimilar(actual: LayoutNode, expected: LayoutNode): void {
  const differences = compareLayouts(actual, expected);
  if (differences.length > 0) {
    assert.fail(`Layout comparison failed:\n${differences.join('\n')}`);
  }
}

/**
 * Assert that two file structures are similar
 */
export async function assertFileStructuresSimilar(
  actualDir: string,
  expectedDir: string
): Promise<void> {
  const differences = await compareFileStructure(actualDir, expectedDir);
  if (differences.length > 0) {
    assert.fail(`File structure comparison failed:\n${differences.join('\n')}`);
  }
}

/**
 * Clean up test directory
 */
export async function cleanupTestDirectory(testDir: string): Promise<void> {
  if (fs.existsSync(testDir)) {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  }
}

/**
 * Execute a test operation on a project
 */
export async function executeOperation(
  context: ProjectContext,
  operation: TestOperation
): Promise<void> {
  if (operation.type === 'addOperator') {
    let parentNodeId: string;

    if (operation.parentName) {
      const parentNode = findNodeByName(context, operation.parentName);
      if (!parentNode) {
        throw new Error(`Parent node '${operation.parentName}' not found`);
      }
      parentNodeId = parentNode.id;
    } else {
      parentNodeId = context.project.layout.id;
    }

    const result = await addOperator(context, parentNodeId, operation.operatorName);
    if (!result.success) {
      throw new Error(`Failed to add operator '${operation.operatorName}'`);
    }
  }
}

/**
 * Run a complete test scenario
 * Creates a project, executes operations, and compares to expected reference
 */
export async function runTestScenario(scenario: TestScenario): Promise<void> {
  // Determine test output directory
  const testOutputDir = path.join(__dirname, '../../../test-output/datamap-manipulation');

  // Clean up any previous test artifacts
  await cleanupTestDirectory(testOutputDir);

  // Create project
  const projectFilePath = await createTestProject(testOutputDir, scenario.agentName);
  const projectDir = path.dirname(projectFilePath);
  let context = await loadProjectContext(projectFilePath);

  // Execute all operations
  for (const operation of scenario.operations) {
    await executeOperation(context, operation);
    await saveProjectContext(context);
    context = await loadProjectContext(projectFilePath);
  }

  // Load expected reference
  const expectedDir = path.join(__dirname, '../expected', scenario.expectedProjectName);
  const expectedProjectFile = path.join(expectedDir, `${scenario.agentName}.vsa.json`);
  const expectedContext = await loadProjectContext(expectedProjectFile);

  // Compare datamap
  assertDatamapsSimilar(context.project.datamap, expectedContext.project.datamap);

  // Compare layout
  assertLayoutsSimilar(context.project.layout, expectedContext.project.layout);

  // Compare file structure
  const actualAgentDir = path.join(projectDir, scenario.agentName);
  const expectedAgentDir = path.join(expectedDir, scenario.agentName);
  await assertFileStructuresSimilar(actualAgentDir, expectedAgentDir);
}

/**
 * Verify datamap structure for a scenario
 * Useful for detailed validation tests
 */
export async function runDatamapVerification(
  scenario: TestScenario,
  verificationFn: (context: ProjectContext) => void | Promise<void>
): Promise<void> {
  // Determine test output directory
  const testOutputDir = path.join(__dirname, '../../../test-output/datamap-manipulation');

  // Clean up any previous test artifacts
  await cleanupTestDirectory(testOutputDir);

  // Create project
  const projectFilePath = await createTestProject(testOutputDir, scenario.agentName);
  let context = await loadProjectContext(projectFilePath);

  // Execute all operations
  for (const operation of scenario.operations) {
    await executeOperation(context, operation);
    await saveProjectContext(context);
    context = await loadProjectContext(projectFilePath);
  }

  // Run custom verification
  await verificationFn(context);
}

/**
 * Verify file structure for a scenario
 * Useful for detailed file validation tests
 */
export async function runFileStructureVerification(
  scenario: TestScenario,
  verificationFn: (projectDir: string, agentName: string) => void | Promise<void>
): Promise<void> {
  // Determine test output directory
  const testOutputDir = path.join(__dirname, '../../../test-output/datamap-manipulation');

  // Clean up any previous test artifacts
  await cleanupTestDirectory(testOutputDir);

  // Create project
  const projectFilePath = await createTestProject(testOutputDir, scenario.agentName);
  const projectDir = path.dirname(projectFilePath);
  let context = await loadProjectContext(projectFilePath);

  // Execute all operations
  for (const operation of scenario.operations) {
    await executeOperation(context, operation);
    await saveProjectContext(context);
    context = await loadProjectContext(projectFilePath);
  }

  // Run custom verification
  await verificationFn(projectDir, scenario.agentName);
}
