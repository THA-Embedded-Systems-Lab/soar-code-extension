# Soar VS Code Extension – Agent Index

This file is a high-level index of the whole extension so an agent can quickly
locate the right implementation area.

## What this extension does

Soar language support in VS Code with:

- syntax highlighting
- language server integration
- datamap editing and validation
- VisualSoar project structure editing
- project creation/sync/validation
- MCP server for LLM/agent workflows

## Core architecture (where to start)

- Extension entrypoint: `src/extension.ts`
  - command registration
  - tree view wiring (Datamap + Project Structure)
  - validation triggers
  - MCP auto-registration hook
- Types and project schema model: `src/server/visualSoarProject.ts`
- Project load/save + schema validation: `src/server/projectLoader.ts`

## Feature map: where to look for specific code

### Project management and active project state

- `src/projectManager.ts`
  - project discovery (`.vsa.json` scanning)
  - active project selection/restore/clear
  - active-project persistence for MCP: `.vscode/soar-active-project.json`
  - project validation diagnostics (missing/orphaned files)

### Datamap tree + CRUD

- `src/datamap/datamapTreeProvider.ts`
  - datamap tree rendering and root switching
- `src/datamap/datamapOperations.ts`
  - add/edit/delete attributes
  - linked attribute operations
  - datamap persistence and metadata refresh
- `src/datamap/datamapMetadata.ts`
  - ownership/link metadata, inbound edge maps, path/attribute helpers

### Datamap validation

- `src/datamap/datamapValidator.ts`
  - validates Soar attributes against datamap
  - variable binding/path checks
  - enum value validation
  - infers `<s>` state context from explicit `^name` tests and, when needed,
    from layout file location (high-level operator substate ancestry)
  - VS Code diagnostics creation (with non-VSCode-safe fallback used by MCP)

### Layout / project structure editing

- `src/layout/layoutTreeProvider.ts`
- `src/layout/layoutOperations.ts`
- `src/layout/projectSync.ts`
  - shared project-file gathering helpers (including existing `.soar`
    collection) reused by project-wide datamap validation flows
- `src/layout/projectCreator.ts`
- `src/layout/undoManager.ts`

### Soar parsing and language server

- `src/server/soarParser.ts`
- `src/server/soarLanguageServer.ts`
- `src/client/lspClient.ts`

### MCP / LLM integration

- `src/mcp/soarMcpTools.ts`
  - MCP tool definitions and schemas
- `src/mcp/soarMcpServer.ts`
  - MCP stdio server and request handlers
  - project-scoped tool calls are serialized per `projectFile` to prevent
    concurrent load/modify/save races
- `src/mcp/soarMcpCore.ts`
  - reusable core operations invoked by MCP tools
- `src/mcp/toolExecutionQueue.ts`
  - keyed async execution queue used by MCP server for safe parallelism
- `src/mcp/mcpRegistration.ts`
  - workspace MCP registration (`.vscode/mcp.json`)

For MCP details (tool names, payloads, logging, and active-project behavior),
start in these four files.

Current MCP coverage includes datamap CRUD, project-vs-datamap validation,
active-project lookup, and layout additions (operator/impasse operator/file/folder).

## User commands and settings (key extension contract)

See `package.json` (contributes/commands/configuration) and `src/extension.ts`
(runtime command wiring).

## Data and persistence locations

- Project file format: `.vsa.json` (VisualSoar-compatible)
- Datamap and layout persist into project file directly
- Workspace MCP config: `.vscode/mcp.json`
- Active project state for MCP: `.vscode/soar-active-project.json`

## Build, test, and quality checks

- Build: `npm run compile`
- Watch: `npm run watch`
- Lint: `npm run lint`
- Unit tests: `npm test`
- VS Code integration tests: `npm run test:ci`

## Test index (where behavior is validated)

- Test bootstrap: `test/helpers/index.ts`
- MCP tests: `test/mcp/helpers/*`
  - includes queue safety coverage in `tool-execution-queue.test.ts`
- Datamap validation fixtures: `test/lsp/datamap/*`
- Layout/undo tests: `test/layout/*`
- Datamap manipulation scenarios: `test/datamap-manipulation/*`
- Legacy project compatibility: `test/legacy-agents/*`

## Agent usage guidance

When asked to modify behavior, first map the request to one of the sections
above and open those files before changing code. Prefer reusing existing core
logic (especially in datamap and project loader flows) rather than creating
parallel implementations.
