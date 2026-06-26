# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other coding
agents when working in this repository. It is the single authoritative index
for the project — there is no separate `llm.txt` or `AGENTS.md`.

## Mandatory: keep this file in sync

`CLAUDE.md` is the project index. Treat it as an index, not a dump: every
section should answer "where to look" + "what it does". Whenever you change
architecture, commands, settings, file locations, feature behavior, MCP tools,
validation behavior, or test layout, you **must** update `CLAUDE.md` in the same
change.

Update `CLAUDE.md` if any of these change:

- new feature/module added or removed
- files moved/renamed
- command IDs or settings added/changed/removed
- MCP tools/schemas/names/logging changed
- data persistence locations changed (`.vscode/*`, project file semantics)
- build/test commands or test structure changed

How to update: scan the affected files in `src/`, `package.json`, and `test/`;
update only the relevant sections; keep file paths and behavior summaries
correct; avoid speculative or outdated statements. If uncertain, state the
assumption explicitly rather than leaving stale content. For MCP, point to the
canonical files (`src/mcp/soarMcpTools.ts`, `src/mcp/soarMcpServer.ts`,
`src/mcp/soarMcpCore.ts`, `src/mcp/mcpRegistration.ts`) instead of duplicating
full contracts.

## What this extension does

Soar language support in VS Code with:

- syntax highlighting
- language server integration
- datamap editing and validation
- VisualSoar project structure editing
- project creation/sync/validation
- MCP server for LLM/agent workflows
- socket-based debug adapter integration for remote Soar kernel control (SML XML)

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
npm run changelog     # Regenerate CHANGELOG.md from git history (git-cliff)
```

### Cutting a release

Releases are tag-driven. Run one of:

```bash
npm version patch   # or: minor | major | <explicit version>
```

This triggers the npm version lifecycle:

- `preversion` — runs `npm run lint && npm test`
- bumps `package.json`/`package-lock.json`
- `version` — regenerates `CHANGELOG.md` via `git-cliff --tag <new version>` and stages it into the version commit
- npm creates the commit + tag (no `v` prefix; enforced by `.npmrc` `tag-version-prefix=""` so tags match the CI `*.*.*` trigger)
- `postversion` — `git push --follow-tags`

Pushing the tag runs the `release` job in `.github/workflows/ci.yml`, which packages the VSIX and creates a GitHub Release with notes from `git-cliff --latest`.

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

**`src/extension.ts`** is the single wiring point: registers all commands, wires tree view providers, sets up the LSP client, installs validation-on-save triggers (respecting `.soarignore`), registers the debug adapter for `soar-sml`, and runs the MCP auto-registration hook. It also invalidates the `.soarignore` cache via a `FileSystemWatcher` + `soarIgnoreCache` module variable.

**Project state** is modeled as a `ProjectContext` (defined in `src/server/visualSoarProject.ts`), containing the parsed `.vsa.json`, a `datamapIndex: Map<string, DMVertex>`, and a `layoutIndex: Map<string, LayoutNode>`. This object is the shared currency passed across all subsystems.

### Core entry points (where to start)

- Extension entrypoint: `src/extension.ts`
- Types and project schema model: `src/server/visualSoarProject.ts`
- Project load/save + schema validation: `src/server/projectLoader.ts`
- Shared ID generation helper: `src/server/idGeneration.ts` — canonical `generateVertexId` used across datamap/layout/MCP flows

### Subsystem map

| Area               | Key files                                                       | Responsibility                                                                             |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Project I/O        | `src/server/projectLoader.ts`                                   | Load/save `.vsa.json`, build indices                                                       |
| Project discovery  | `src/projectManager.ts`                                         | Scan for `.vsa.json`, manage active project, persist to `.vscode/soar-active-project.json` |
| LSP server         | `src/server/soarLanguageServer.ts`, `soarParser.ts`             | Parse Soar productions, provide diagnostics                                                |
| LSP client         | `src/client/lspClient.ts`                                       | Bridge extension ↔ server                                                                 |
| Datamap tree       | `src/datamap/datamapTreeProvider.ts`                            | Tree rendering, cycle detection, search/sort                                               |
| Datamap CRUD       | `src/datamap/datamapOperations.ts`                              | Add/edit/delete attributes; `deleteAttributeCore` (no UI) used by both UI path and MCP     |
| Datamap validation | `src/datamap/datamapValidator.ts`                               | Validate `.soar` files against datamap; creates VS Code diagnostics                        |
| Datamap integrity  | `src/datamap/datamapMetadata.ts`                                | `DatamapMetadataCache.checkLinkedAttributeIntegrity` — dangling/unreachable edge detection |
| Layout tree        | `src/layout/layoutTreeProvider.ts`, `layoutOperations.ts`       | Project structure CRUD                                                                     |
| Project sync       | `src/layout/projectSync.ts`                                     | Find/import orphaned `.soar` files; respects `.soarignore`                                 |
| `.soarignore`      | `src/layout/soarIgnore.ts`                                      | Gitignore-semantics file exclusion (`ignore` npm package)                                  |
| Project creation   | `src/layout/projectCreator.ts`                                  | Creates new project, writes default `.soarignore`                                          |
| Undo/redo          | `src/layout/undoManager.ts`                                     | Undo stack for layout+datamap ops                                                          |
| Debug adapter      | `src/debug/soarSmlDebugAdapter.ts`, `smlSocketClient.ts`        | DAP↔SML XML socket bridge for live Soar kernel debugging                                  |
| Stop phase view    | `src/debug/stopPhaseTreeProvider.ts`                            | Sidebar for selecting Soar stop phase                                                      |
| MCP server         | `src/mcp/soarMcpServer.ts`, `soarMcpTools.ts`, `soarMcpCore.ts` | Exposes project/datamap/runtime tools over MCP stdio                                       |
| MCP registration   | `src/mcp/mcpRegistration.ts`                                    | Writes MCP entry to `.vscode/mcp.json` and `.mcp.json`                                     |
| ID generation      | `src/server/idGeneration.ts`                                    | `generateVertexId()` — shared canonical hex-string ID generator                            |

### Key design invariants

- **`generateVertexId`** from `src/server/idGeneration.ts` is the single source for new vertex/node IDs. Use it everywhere — not inline Math.random or uuid.
- **`deleteAttributeCore`** in `datamapOperations.ts` is the pure (no-UI) deletion path. Both the interactive command and MCP delegate to it.
- **MCP per-project serialization**: `soarMcpServer.ts` serializes concurrent tool calls per `projectFile` via `toolExecutionQueue.ts` to prevent load/modify/save races.
- **`.soarignore`**: New projects get a default `.soarignore`. Orphan-file discovery and datamap validation both respect it.
- Prefer reusing existing core logic (especially in datamap and project loader flows) rather than creating parallel implementations.

## Feature map: where to look for specific code

### Project management and active project state

- `src/projectManager.ts`
  - project discovery (`.vsa.json` scanning)
  - active project selection/restore/clear
  - active-project persistence for MCP: `.vscode/soar-active-project.json`
  - project validation diagnostics (missing/orphaned files)
  - orphaned-file diagnostics respect `.soarignore` (via `ProjectSync`)

### Datamap tree + CRUD

- `src/datamap/datamapTreeProvider.ts`
  - datamap tree rendering and root switching
  - search filter: `setSearchFilter(text)` / `searchFilter` — filters children by attribute name; toggled via `soar.searchDatamap` / `soar.clearDatamapSearch` commands; VS Code context key `soar.datamapSearchActive` drives toolbar icon swap
  - sort mode: `setSortEnabled(bool)` / `sortEnabled` — sorts children by type priority (SOAR_ID → ENUMERATION → INTEGER → FLOAT → STRING → JAVA_FILE) then alphabetically; toggled via `soar.toggleDatamapSort` / `soar.disableDatamapSort`; VS Code context key `soar.datamapSortEnabled`
  - inline high-level-operator substate expansion: when setting `soar.datamap.expandHighLevelOperators` is `true`, a high-level operator's substate datamap (a disconnected subgraph reachable only via the layout node's `dmId`) is shown inline as a `<name> (substate)` child directly under its operator vertex, so the full datamap is navigable without switching the datamap root. Operator vertices are matched to layout `HIGH_LEVEL_OPERATOR`/`HIGH_LEVEL_FILE_OPERATOR` nodes by operator name (`buildHighLevelSubstateMap` → `highLevelSubstates`, resolved per-edge by `resolveSubstateRoot`). Default `false` for VisualSoar compatibility. The ancestor set is the cycle guard, so `^superstate`/`^top-state` back-references and nested substates are flagged `(cycle)` instead of recursing infinitely. `src/extension.ts` refreshes the tree on `onDidChangeConfiguration` for this key.
- `src/datamap/datamapOperations.ts`
  - add/edit/delete attributes
  - edit flow supports updating enumeration values (e.g., `^impasse` choices)
  - edit flow supports parent reassignment:
    - `Change Parent`: move attribute (and referenced subtree) to a new SOAR_ID parent
    - `Change Parent + Link`: move ownership and keep a linked reference on previous parent
  - linked attribute operations
  - uses shared `generateVertexId` for new datamap vertices
  - datamap persistence and metadata refresh
- `src/datamap/datamapMetadata.ts`
  - ownership/link metadata, inbound edge maps, path/attribute helpers

### Datamap validation

- `src/datamap/datamapValidator.ts`
  - validates Soar attributes against datamap
  - variable binding/path checks
  - enum value validation
  - infers `<s>` state context from explicit `^name` tests and, when needed, from layout file location (high-level operator substate ancestry)
  - VS Code diagnostics creation (with non-VSCode-safe fallback used by MCP)

### Datamap structural integrity

- `src/datamap/datamapMetadata.ts`
  - ownership/link metadata, inbound edge maps, path/attribute helpers
  - `DatamapMetadataCache.checkLinkedAttributeIntegrity(project, datamapIndex)` — static method; returns `DatamapIntegrityIssue[]` with two kinds:
    - `dangling`: edge whose `toId` is not present in the datamap index at all
    - `unreachable-root`: linked attribute (shared-target edge) whose target vertex cannot be reached from the datamap root via the ownership DFS
  - `DatamapIntegrityIssue` carries `kind`, `parentVertexId`, `attributeName`, `targetVertexId`, and a human-readable `message`
  - called automatically by `validateProjectAgainstDatamap` (result appears in `ValidationSummary.datamapIssues`) and exposed standalone via the MCP tool `datamap_check_integrity`
- Deletion clean-up (`src/datamap/datamapOperations.ts`):
  - `DatamapOperations.removeVertexRecursive` (public static): two-pass strategy — collect full subtree IDs, then sweep every SOAR_ID vertex and strip any outgoing edge pointing into the deleted set, preventing dangling link edges after an owned-vertex deletion
  - `DatamapOperations.deleteAttributeCore(context, parentVertexId, attributeName, removeLinkOnly?)` (public static): pure deletion logic with no VS Code UI calls. Removes the named edge from the parent, determines ownership via `ownerParentId` from edge metadata, calls `removeVertexRecursive` when appropriate, saves the project, and returns `{ parentVertexId, attributeName, targetVertexId, removedAsLinkOnly }`. Used directly by tests and delegated to by both the UI path and MCP layer.
  - `DatamapOperations.deleteAttribute` (public static): UI path — shows a confirmation dialog (`showWarningMessage`) then delegates to `deleteAttributeCore`
  - `SoarMcpCore.deleteAttribute`: thin wrapper — loads context, delegates to `DatamapOperations.deleteAttributeCore`

### Layout / project structure editing

- `src/layout/layoutTreeProvider.ts`
  - `LayoutDragAndDropController` (exported) — drag-and-drop on the `soarLayout` view (mime `application/vnd.code.tree.soarlayout`). Delegates to `LayoutOperations.moveNode`; reloads layout + datamap views after a successful move. Registered via `dragAndDropController` on the tree view in `src/extension.ts`.
- `src/layout/layoutOperations.ts`
  - uses shared `generateVertexId` when creating datamap vertices for layout-driven edits
  - `renameNode` (UI) prompts then delegates to `renameNodeCore(projectContext, nodeId, newName)` (pure, used by tests). Rename now: rejects sibling-name collisions, renames the backing `<name>.soar` file (and, for high-level operators, the substate `<name>/` folder + `<name>_source.soar`) on disk, updates source scripts, and keeps the datamap operator `^name` enumeration in sync (parent-state operator vertex + high-level substate root). Only renames artifacts that follow the standard `<name>.soar`/`<name>/` naming.
  - `moveNode(projectContext, nodeId, targetNodeId, { showMessages? })` — drag-and-drop "full move": re-parents the layout node, moves the backing file(s)/folder on disk (a folder move is a single directory rename of the whole subtree), updates source scripts, and moves the `^operator` datamap edge to the destination state (`moveOperatorEdgeInDatamap`, reusing the existing operator vertex). Dropping onto a plain `OPERATOR`/`IMPASSE_OPERATOR` converts it to high-level first; onto a leaf drops into the leaf's parent. Guards against moving onto self/descendant and destination name collisions. No undo (filesystem moves are not snapshot-reversible).
  - `checkOperatorDatamapSync(projectContext): OperatorSyncIssue[]` — verification step: every `OPERATOR`/`HIGH_LEVEL_OPERATOR` layout node must have a matching `^operator` entry (with a `^name` enumeration including the node name) in its parent state's datamap. Surfaced via command `soar.checkOperatorDatamapSync` (`src/extension.ts` `checkOperatorDatamapSync` — notification + "Show Details" plaintext report; also a `soarLayout` view title button).
  - add-operator/impasse/file/folder now reject a duplicate sibling name (case-insensitive) up front via `findChildByName`, returning `{ success: false, error }` and an explicit error notification instead of silently failing or producing inconsistent state.
- `src/layout/projectSync.ts`
  - shared project-file gathering helpers (including existing `.soar` collection) reused by project-wide datamap validation flows
  - `findOrphanedFiles()` loads `.soarignore` via `soarIgnore.ts` and skips matching files before returning
- `src/layout/soarIgnore.ts`
  - `loadSoarIgnore(projectRoot)` – reads `.soarignore` (next to `.vsa.json`) using gitignore semantics (`ignore` npm package); returns an `Ignore` instance (empty = nothing ignored if file absent)
  - `isIgnoredByPatterns(ig, relativePath)` – returns true if the path should be excluded
  - `DEFAULT_SOARIGNORE_CONTENT` – template written to new projects
- `src/layout/projectCreator.ts`
  - creates a default `.soarignore` file in the project root on project creation
- `src/layout/undoManager.ts`

### Soar parsing and language server

- `src/server/soarParser.ts`
- `src/server/soarLanguageServer.ts`
- `src/client/lspClient.ts`

### Debug adapter (SML socket transport)

- `src/debug/smlSocketClient.ts`
  - strongly typed SML XML socket client
  - 4-byte big-endian length framing
  - call/response correlation via `ack`
  - auto-reply for inbound `doctype=call` messages
  - persistent socket behavior (no user-configurable idle timeout)
- `src/debug/soarSmlDebugAdapter.ts`
  - inline DAP adapter implementation (`vscode.DebugAdapter`)
  - DAP→SML mapping for initialize/launch/threads/stackTrace/scopes/variables/continue/next/stepIn/stepOut/pause/evaluate/disconnect
  - DAP thread model maps one thread per Soar agent discovered from `get_agent_list`
  - DAP call stack maps to goal-stack states per selected thread/agent and is recomputed on stop/stack requests; frames are returned current→root so VS Code auto-selects current state
  - stable identity maps preserve deterministic IDs across session lifetime: agent→threadId, state→frameId, objectKey→variablesReference
  - advertises DAP `supportsInvalidatedEvent` and emits `invalidated` (`all`) after each stop to force Watch/Variables/UI refresh
  - `scopes` returns `Working Memory`, `Operator`, and `IO Link` sections for each selected state frame
  - Variables section targets: `Working Memory` uses `print <state> -d <printDepth> -t`, `Operator` uses `print <o> -d <printDepth> -t`, and `IO Link` uses `print I1 -d <printDepth> -t`
  - Variables depth is user-configurable via debug configuration `printDepth`
  - `variables` resolves structured WMEs (identifier-expansion via stable references) from section/identifier contexts
  - always emits an initial `stopped` event on connect to select first stack frame automatically
  - stop transitions (`entry`/`step`/`pause`) emit `preserveFocusHint: false` so VS Code focuses the newest selected frame
  - no editable Variables entries; command interaction is handled via Watch/Debug Console evaluate requests
  - applies configurable `printDepth` (`-d`) and `printTree` (`-t`) formatting to Variables and Watch print rendering
  - watch evaluation is frame-context aware (`frameId`→state) and returns stable identifier references when possible
  - watch evaluation is fault-tolerant: retries once on transient post-step failures and returns `<unavailable: ...>` value (success response) instead of DAP error
  - execution mapping uses `cmdline run` for continue and `cmdline stop` on pause when session is running
  - `evaluate` forwards Debug Console (`repl` context) input directly as Soar CLI command text and resolves non-REPL expressions in frame context
  - supports custom request `soarSetVariablesDepth` to update Variables depth at runtime and emit `invalidated` for variables
  - debug configuration provider + descriptor factory for debug type `soar-sml`
- `src/debug/stopPhaseTreeProvider.ts`
  - sidebar tree data provider for stop-phase selection with phases `input`, `proposal`, `decision`, `apply`, `output`
  - defaults selection to `apply` (Soar default stop-before phase)
  - parses status output from `soar stop-phase` (`Stop before <phase>`) for UI synchronization
  - tracks selected phase in-view and executes `soar.setStopPhase` command from tree items

### MCP / LLM integration

- `src/mcp/soarMcpTools.ts`
  - MCP tool definitions and schemas
- `src/mcp/soarMcpServer.ts`
  - MCP stdio server and request handlers
  - project-scoped tool calls are serialized per `projectFile` to prevent concurrent load/modify/save races
- `src/mcp/soarMcpCore.ts`
  - reusable core operations invoked by MCP tools
  - `datamap_update_attribute_edge` supports enum value updates via optional `enumChoices` for enumeration targets (including impasse value sets)
  - generates VisualSoar-style hex string IDs for new datamap vertices and layout nodes
  - owns persistent SML runtime bridge state for MCP (`agent_runtime_connect` lifecycle, current agent tracking, `soarCycleExecuting`/paused state)
  - `agent_runtime_connect` probes kernel `version` and `get_agent_list` immediately after socket connect; initial agent-list probe depends on connected client state (not pre-existing session state)
  - executes Soar runtime commands over socket via `SmlSocketClient`
- `src/mcp/toolExecutionQueue.ts`
  - keyed async execution queue used by MCP server for safe parallelism
- `src/mcp/mcpRegistration.ts`
  - workspace MCP registration: writes BOTH `.vscode/mcp.json` (VS Code native client, `servers` key) and project-root `.mcp.json` (Claude Code, `mcpServers` key)
  - writes MCP server command as `node <extension>/dist/mcpServer.js`
  - `SOAR_MCP_WORKSPACE` is set to a portable placeholder, not an absolute path: `${workspaceFolder}` in `.vscode/mcp.json`, `${CLAUDE_PROJECT_DIR:-.}` in `.mcp.json`. The server (`resolveWorkspaceRoot` in `soarMcpCore.ts`) falls back `SOAR_MCP_WORKSPACE` → `CLAUDE_PROJECT_DIR` → `process.cwd()`.

For MCP details (tool names, payloads, logging, and active-project behavior), start in those four files.

Current MCP coverage includes datamap CRUD, datamap structural integrity checks, project-vs-datamap validation, active-project lookup, layout node lookup, layout additions (operator/impasse operator/file/folder), and remote runtime control for running kernels via SML socket:

- `layout_find_nodes` — find layout nodes by `nodeId` (exact) or `name` (case-insensitive substring match); optional `type` filter and `includeChildren` flag; returns `{ matches: LayoutNodeDetail[] }` where each entry has `id`, `type`, `name`, `parentNodeId`, `filePath` (resolved absolute), `folderPath` (resolved absolute for folder/container nodes), and `dmId` (datamap vertex ID when present). Primary use: discover `parentNodeId` values before calling add-\* tools, or resolve file paths for nodes by name.
- `agent_runtime_connect` / `agent_runtime_disconnect`
- `agent_runtime_get_status` — returns `{ running: bool, soarCycleExecuting: bool, host, port, currentAgent }`; `running` is true when the connection is alive; `soarCycleExecuting` is true only while decision cycles are executing
- `agent_runtime_list_agents`
- `agent_runtime_run_decision_cycles` / `agent_runtime_step_decision_cycles` / `agent_runtime_pause` — these return `soarCycleExecuting` (not `isRunning`) in their result
- `agent_runtime_exec_cli` — generic CLI escape hatch for advanced/large-context LLMs
- Individual Soar CLI command tools (for smaller/local LLMs that need explicit schemas):
  - `agent_runtime_cli_production` — `production <subcommand>` (break/excise/find/firing-counts/matches/memory-usage/optimize-attribute/watch)
  - `agent_runtime_cli_print` — `print [options] [target]` (working memory, production memory, stack, GDS)
  - `agent_runtime_cli_preferences` — `preferences [options] [identifier [attribute]]`
  - `agent_runtime_cli_epmem` — `epmem [subcommand]` (enable/disable/get/set/stats/timers/viz/print/backup)
  - `agent_runtime_cli_explain_track_operator` — `explain track-operator [<name>|--all]` (track one operator, track all, or list tracked operators)
  - `agent_runtime_cli_explain_untrack_operator` — `explain untrack-operator <name|all>` (exclude one operator from tracking, or disable all-mode)
  - `agent_runtime_cli_explain_operator` — `explain operator <name> [--json]` (decision-cycle explanation data for tracked operators)

## User commands and settings (key extension contract)

See `package.json` (contributes/commands/configuration) and `src/extension.ts` (runtime command wiring).

- Legacy smoke-test command `soar.helloWorld` has been removed from both `package.json` contributions and `src/extension.ts` registrations.
- `soar.validateSelectedProjectAgainstLsp` runs LSP-based checks across all existing project `.soar` files (project-wide Problems panel refresh).
- `soar.checkDatamapIntegrity` runs `DatamapMetadataCache.checkLinkedAttributeIntegrity` on the active project and shows a summary notification; a "Show Details" action opens a plaintext report listing every issue by kind, attribute name, and vertex IDs. The command is also exposed as an icon button in the Datamap view title bar.
- `soar.checkOperatorDatamapSync` runs `LayoutOperations.checkOperatorDatamapSync` on the active project to verify every operator layout node has a matching datamap `^operator` entry; shows a summary notification with a "Show Details" plaintext report. Exposed as an icon button in the Layout (`soarLayout`) view title bar.

Debug contract additions:

- `package.json` contributes debugger type `soar-sml` with launch attributes: `host`, `port`, `agent`, `printDepth`, `printTree`, `stopOnEntry` (`stopOnEntry` retained for compatibility; adapter auto-stops on connect)
- `src/extension.ts` registers debug configuration provider and debug adapter descriptor factory for `soar-sml`
- `package.json` contributes `soarStopPhase` sidebar view and commands `soar.setStopPhase` / `soar.refreshStopPhaseView` / `soar.setVariableViewDepth`
- `soarStopPhase` is contributed to VS Code's built-in Debug view container (not the custom Soar activity container)
- `src/extension.ts` wires stop-phase selection to active `soar-sml` sessions via DAP `evaluate` with `context: repl`, issuing `soar stop-phase <phase>` and queries `soar stop-phase` on debug-start/refresh to reflect current kernel state
- `src/extension.ts` exposes runtime Variables depth control (`soar.setVariableViewDepth`) via custom request `soarSetVariablesDepth` on the active `soar-sml` session

## Project file format

`.vsa.json` (VisualSoar schema version 6) is the canonical project file. It contains both the datamap graph (`vertices` with typed edges) and the layout tree (operators, files, folders). Compatible with VisualSoar 9.6.4.

## Data persistence locations

| What                    | Where                                                    |
| ----------------------- | -------------------------------------------------------- |
| Project file            | `.vsa.json` next to the agent's source files             |
| Active project (MCP)    | `.vscode/soar-active-project.json`                       |
| MCP server registration | `.vscode/mcp.json` (VS Code) + `.mcp.json` (Claude Code) |

Datamap and layout persist into the project file directly.

## Build, test, and quality checks

- Build: `npm run compile`
- Watch: `npm run watch`
- Lint: `npm run lint`
- Unit tests: `npm test`
- VS Code integration tests: `npm run test:ci`
- Markdown lint ignores `CHANGELOG.md` and `CLAUDE.md` via `.markdownlintignore`
- GitHub tag release workflow (`.github/workflows/ci.yml`, `release` job): packages VSIX, generates latest release notes via git-cliff (`cliff.toml`, `--latest`) into `release-notes.md`, and publishes with `softprops/action-gh-release` using `body_path`
  - changelog entries include a short linked commit SHA to the repository commit URL

## Test structure

Unit tests use mocha with `ts-node` directly — no VS Code needed. Test bootstrap is `test/helpers/index.ts` (sets up the VS Code mock at `test/helpers/vscode-mock.ts`).

| Test area                    | Location                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LSP/datamap validation       | `test/lsp/datamap/helpers/`                                                                                                                                               |
| Datamap integrity + deletion | `test/lsp/datamap/helpers/datamap-integrity.test.ts` (uses `DatamapMetadataCache`, `DatamapOperations.deleteAttributeCore`, `ProjectLoader` directly — no MCP dependency) |
| Linked attributes            | `test/lsp/datamap/helpers/linked-attributes.test.ts`                                                                                                                      |
| Parent reassignment          | `test/datamap-manipulation/fixtures/parent-reassignment.test.ts`                                                                                                          |
| Layout operations / undo     | `test/layout/`                                                                                                                                                            |
| MCP tools                    | `test/mcp/helpers/` (queue safety in `tool-execution-queue.test.ts`; ID format regression in `id-generation.test.ts`; enum update coverage in `update-attribute.test.ts`) |
| Completions                  | `test/lsp/completions/helpers/`                                                                                                                                           |
| Legacy project compatibility | `test/legacy-agents/`                                                                                                                                                     |
| Integration (VS Code host)   | `test/integration/` — run via `npm run test:ci`                                                                                                                           |
| Manual debug launch setups   | `test/.vscode/launch.json` (Extension Host launch + `soar-sml` socket debug config for local end-to-end adapter checks)                                                   |

## Agent usage guidance

When asked to modify behavior, first map the request to one of the sections above and open those files before changing code. Prefer reusing existing core logic (especially in datamap and project loader flows) rather than creating parallel implementations.
