# Agent Instructions

## Purpose

This repository uses `llm.txt` as a project index for coding agents. It must stay accurate.

## Mandatory Rule

Whenever you change architecture, commands, settings, file locations, feature
behavior, MCP tools, validation behavior, or test layout, you MUST update
`llm.txt` in the same change.

## When to update `llm.txt`

Update `llm.txt` if any of these change:

- new feature/module added or removed
- files moved/renamed
- command IDs or settings added/changed/removed
- MCP tools/schemas/names/logging changed
- data persistence locations changed (`.vscode/*`, project file semantics)
- build/test commands or test structure changed

## How to update

1. Scan affected files in `src/`, `package.json`, and `test/`.
2. Update only relevant sections in `llm.txt` (keep it concise but complete).
3. Ensure file paths and behavior summaries remain correct.
4. If uncertain, prefer explicitly stating assumptions in `llm.txt` rather than leaving stale content.

## Quality bar for `llm.txt`

- Treat `llm.txt` as an index, not a dump.
- Keep sections actionable: “where to look” + “what it does”.
- Avoid speculative or outdated statements.
- For MCP, point to the canonical files (`src/mcp/soarMcpTools.ts`,
  `src/mcp/soarMcpServer.ts`, `src/mcp/soarMcpCore.ts`,
  `src/mcp/mcpRegistration.ts`) instead of duplicating full contracts.
