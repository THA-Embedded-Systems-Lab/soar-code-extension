/**
 * Manual test for ProjectCreator
 * Run with: npm run compile && node out/test/projectCreatorTest.js
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectCreator } from '../layout/projectCreator';

async function testProjectCreation() {
  console.log('Testing Project Creator...\n');

  const testDir = path.join(__dirname, '../../test-output');
  const agentName = 'TestAgent';

  try {
    // Clean up any existing test project
    const projectPath = path.join(testDir, agentName);
    if (fs.existsSync(projectPath)) {
      console.log('Cleaning up existing test project...');
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    // Ensure test directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    console.log(`Creating project in: ${testDir}`);
    console.log(`Agent name: ${agentName}\n`);

    // Create the project
    const projectFilePath = await ProjectCreator.createProject({
      directory: testDir,
      agentName: agentName,
    });

    console.log(`✓ Project created successfully!`);
    console.log(`Project file: ${projectFilePath}\n`);

    // Verify the structure
    console.log('Verifying project structure...');

    const checks = [
      path.join(testDir, agentName, `${agentName}.vsa.json`),
      path.join(testDir, agentName, `${agentName}.soar`),
      path.join(testDir, agentName, agentName),
      path.join(testDir, agentName, agentName, '_firstload.soar'),
      path.join(testDir, agentName, agentName, `${agentName}_source.soar`),
      path.join(testDir, agentName, agentName, `initialize-${agentName}.soar`),
      path.join(testDir, agentName, agentName, 'elaborations'),
      path.join(testDir, agentName, agentName, 'elaborations', '_all.soar'),
      path.join(testDir, agentName, agentName, 'elaborations', 'top-state.soar'),
      path.join(testDir, agentName, agentName, 'elaborations', 'elaborations_source.soar'),
      path.join(testDir, agentName, agentName, 'all'),
      path.join(testDir, agentName, agentName, 'all', 'all_source.soar'),
    ];

    let allChecksPassed = true;
    for (const check of checks) {
      const exists = fs.existsSync(check);
      const status = exists ? '✓' : '✗';
      const relativePath = path.relative(testDir, check);
      console.log(`  ${status} ${relativePath}`);
      if (!exists) {
        allChecksPassed = false;
      }
    }

    console.log();

    // Verify project JSON structure
    console.log('Verifying project JSON...');
    const projectJson = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));

    const jsonChecks = [
      { path: 'version', value: '6' },
      { path: 'datamap.rootId', exists: true },
      { path: 'datamap.vertices', isArray: true },
      { path: 'layout.name', value: agentName },
      { path: 'layout.type', value: 'OPERATOR_ROOT' },
      { path: 'layout.folder', value: agentName },
      { path: 'layout.children', isArray: true },
    ];

    for (const check of jsonChecks) {
      const keys = check.path.split('.');
      let value = projectJson;
      for (const key of keys) {
        value = value?.[key];
      }

      let passed = false;
      if ('value' in check) {
        passed = value === check.value;
        console.log(
          `  ${passed ? '✓' : '✗'} ${check.path} = "${value}" ${
            !passed ? `(expected "${check.value}")` : ''
          }`
        );
      } else if ('exists' in check) {
        passed = value !== undefined && value !== null;
        console.log(`  ${passed ? '✓' : '✗'} ${check.path} exists`);
      } else if ('isArray' in check) {
        passed = Array.isArray(value);
        console.log(`  ${passed ? '✓' : '✗'} ${check.path} is array (length: ${value?.length})`);
      }

      if (!passed) {
        allChecksPassed = false;
      }
    }

    console.log();

    // Check datamap structure
    console.log('Verifying datamap structure...');
    const rootVertex = projectJson.datamap.vertices.find(
      (v: any) => v.id === projectJson.datamap.rootId
    );
    if (rootVertex) {
      console.log(`  ✓ Root vertex found`);
      const expectedAttributes = [
        'io',
        'name',
        'operator',
        'type',
        'superstate',
        'top-state',
        'epmem',
        'smem',
        'reward-link',
      ];
      for (const attr of expectedAttributes) {
        const hasAttr = rootVertex.outEdges?.some((e: any) => e.name === attr);
        console.log(`  ${hasAttr ? '✓' : '✗'} Root has ^${attr}`);
        if (!hasAttr) {
          allChecksPassed = false;
        }
      }
    } else {
      console.log('  ✗ Root vertex not found');
      allChecksPassed = false;
    }

    console.log();
    console.log(allChecksPassed ? '✅ All checks passed!' : '❌ Some checks failed');

    return allChecksPassed ? 0 : 1;
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    return 1;
  }
}

// Run the test
testProjectCreation()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
