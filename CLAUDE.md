# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory: keep `llm.txt` in sync

`llm.txt` is the authoritative agent index for this project. Whenever you change architecture, commands, settings, file locations, feature behavior, MCP tools, validation behavior, or test layout, you **must** update `llm.txt` in the same change. See `AGENTS.md` for the full update policy.

## Commands

```bash
npm install           # Install dependencies
npm run compile       # Type-check + bundle all three entry points to dist/
npm run watch         # Watch mode (runs esbuild watch + tsc watch in parallel)
npm run lint          # ESLint on src/
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier on src/, *.md, *.json
npm run format:check  # Check formatting without writing
npm test              # Unit tests (mocha, no VS Code required) — fast feedback loop
npm run test:ci       # Integration tests (headless VS Code environment)
npm run package       # Production build
npm run vsce:package  # Package as .vsix
```

Run a single unit test file:

```bash
npx mocha --ui tdd -r ts-node/register test/helpers/index.ts test/lsp/datamap/helpers/datamap.test.ts
```

The pre-commit hook (`npm run precommit`) runs format, lint, and markdown lint — these are enforced before every commit.

## Build system

Three separate esbuild bundles are produced into `dist/`:
- `extension.js` — VS Code extension host entry (`src/extension.ts`)
- `server.js` — LSP language server (`src/server/soarLanguageServer.ts`)
- `mcpServer.js` — Standalone MCP stdio server (`src/mcp/soarMcpServer.ts`)

`tsc` (via `compile-server`) compiles everything to `out/` and is what the unit tests use via `ts-node`. The `dist/` bundles are what VS Code actually runs.

## Architecture

**`src/extension.ts`** is the single wiring point: registers all commands, wires tree view providers, sets up the LSP client, installs validation-on-save triggers (respecting `.soarignore`), and registers the debug adapter for `soar-sml`.

**Project state** is modeled as a `ProjectContext` (defined in `src/server/visualSoarProject.ts`), containing the parsed `.vsa.json`, a `datamapIndex: Map<string, DMVertex>`, and a `layoutIndex: Map<string, LayoutNode>`. This object is the shared currency passed across all subsystems.

### Subsystem map

| Area | Key files | Responsibility |
|------|-----------|----------------|
| Project I/O | `src/server/projectLoader.ts` | Load/save `.vsa.json`, build indices |
| Project discovery | `src/projectManager.ts` | Scan for `.vsa.json`, manage active project, persist to `.vscode/soar-active-project.json` |
| LSP server | `src/server/soarLanguageServer.ts`, `soarParser.ts` | Parse Soar productions, provide diagnostics |
| LSP client | `src/client/lspClient.ts` | Bridge extension ↔ server |
| Datamap tree | `src/datamap/datamapTreeProvider.ts` | Tree rendering, cycle detection, search/sort |
| Datamap CRUD | `src/datamap/datamapOperations.ts` | Add/edit/delete attributes; `deleteAttributeCore` (no UI) used by both UI path and MCP |
| Datamap validation | `src/datamap/datamapValidator.ts` | Validate `.soar` files against datamap; creates VS Code diagnostics |
| Datamap integrity | `src/datamap/datamapMetadata.ts` | `DatamapMetadataCache.checkLinkedAttributeIntegrity` — dangling/unreachable edge detection |
| Layout tree | `src/layout/layoutTreeProvider.ts`, `layoutOperations.ts` | Project structure CRUD |
| Project sync | `src/layout/projectSync.ts` | Find/import orphaned `.soar` files; respects `.soarignore` |
| `.soarignore` | `src/layout/soarIgnore.ts` | Gitignore-semantics file exclusion (`ignore` npm package) |
| Undo/redo | `src/layout/undoManager.ts` | Undo stack for layout+datamap ops |
| Debug adapter | `src/debug/soarSmlDebugAdapter.ts`, `smlSocketClient.ts` | DAP↔SML XML socket bridge for live Soar kernel debugging |
| Stop phase view | `src/debug/stopPhaseTreeProvider.ts` | Sidebar for selecting Soar stop phase |
| MCP server | `src/mcp/soarMcpServer.ts`, `soarMcpTools.ts`, `soarMcpCore.ts` | Exposes project/datamap/runtime tools over MCP stdio |
| MCP registration | `src/mcp/mcpRegistration.ts` | Writes MCP entry to `.vscode/mcp.json` |
| ID generation | `src/server/idGeneration.ts` | `generateVertexId()` — shared canonical hex-string ID generator |

### Key design invariants

- **`generateVertexId`** from `src/server/idGeneration.ts` is the single source for new vertex/node IDs. Use it everywhere — not inline Math.random or uuid.
- **`deleteAttributeCore`** in `datamapOperations.ts` is the pure (no-UI) deletion path. Both the interactive command and MCP delegate to it.
- **MCP per-project serialization**: `soarMcpServer.ts` serializes concurrent tool calls per `projectFile` via `toolExecutionQueue.ts` to prevent load/modify/save races.
- **`.soarignore`**: New projects get a default `.soarignore`. Orphan-file discovery and datamap validation both respect it.

## Project file format

`.vsa.json` (VisualSoar schema version 6) is the canonical project file. It contains both the datamap graph (`vertices` with typed edges) and the layout tree (operators, files, folders). Compatible with VisualSoar 9.6.4.

## Data persistence locations

| What | Where |
|------|-------|
| Project file | `.vsa.json` next to the agent's source files |
| Active project (MCP) | `.vscode/soar-active-project.json` |
| MCP server registration | `.vscode/mcp.json` |

## Test structure

Unit tests use mocha with `ts-node` directly — no VS Code needed. Test bootstrap is `test/helpers/index.ts` (sets up the VS Code mock at `test/helpers/vscode-mock.ts`).

| Test area | Location |
|-----------|----------|
| LSP/datamap validation | `test/lsp/datamap/helpers/` |
| Datamap integrity + deletion | `test/lsp/datamap/helpers/datamap-integrity.test.ts` |
| Linked attributes | `test/lsp/datamap/helpers/linked-attributes.test.ts` |
| Parent reassignment | `test/datamap-manipulation/fixtures/parent-reassignment.test.ts` |
| Layout operations | `test/layout/` |
| MCP tools | `test/mcp/helpers/` |
| Completions | `test/lsp/completions/helpers/` |
| Integration (VS Code host) | `test/integration/` — run via `npm run test:ci` |
