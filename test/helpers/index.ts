// Main test entry point - imports all unit test suites
//
// Note: Integration tests (test/integration/extension.test.ts) require
// the full VS Code extension host and should be run separately using
// the VS Code test runner (npm run test:ci or via VSCode test explorer)

// Mock vscode module for unit tests
import './vscode-mock';

// LSP tests (unit tests that don't require VS Code environment)
import '../lsp/syntax/helpers/lsp.test';

// Datamap validation tests
import '../lsp/datamap/helpers/datamap.test';

// LSP completion tests
import '../lsp/completions/helpers/completion.test';

// Project layout tests
import '../layout/projectCreator.test';
import '../layout/layoutOperations.test';
import '../layout/undoManager.test';

// Datamap manipulation tests
import '../datamap-manipulation/fixtures/sub-operator-generation.test';

// Legacy project validation tests
import '../legacy-agents/helpers/project-validation.test';

// Debugger tests
import '../debugger/multi-agent.test';

// MCP tests
import '../mcp/helpers/tool-detection.test';
import '../mcp/helpers/active-project.test';
import '../mcp/helpers/tool-execution-queue.test';
import '../lsp/datamap/helpers/linked-attributes.test';
import '../mcp/helpers/id-generation.test';
import '../lsp/datamap/helpers/orphaned-files.test';
