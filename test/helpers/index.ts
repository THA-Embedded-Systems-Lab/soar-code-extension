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

// Project layout tests
import '../layout/projectCreator.test';
import '../layout/undoManager.test';

// Datamap manipulation tests
import '../datamap-manipulation/fixtures/sub-operator-generation.test';

// Legacy project validation tests
import '../legacy-agents/project-validation.test';
