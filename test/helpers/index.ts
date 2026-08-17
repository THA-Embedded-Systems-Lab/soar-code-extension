// Main test entry point - imports all unit test suites
//
// Note: Integration tests (test/integration/extension.test.ts) require
// the full VS Code extension host and should be run separately using
// the VS Code test runner (npm run test:ci or via VSCode test explorer)

// Mock vscode module for unit tests
import './vscode-mock.js';

// LSP tests (unit tests that don't require VS Code environment)
import '../lsp/syntax/helpers/lsp.test.js';

// Datamap validation tests
import '../lsp/datamap/helpers/datamap.test.js';

// LSP completion tests
import '../lsp/completions/helpers/completion.test.js';

// Project layout tests
import '../layout/projectCreator.test.js';
import '../layout/layoutOperations.test.js';
import '../layout/layoutMoveRenameSync.test.js';
import '../layout/undoManager.test.js';

// Datamap manipulation tests
import '../datamap-manipulation/fixtures/sub-operator-generation.test.js';
import '../datamap-manipulation/fixtures/parent-reassignment.test.js';

// Legacy project validation tests
import '../legacy-agents/helpers/project-validation.test.js';

// MCP tests
import '../mcp/helpers/tool-detection.test.js';
import '../mcp/helpers/active-project.test.js';
import '../mcp/helpers/tool-execution-queue.test.js';
import '../lsp/datamap/helpers/linked-attributes.test.js';
import '../mcp/helpers/id-generation.test.js';
import '../mcp/helpers/update-attribute.test.js';
import '../mcp/helpers/print-structured-output.test.js';
// import '../lsp/orphaned-files/helpers/orphaned-files.test';
import '../lsp/datamap/helpers/datamap-integrity.test.js';
import '../lsp/datamap/helpers/inline-substate.test.js';
import '../lsp/datamap/helpers/state-variable-naming.test.js';
import '../lsp/datamap/helpers/conjunctive-attribute.test.js';
import '../lsp/datamap/helpers/canonical-name.test.js';
import '../lsp/datamap/helpers/datamap-stale-items.test.js';
