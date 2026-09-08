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
NODE_OPTIONS="--import tsx --import ./test/helpers/register-vscode-mock.mjs" npx mocha --ui tdd test/helpers/index.ts test/lsp/datamap/helpers/datamap.test.ts
```

The pre-commit hook (`npm run precommit`) runs format, lint, and markdown lint — these are enforced before every commit.

## Build system

The project is authored as ES modules (`package.json` has `"type": "module"`, `tsconfig.json` uses `"module"`/`"moduleResolution": "NodeNext"`) — every relative import needs an explicit `.js` extension, and `__dirname`/`__filename` aren't available (use `path.dirname(fileURLToPath(import.meta.url))`, as in `src/server/projectLoader.ts`). This is unrelated to the packaged output format below — it's how the TypeScript source itself is written.

Three separate esbuild bundles are produced into `dist/`, all still `format: 'cjs'` (VS Code's extension host loads `dist/extension.js` via `require()`, and the MCP server is spawned as a plain child process):

- `extension.js` — VS Code extension host entry (`src/extension.ts`)
- `server.js` — LSP language server (`src/server/soarLanguageServer.ts`)
- `mcpServer.js` — Standalone MCP stdio server (`src/mcp/soarMcpServer.ts`)

`esbuild.cjs` (the build script itself is CJS, hence the `.cjs` extension — it would be treated as ESM otherwise and its top-level `require()` calls would fail) writes a `dist/package.json` with `{ "type": "commonjs" }` after every build (`distPackageJsonPlugin`), so Node treats the bundles as CJS despite the root `package.json`'s `"type": "module"`. It also defines `import.meta.url` → a `banner`-injected `importMetaUrl` const computed from the CJS wrapper's real `__filename` (esbuild does not auto-shim `import.meta.url` for `format: 'cjs'` — it warns and leaves it `{}` — so this define+banner pair is required, not optional, for `projectLoader.ts`'s schema-path resolution to work in the bundled output). `eslint.config.cjs` is likewise `.cjs` for the same require()-must-stay-CJS reason.

`tsc` (via `compile-server`) compiles everything to `out/` for type-checking. Unit tests run the TypeScript source directly via `tsx` (`--import tsx`, see the `test` script) rather than `out/` or `dist/`. The `dist/` bundles are what VS Code actually runs.

## Architecture

**`src/extension.ts`** is the single wiring point: registers all commands, wires tree view providers, sets up the LSP client, installs validation-on-save triggers (respecting `.soarignore`), registers the debug adapter for `soar-sml`, and registers the `soar.setupMcpServer` command (MCP registration is user-triggered, not automatic on activation). It also invalidates the `.soarignore` cache via a `FileSystemWatcher` + `soarIgnoreCache` module variable.

**Project state** is modeled as a `ProjectContext` (defined in `src/server/visualSoarProject.ts`), containing the parsed `.vsa.json`, a `datamapIndex: Map<string, DMVertex>`, and a `layoutIndex: Map<string, LayoutNode>`. This object is the shared currency passed across all subsystems.

### Core entry points (where to start)

- Extension entrypoint: `src/extension.ts`
- Types and project schema model: `src/server/visualSoarProject.ts`
- Project load/save + schema validation: `src/server/projectLoader.ts`
- Shared ID generation helper: `src/server/idGeneration.ts` — canonical `generateVertexId` used across datamap/layout/MCP flows

### Subsystem map

| Area                | Key files                                                       | Responsibility                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project I/O         | `src/server/projectLoader.ts`                                   | Load/save `.vsa.json`, build indices                                                                                                                                |
| Project discovery   | `src/projectManager.ts`                                         | Scan for `.vsa.json`, manage active project, persist to `.vscode/soar-active-project.json`                                                                          |
| LSP server          | `src/server/soarLanguageServer.ts`, `soarParser.ts`             | Parse Soar productions, provide diagnostics                                                                                                                         |
| LSP client          | `src/client/lspClient.ts`                                       | Bridge extension ↔ server                                                                                                                                           |
| Datamap tree        | `src/datamap/datamapTreeProvider.ts`                            | Tree rendering, cycle detection, search/sort                                                                                                                        |
| Datamap CRUD (core) | `src/datamap/datamapOperations.ts`                              | Pure, no-`vscode`-import CRUD logic (`deleteAttributeCore`, `removeVertexRecursive`, `saveProject`); runs in both the extension host and the standalone MCP process |
| Datamap CRUD (UI)   | `src/datamap/datamapOperationsUi.ts`                            | Interactive add/edit/delete/link flows (quick-pick/input-box prompts); imports `vscode`, so used only from `src/extension.ts`, never from MCP                       |
| Datamap validation  | `src/datamap/datamapValidator.ts`                               | Validate `.soar` files against datamap; pure logic, no `vscode` import                                                                                              |
| Datamap diagnostics | `src/datamap/datamapDiagnostics.ts`                             | Converts `ValidationError[]` to VS Code `Diagnostic[]`; imports `vscode`, extension-host-only                                                                       |
| Datamap integrity   | `src/datamap/datamapMetadata.ts`                                | `DatamapMetadataCache.checkLinkedAttributeIntegrity` — dangling/unreachable edge detection                                                                          |
| Datamap usage       | `src/datamap/datamapUsage.ts`                                   | `DatamapUsageAnalyzer.analyzeDatamapUsage` — datamap edges classified by tested/created usage across all `.soar` files (VisualSoar-style sweeps)                    |
| Layout tree         | `src/layout/layoutTreeProvider.ts`, `layoutOperations.ts`       | Project structure CRUD                                                                                                                                              |
| Project sync        | `src/layout/projectSync.ts`                                     | Find/import orphaned `.soar` files; respects `.soarignore`                                                                                                          |
| `.soarignore`       | `src/layout/soarIgnore.ts`                                      | Gitignore-semantics file exclusion (`ignore` npm package)                                                                                                           |
| Project creation    | `src/layout/projectCreator.ts`                                  | Creates new project, writes default `.soarignore`                                                                                                                   |
| Undo/redo           | `src/layout/undoManager.ts`                                     | Undo stack for layout+datamap ops                                                                                                                                   |
| Debug adapter       | `src/debug/soarSmlDebugAdapter.ts`, `smlSocketClient.ts`        | DAP↔SML XML socket bridge for live Soar kernel debugging                                                                                                            |
| Stop phase view     | `src/debug/stopPhaseTreeProvider.ts`                            | Sidebar for selecting Soar stop phase                                                                                                                               |
| MCP server          | `src/mcp/soarMcpServer.ts`, `soarMcpTools.ts`, `soarMcpCore.ts` | Exposes project/datamap/runtime tools over MCP stdio                                                                                                                |
| MCP registration    | `src/mcp/mcpRegistration.ts`                                    | Writes MCP entry to `.vscode/mcp.json` and `.mcp.json`, run via `soar.setupMcpServer`                                                                               |
| ID generation       | `src/server/idGeneration.ts`                                    | `generateVertexId()` — shared canonical hex-string ID generator                                                                                                     |

### Key design invariants

- **`generateVertexId`** from `src/server/idGeneration.ts` is the single source for new vertex/node IDs. Use it everywhere — not inline Math.random or uuid.
- **`deleteAttributeCore`** in `datamapOperations.ts` is the pure (no-UI) deletion path. Both the interactive command and MCP delegate to it.
- **`vscode` import boundary**: `datamapOperations.ts` and `datamapValidator.ts` are pure logic with no `vscode` import (so they load safely in the standalone MCP process, run via `tsx`/bundled by esbuild without a real `vscode` module present). Their interactive/VS-Code-rendering counterparts — `datamapOperationsUi.ts` (prompts/quick-picks) and `datamapDiagnostics.ts` (`Diagnostic` construction) — do import `vscode` and are wired in only from `src/extension.ts`. When adding a new datamap operation, put the core logic in the non-UI file and only the prompts/notifications in the UI file, rather than reaching for a lazy `require('vscode')`/`Proxy` shim.
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
  - search filter: `setSearchFilter(text)` / `searchFilter` — filters children by attribute name AND by enumeration value, so a search matches an operator's displayed `^name` (e.g. `move-block`), not just the `operator` edge name (`edgeMatchesFilter` recurses into `ENUMERATION` choices). A single persistent search field — a webview view (`soarSearch`, `src/soarSearchViewProvider.ts`) pinned to the bottom of the Soar sidebar — drives the filter on BOTH the datamap and layout (`LayoutTreeProvider.setSearchFilter`) trees at once, updating the `soar.datamapSearchActive` / `soar.layoutSearchActive` context keys. It replaces the old focus-stealing input-box popups: the `soar.searchDatamap` / `soar.clearDatamapSearch` / `soar.searchLayout` / `soar.clearLayoutSearch` commands and their toolbar buttons were removed.
  - sort: children are always sorted by type priority (SOAR_ID → ENUMERATION → INTEGER → FLOAT → STRING → JAVA_FILE) then alphabetically by display name. Operator edges are all named `operator`, so they tie-break on the operator's `^name` enumeration (via `getOperatorName`) rather than staying in datamap order. The layout tree (`layoutTreeProvider.ts`) applies the same type-then-name sort using each node's real `name`.
  - inline high-level-operator substate expansion: when setting `soar.datamap.expandHighLevelOperators` is `true`, a high-level operator's substate datamap (a disconnected subgraph reachable only via the layout node's `dmId`) is shown inline as a `<name> (substate)` child directly under its operator vertex, so the full datamap is navigable without switching the datamap root. Operator vertices are matched to layout `HIGH_LEVEL_OPERATOR`/`HIGH_LEVEL_FILE_OPERATOR` nodes by operator name (`buildHighLevelSubstateMap` → `highLevelSubstates`, resolved per-edge by `resolveSubstateRoot`). Default `false` for VisualSoar compatibility. The ancestor set is the cycle guard, so `^superstate`/`^top-state` back-references and nested substates are flagged `(cycle)` instead of recursing infinitely. `src/extension.ts` refreshes the tree on `onDidChangeConfiguration` for this key.
- `src/datamap/datamapOperations.ts` (pure, no `vscode` import) and `src/datamap/datamapOperationsUi.ts` (interactive, extension-host-only)
  - add/edit/delete attributes — the interactive flows (prompts, quick-picks, confirmations) live in `datamapOperationsUi.ts`; `deleteAttributeCore`/`removeVertexRecursive`/`collectSubtreeIds`/`saveProject` stay in `datamapOperations.ts` since they're also called from the MCP process
  - edit flow supports updating enumeration values (e.g., `^impasse` choices)
  - edit flow supports parent reassignment:
    - `Change Parent`: move attribute (and referenced subtree) to a new SOAR_ID parent
    - `Change Parent + Link`: move ownership and keep a linked reference on previous parent
  - linked attribute operations: `addLinkedAttribute` lets a vertex link to itself (self-referential/recursive structures, e.g. a linked-list-style `^next` pointing back to the same SOAR_ID vertex), labeled `(self)` in the picker; both `addLinkedAttribute`'s target picker and `getParentDisplayName` (used by the re-parent picker) label a shared/linked vertex using `DatamapMetadataCache.getCanonicalName`, not an ad-hoc scan for the first inbound edge — see below
  - uses shared `generateVertexId` for new datamap vertices
  - datamap persistence and metadata refresh (`DatamapOperations.saveProject`, public so `datamapOperationsUi.ts` can wrap it with a VS Code error notification on failure)
- `src/datamap/datamapMetadata.ts`
  - ownership/link metadata, inbound edge maps, path/attribute helpers

### Datamap validation

- `src/datamap/datamapValidator.ts`
  - validates Soar attributes against datamap
  - variable binding/path checks
  - context-aware operator augmentation check: a `(<var> ^name <const>)` test narrows that variable's bindings to the datamap vertices whose `^name` enumeration includes `<const>` (`applyNameConstraints`); an augmentation on such a name-constrained variable is then flagged when the attribute is absent on every bound vertex even if it exists elsewhere in the datamap (`validateAttributeInContext` + `attributeExistsFromVertices`). Gated to name-constrained, non-`<s>` variables to avoid false positives from imprecise/`^superstate`/root bindings. Covered by `test/lsp/datamap/helpers/operator-context.test.ts`.
  - operator propose/apply consistency check (`validateOperatorProposeApplyConsistency`): an operator attribute _tested_ on the apply side (LHS) but _created_ (RHS) by no rule **anywhere in the project** is flagged ("this rule can never match"). This is project-wide, so it requires `projectContext.operatorAugmentationIndex` — a `Map<operatorName, Set<first-path-segment>>` built by the static `DatamapValidator.buildOperatorAugmentationIndex(documents)` over all project files; the check is skipped when the index is absent (avoids cross-file false positives). It relies on the parser's per-attribute `side: 'lhs' | 'rhs'` field, exempts `^name`/`^operator` and negated tests, compares by first path segment, and dedupes value-expanded entries. The index is built in the MCP project validator (`soarMcpCore.validateProjectAgainstDatamap`), the datamap/legacy test harnesses, and lazily (cached, cleared on save) in `src/extension.ts` (`ensureOperatorAugmentationIndex`). Covered by `test/lsp/datamap/fixtures/vars/vars/missing-attribute-test-in-propose.soar`.
    - `resolveOperatorContext` resolves an operator variable's possible name(s) (`varToNames: Map<var, Set<name>>`) from a literal `(<op> ^name literal)` test, and additionally — for `(<op> ^name <var>)` with a non-literal value — from a disjunction of literals the same production tests `<var>` against elsewhere on the LHS (e.g. `^operation { << add subtract >> <var> }` then `^name <var>`: a common "propose a family of operators from one rule" idiom), attributing the RHS creation to every disjunct.
    - It also tracks `ancestorOperatorVars`: operator variables reached via an ancestor state rather than the production's own `^operator` (either a direct dotted path like `^superstate.operator`, or the same thing decomposed across two conditions, `(<s> ^superstate <ss>) (<ss> ^operator <so>)` — detected as "bound via `^operator` but the parent isn't the state variable"). Such a variable could be populated by whichever rule anywhere in the project (or in a separately-sourced library) proposed the impasse that led here, so both the index builder and the consistency check treat it leniently: creations through it go into a wildcard bucket (index key `''`) that satisfies every operator, and apply-side tests through it are skipped outright rather than flagged.
  - enum value validation
  - infers state context from explicit `^name` tests and, when needed, from layout file location (high-level operator substate ancestry)
  - the state variable is not hardcoded to `<s>`: `SoarParser` records whichever variable is actually bound by the LHS `(state <var> ...)` condition in `SoarProduction.stateVariable` (set in `soarParser.ts`'s `collectFromCst`/`isStateCondition`), and the validator (`resolveInitialStateBindings`, unbound-variable check, `getExplicitStateNames`, `validateAttributeInContext`) and `completionProvider.ts`'s `buildVariableBindings` all key off `production.stateVariable ?? 's'` instead of the literal `'s'`. Covered by `test/lsp/datamap/helpers/state-variable-naming.test.ts`.
  - VS Code diagnostics creation moved to `src/datamap/datamapDiagnostics.ts` (`createDiagnostics(errors)`), so `datamapValidator.ts` itself has no `vscode` import and is safe in the MCP process

### Datamap structural integrity

- `src/datamap/datamapMetadata.ts`
  - ownership/link metadata, inbound edge maps, path/attribute helpers
  - `DatamapMetadataCache.checkLinkedAttributeIntegrity(project, datamapIndex)` — static method; returns `DatamapIntegrityIssue[]` with two kinds:
    - `dangling`: edge whose `toId` is not present in the datamap index at all
    - `unreachable-root`: linked attribute (shared-target edge) whose target vertex cannot be reached from the datamap root via the ownership DFS
  - `DatamapIntegrityIssue` carries `kind`, `parentVertexId`, `attributeName`, `targetVertexId`, and a human-readable `message`
  - called automatically by `validateProjectAgainstDatamap` (result appears in `ValidationSummary.datamapIssues`) and exposed standalone via the MCP tool `datamap_check_integrity`
  - `DatamapMetadataCache.getCanonicalName(vertexId)` — a vertex has no name field of its own in the schema (only inbound edges have names), so a shared/linked vertex's display name is ambiguous whenever more than one attribute points at it. This resolves it deterministically via the vertex's BFS-from-root owner (`getOwner`/`buildOwnershipMap`), not whichever inbound edge is encountered first by array order. Used by `DatamapOperations.addLinkedAttribute`'s target picker and `getParentDisplayName` (re-parent picker) instead of ad-hoc inbound-edge scans. Covered by `test/lsp/datamap/helpers/canonical-name.test.ts`.

### Datamap usage / stale-item detection

- `src/datamap/datamapUsage.ts`

  - `DatamapUsageAnalyzer.analyzeDatamapUsage(project, datamapIndex, documents, options?)` — static; cross-references every datamap attribute edge against all productions and classifies it by whether its name is _tested_ (appears on a condition / LHS) and/or _created_ (appears on an action / RHS). Returns a `DatamapUsageReport` with one `StaleDatamapItem[]` bucket per `DatamapUsageKind`: `neverTestedOrCreated`, `testedNotCreated` (conditions can never match), `createdNotTested` (dead WME), `neverTested`, `neverCreated`. Mirrors VisualSoar's five datamap "search" sweeps.
  - Name-based heuristic (an edge is tested/created if its attribute name appears anywhere as an attribute path segment on the matching side), matching `DatamapValidator`'s conservative "flag only if absent everywhere" philosophy — so a rename/delete that was never cleaned up is caught without false-flagging attributes reached through a different datamap path.
  - `StaleDatamapItem` carries `parentVertexId`, `attributeName`, `targetVertexId`, a best-effort dotted `path` from the datamap root (BFS), the `kind`, and a human-readable `message`.
  - `ARCHITECTURAL_ATTRIBUTES` (exported set: `superstate`, `top-state`, `type`, `impasse`, `choices`, `item`, `item-count`, `non-numeric`, `quiescence`, `attribute`, `io`, `input-link`, `output-link`, `reward-link`, `epmem`, `smem`, `operator`, `name`) is exempt from every bucket; callers can add more via `options.extraExemptAttributes`. Additionally the `^io.input-link` subtree is exempt from `neverCreated` and the `^io.output-link` subtree from `neverTested` (the environment, not rules, creates the input-link and consumes the output-link) — other buckets unaffected.
  - Thin wrappers: `findStaleDatamapItems` (→ `neverTestedOrCreated`), `findTestedNotCreatedDatamapItems` (→ `testedNotCreated`). Helpers `collectAttributeUsage(documents)` (`{ tested, created }` sets; an attribute with no `side` counts on both), `collectReferencedAttributeNames`, `hasDynamicAttributeTests` are exposed for reuse; a project using `^<var>` dynamic attribute tests can produce false positives.
  - called by `SoarMcpCore.validateProjectAgainstDatamap` (`ValidationSummary.staleDatamapItems` + `.testedNotCreatedDatamapItems`) and by `src/extension.ts` `checkProject` via `runStaleDatamapCheck` (gated by the `soar.datamap.checkStaleItems` setting, default `true`; the "Show Details" report lists stale + tested-but-never-created items inline as warnings). The other three buckets are analyzer-only. Covered by `test/lsp/datamap/helpers/datamap-stale-items.test.ts`.

- Deletion clean-up (`src/datamap/datamapOperations.ts`):
  - `DatamapOperations.removeVertexRecursive` (public static): two-pass strategy — collect full subtree IDs, then sweep every SOAR_ID vertex and strip any outgoing edge pointing into the deleted set, preventing dangling link edges after an owned-vertex deletion
  - `DatamapOperations.deleteAttributeCore(context, parentVertexId, attributeName, removeLinkOnly?)` (public static): pure deletion logic with no VS Code UI calls. Removes the named edge from the parent, determines ownership via `ownerParentId` from edge metadata, calls `removeVertexRecursive` when appropriate, saves the project, and returns `{ parentVertexId, attributeName, targetVertexId, removedAsLinkOnly }`. Used directly by tests and delegated to by both the UI path and MCP layer.
  - `DatamapOperationsUi.deleteAttribute` (public static, in `datamapOperationsUi.ts`): UI path — shows a confirmation dialog (`showWarningMessage`) then delegates to `DatamapOperations.deleteAttributeCore`
  - `SoarMcpCore.deleteAttribute`: thin wrapper — loads context, delegates to `DatamapOperations.deleteAttributeCore`

### Layout / project structure editing

- `src/layout/layoutTreeProvider.ts`
  - `LayoutDragAndDropController` (exported) — drag-and-drop on the `soarLayout` view (mime `application/vnd.code.tree.soarlayout`). Delegates to `LayoutOperations.moveNode`; reloads layout + datamap views after a successful move. Registered via `dragAndDropController` on the tree view in `src/extension.ts`.
- `src/layout/layoutOperations.ts`
  - uses shared `generateVertexId` when creating datamap vertices for layout-driven edits
  - `renameNode` (UI) prompts then delegates to `renameNodeCore(projectContext, nodeId, newName)` (pure, used by tests). Rename now: rejects sibling-name collisions, renames the backing `<name>.soar` file (and, for high-level operators, the substate `<name>/` folder + `<name>_source.soar`) on disk, updates source scripts, and keeps the datamap operator `^name` enumeration in sync (parent-state operator vertex + high-level substate root). Only renames artifacts that follow the standard `<name>.soar`/`<name>/` naming.
  - `moveNode(projectContext, nodeId, targetNodeId, { showMessages? })` — drag-and-drop "full move": re-parents the layout node, moves the backing file(s)/folder on disk (a folder move is a single directory rename of the whole subtree), updates source scripts, and moves the `^operator` datamap edge to the destination state (`moveOperatorEdgeInDatamap`, reusing the existing operator vertex). Dropping onto a plain `OPERATOR`/`IMPASSE_OPERATOR` converts it to high-level first; onto a leaf drops into the leaf's parent. Guards against moving onto self/descendant and destination name collisions. No undo (filesystem moves are not snapshot-reversible).
  - `checkOperatorDatamapSync(projectContext): OperatorSyncIssue[]` — verification step: every `OPERATOR`/`HIGH_LEVEL_OPERATOR` layout node must have a matching `^operator` entry (with a `^name` enumeration including the node name) in its parent state's datamap. Run as part of the combined `soar.checkProject` command (`src/extension.ts` `checkProject`), whose "Show Details" report lists any operator-sync issues inline.
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

The Soar parser is **Chevrotain-based** (not regex). Three files:

- `src/server/soarLexer.ts` — Chevrotain tokens + `soarLexer`. Soar is whitespace-delimited; a `Symbol` starts with a letter/`_`/`*` and excludes the dotted-path `.` and structural chars, so operators (`+ - = < > << >> ! ~ @`), brackets, `^` and `.` only tokenize when not part of a constant run. Token order encodes precedence (e.g. `<<`/Variable before `<`). `Float` (`-?\d*\.\d+`, allowing a leading-zero-elided form like `.3`) is ordered **before** `Dot` so a bare `.3` value lexes as one Float token rather than `Dot`+`Integer` (which would otherwise misparse as a dotted-attribute-path continuation).
- `src/server/soarGrammar.ts` — `SoarGrammar extends CstParser` (recovery enabled). Grammar for one production: `(sp|gp) { name doc? flag* condition* --> action* }`, covering LHS conditions (id-tests, `-^` negation, dotted paths, `<< >>` disjunctions, `{ }` conjunctive/relational tests) and RHS actions (`makeAction`, function calls, preferences). `attributeSegment` also accepts `attributeConjunctiveSegment` — a conjunctive attribute test `^{ test* }` whose body is the full `valueTest*` (per the Soar manual, "all of the tests that can be used for values can also be used for attributes"): a literal/disjunction that constrains the attribute name, a relational/predicate test (`^{ <ta> <> name }` — any attribute except `name`), and/or a variable capturing which name matched. `eslint-disable naming-convention` because the DSL uses uppercase method names.
- `src/server/soarParser.ts` — `SoarParser.parse(uri, content, version)` (unchanged public API → `SoarDocument`). Tokenizes once, isolates each `(sp|gp){…}` block at the token level via `findMatchingCurly` (so top-level CLI commands like `source`/`pushd` are ignored, and braces inside `|…|`/`"…"` strings don't miscount), runs the grammar per block, and walks the CST to build `SoarProduction` (variables, attributes with parent-id context + dotted-path/disjunction/multi-value expansion, function calls). Strictness: lexer errors (scoped to production blocks only), grammar errors (multiple per production via recovery), and unmatched-brace are all emitted as `soar-parser` diagnostics. An unterminated trailing production (while typing) is still best-effort parsed so completion/hover work; its grammar errors are suppressed (only the unmatched-brace diagnostic shows).
  - `expandAttributePaths` reduces an attribute path to zero-or-more static name strings, expanding `<< a b >>` disjunctions and conjunctive segments (`conjunctiveAttributeLiterals` extracts positive-equality constraints from a `^{ … }` body — bare constants and inner disjunctions constrain the name; a relational test like `<> name` or a lone variable does not). When no static name can be derived — a fully-dynamic attribute (`(<id> ^<var> <value>)`), a relational-/variable-only conjunction (`^{ <ta> <> name }`), or a degenerate empty disjunction — it yields the wildcard `''` **rather than an empty result**, so the whole attribute test is never silently dropped by `collectAttribute`. The datamap validator treats `name === ''` as a wildcard: skips existence/enum checks and, for binding, unions the target vertices of all the parent's out-edges (`childTargetVertices`).
  - A bare-variable attribute name (`^<var>`) also records `SoarAttribute.attributeVariable` (`attributePathVariable` in `soarParser.ts`). In Soar a variable in attribute position is bound (it ranges over the parent's attributes and may be dereferenced as an identifier — the default-rules "duplicates table" idiom `(<d> ^<id> <v>) (<id> ^…)`). The validator's first pass binds that variable to the union of the parent's child targets so a later identifier dereference isn't falsely flagged unbound. Covered by `test/lsp/datamap/helpers/conjunctive-attribute.test.ts`.
  - `collectValues` tags each RHS/LHS value with `equality: boolean`; a literal reached through a non-equality relational operator (`<>`, `<`, `>`, `<=`, `>=`, `<=>`) is treated like a negated attribute (`isNegated`) for validation purposes, since it isn't an assertion that the value equals that literal. Values inside a `functionCall` (e.g. `(* .9 <ev>)`) are not collected at all — they're computed at runtime, not literal values of the attribute.
  - `SoarProduction.additionalStateVariables` records variables bound by a second (or further) `(state <var> ...)` idTest in the same production (e.g. a fresh impasse-state test); the validator binds these the same as the primary state variable so they aren't flagged as unbound.
- `src/server/soarLanguageServer.ts`
- `src/client/lspClient.ts`

`chevrotain` is a runtime dependency, bundled into all three esbuild outputs.

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
  - user-triggered only, via the `soar.setupMcpServer` command ("Setup MCP Server") — not run automatically on extension activation
  - writes MCP server command as `node <extension>/dist/mcpServer.js`
  - `SOAR_MCP_WORKSPACE` is set to a portable placeholder, not an absolute path: `${workspaceFolder}` in `.vscode/mcp.json`, `${CLAUDE_PROJECT_DIR:-.}` in `.mcp.json`. The server (`resolveWorkspaceRoot` in `soarMcpCore.ts`) falls back `SOAR_MCP_WORKSPACE` → `CLAUDE_PROJECT_DIR` → `process.cwd()`.

For MCP details (tool names, payloads, logging, and active-project behavior), start in those four files.

Current MCP coverage includes datamap CRUD, datamap structural integrity checks, project-vs-datamap validation (also returns `staleDatamapItems` + `testedNotCreatedDatamapItems` — datamap-usage sweeps), active-project lookup, layout node lookup, layout additions (operator/impasse operator/file/folder), and remote runtime control for running kernels via SML socket:

- `layout_find_nodes` — find layout nodes by `nodeId` (exact) or `name` (case-insensitive substring match); optional `type` filter and `includeChildren` flag; returns `{ matches: LayoutNodeDetail[] }` where each entry has `id`, `type`, `name`, `parentNodeId`, `filePath` (resolved absolute), `folderPath` (resolved absolute for folder/container nodes), and `dmId` (datamap vertex ID when present). Primary use: discover `parentNodeId` values before calling add-\* tools, or resolve file paths for nodes by name.
- `agent_runtime_connect` / `agent_runtime_disconnect`
- `agent_runtime_get_status` — returns `{ running: bool, soarCycleExecuting: bool, host, port, currentAgent }`; `running` is true when the connection is alive; `soarCycleExecuting` is true only while decision cycles are executing
- `agent_runtime_list_agents`
- `agent_runtime_run_decision_cycles` / `agent_runtime_step_decision_cycles` / `agent_runtime_pause` — these return `soarCycleExecuting` (not `isRunning`) in their result
- `agent_runtime_exec_cli` — generic CLI escape hatch for advanced/large-context LLMs
- Individual Soar CLI command tools (for smaller/local LLMs that need explicit schemas):
  - `agent_runtime_cli_production` — `production <subcommand>` (break/excise/find/firing-counts/matches/memory-usage/optimize-attribute/watch)
  - `agent_runtime_cli_print` — `print [options] [target]` (working memory, production memory, stack, GDS). Tool description spells out concrete recipes (e.g. `target="(S1 ^operator)"`, `options="--depth 2 --tree"`) since local models were passing invalid targets like bare `0` or `^operator`. `structuredOutput` defaults to `true` (requests SML `output="structured"` and adds a `names` array — every identifier/timetag in the result — to the response alongside `output` text); pass `structuredOutput: false` for plain `output="raw"` text only. Plumbed through `DebugEvalInput.structuredOutput` → `SoarMcpCore.debugEval`/`runSmlCmdline` → `SmlSocketClient.call({ output: 'structured' })`. Covered by `test/mcp/helpers/print-structured-output.test.ts` (fake framed-XML TCP kernel).
  - `agent_runtime_cli_preferences` — `preferences [options] [identifier [attribute]]`
  - `agent_runtime_cli_epmem` — `epmem [subcommand]` (enable/disable/get/set/stats/timers/viz/print/backup)
  - `agent_runtime_cli_explain_track_operator` — `explain track-operator [<name>|--all]` (track one operator, track all, or list tracked operators)
  - `agent_runtime_cli_explain_untrack_operator` — `explain untrack-operator <name|all>` (exclude one operator from tracking, or disable all-mode)
  - `agent_runtime_cli_explain_operator` — `explain operator <name> [--json]` (decision-cycle explanation data for tracked operators)

## User commands and settings (key extension contract)

See `package.json` (contributes/commands/configuration) and `src/extension.ts` (runtime command wiring).

- Legacy smoke-test command `soar.helloWorld` has been removed from both `package.json` contributions and `src/extension.ts` registrations.
- `soar.checkProject` (title "Check Project") is the single project-wide check. In one pass it runs, over the active project: datamap validation across all `.soar` files (`runDatamapValidation`), LSP diagnostics across all `.soar` files (`runLspValidation`), `DatamapMetadataCache.checkLinkedAttributeIntegrity` (dangling / unreachable-root edges), `LayoutOperations.checkOperatorDatamapSync` (operator ↔ datamap `^operator`/`^name` sync), and `DatamapUsageAnalyzer.analyzeDatamapUsage` (datamap attributes never tested-or-created, and tested-but-never-created — via `runStaleDatamapCheck`, gated by `soar.datamap.checkStaleItems`, default on). Datamap/LSP issues land in the Problems panel; a single summary notification reports counts and a "Show Details" action opens a combined plaintext report (integrity + operator-sync + stale/tested-not-created datamap items listed inline as warnings). Exposed as an icon button in the Datamap view title bar. It replaces the former separate `soar.validateSelectedProjectAgainstDatamap`, `soar.validateSelectedProjectAgainstLsp`, `soar.checkDatamapIntegrity`, and `soar.checkOperatorDatamapSync` commands.
- `soar.validateAgainstDatamap` validates just the active editor's document against the datamap (single-file scope, distinct from `soar.checkProject`).
- Settings: `soar.datamap.expandHighLevelOperators` (bool, default `false`), `soar.datamap.checkStaleItems` (bool, default `true` — enables the stale/unused datamap-item check inside `soar.checkProject`).

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

Unit tests use mocha with `tsx` directly (`--import tsx`) — no VS Code needed. Test bootstrap is `test/helpers/index.ts` (populates the VS Code mock object at `test/helpers/vscode-mock.ts`). Since the extension imports `vscode` via ES `import` (not CJS `require`), the mock is wired in via a Node module customization hook — `test/helpers/vscode-mock-loader.mjs` intercepts the `vscode` specifier and re-exports properties off `globalThis.vscode`, registered by `test/helpers/register-vscode-mock.mjs` (preloaded with `--import`, see the `test` script in `package.json`).

| Test area                    | Location                                                                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LSP/datamap validation       | `test/lsp/datamap/helpers/`                                                                                                                                                                                                               |
| Datamap integrity + deletion | `test/lsp/datamap/helpers/datamap-integrity.test.ts` (uses `DatamapMetadataCache`, `DatamapOperations.deleteAttributeCore`, `ProjectLoader` directly — no MCP dependency)                                                                 |
| Datamap usage / stale items  | `test/lsp/datamap/helpers/datamap-stale-items.test.ts` (`DatamapUsageAnalyzer.analyzeDatamapUsage` + wrappers + `SoarParser`, inline projects)                                                                                            |
| Linked attributes            | `test/lsp/datamap/helpers/linked-attributes.test.ts`                                                                                                                                                                                      |
| Parent reassignment          | `test/datamap-manipulation/fixtures/parent-reassignment.test.ts`                                                                                                                                                                          |
| Layout operations / undo     | `test/layout/`                                                                                                                                                                                                                            |
| MCP tools                    | `test/mcp/helpers/` (queue safety in `tool-execution-queue.test.ts`; ID format regression in `id-generation.test.ts`; enum update coverage in `update-attribute.test.ts`; structured `print` output in `print-structured-output.test.ts`) |
| Completions                  | `test/lsp/completions/helpers/`                                                                                                                                                                                                           |
| Legacy project compatibility | `test/legacy-agents/`                                                                                                                                                                                                                     |
| Integration (VS Code host)   | `test/integration/` — run via `npm run test:ci`                                                                                                                                                                                           |
| Manual debug launch setups   | `test/.vscode/launch.json` (Extension Host launch + `soar-sml` socket debug config for local end-to-end adapter checks)                                                                                                                   |

`test/legacy-agents/helpers/project-validation.test.ts` auto-discovers every `.vsa.json` under the `test/legacy-agents/Agents` git submodule and validates each project's datamap against its own `.soar` files. For the project-wide operator propose/apply consistency check, it also resolves `pushd <dir>` / `source <file>` directives starting from each project's `_firstload.soar` (`resolveSourcedFiles`) so rules defined in a separately-sourced sibling library (e.g. a blocks-world variant sourcing `default/selection.soar`) are counted — those extra files feed the augmentation index only, not the project's own per-file error list.

## Agent usage guidance

When asked to modify behavior, first map the request to one of the sections above and open those files before changing code. Prefer reusing existing core logic (especially in datamap and project loader flows) rather than creating parallel implementations.
